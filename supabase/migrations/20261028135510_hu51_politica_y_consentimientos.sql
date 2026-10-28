-- HU-51 (ZARU-58): autorización del titular para el tratamiento de datos (Ley 1581 de 2012).
--
-- - politicas_datos: versiones de la política. La vigente es la de mayor vigente_desde que ya empezó.
-- - consentimientos: evidencia inmutable de cada autorización (fecha y hora, versión, canal, IP y usuario).
-- - crear_cliente_con_consentimiento: registra cliente y autorización en una sola transacción.
--   Si no hay autorización o la versión no es la vigente, no se guarda ningún dato personal (CA3).

---------------------------------------------------------------------------
-- Políticas de tratamiento de datos (CA1)
---------------------------------------------------------------------------
create table politicas_datos (
  version       text primary key check (version ~ '^\d+\.\d+$'),
  titulo        text not null,
  contenido     text not null,
  vigente_desde timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

alter table politicas_datos enable row level security;
-- La política es información pública: cualquiera puede leerla (también el cliente final sin sesión).
create policy "politicas visibles para todos" on politicas_datos for select using (true);

-- Una versión publicada no se modifica ni se borra: los cambios son versiones nuevas.
create or replace function privado.impedir_modificacion_politica()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Una versión publicada de la política no se puede modificar ni eliminar; publique una versión nueva'
    using errcode = '42501';
end $$;

create trigger politicas_datos_inmutables
  before update or delete on politicas_datos
  for each row execute function privado.impedir_modificacion_politica();

create or replace function privado.politica_vigente()
returns text language sql stable set search_path = '' as $$
  select version from public.politicas_datos where vigente_desde <= now() order by vigente_desde desc limit 1
$$;

insert into politicas_datos (version, titulo, contenido) values (
  '1.0',
  'Política de tratamiento de datos personales',
  $politica$# Política de tratamiento de datos personales · versión 1.0

**Responsable del tratamiento:** el establecimiento (car wash) afiliado a ZARU donde el titular registra su vehículo.
**Encargado del tratamiento:** ZARU Ecosystem, plataforma tecnológica que opera el servicio por cuenta del establecimiento.

## 1. Datos que se recogen
Nombre, número de celular, correo electrónico (opcional), placa y características del vehículo, e historial de servicios.

## 2. Finalidades
1. Registrar el ingreso del vehículo y prestar el servicio contratado.
2. Informar al titular el estado de su vehículo y avisarle cuando esté listo.
3. Conservar el historial de servicios del vehículo.
4. Enviar promociones del establecimiento, solo si el titular lo autoriza por separado.

## 3. Derechos del titular (artículo 8 de la Ley 1581 de 2012)
Conocer, actualizar y rectificar sus datos; solicitar prueba de esta autorización; ser informado del uso que se da a sus datos; revocar la autorización o pedir la supresión de sus datos cuando no exista un deber legal de conservarlos; y presentar quejas ante la Superintendencia de Industria y Comercio.

## 4. Cómo ejercer los derechos
Directamente en el establecimiento o desde la aplicación del cliente final de ZARU. La solicitud se atiende en los plazos de los artículos 14 y 15 de la Ley 1581 de 2012 (10 días hábiles para consultas y 15 días hábiles para reclamos).

## 5. Seguridad
Los datos se transmiten cifrados (HTTPS) y se almacenan cifrados en reposo. Cada establecimiento solo accede a los datos de sus propios clientes.

## 6. Vigencia
Esta versión rige desde su publicación en la plataforma. La autorización se conserva como evidencia con la fecha, la hora y la versión aceptada.$politica$
);

---------------------------------------------------------------------------
-- Evidencia de autorizaciones (CA2)
---------------------------------------------------------------------------
create table consentimientos (
  id                 bigint generated always as identity primary key,
  establecimiento_id uuid not null,
  cliente_id         uuid not null,
  tipo               text not null default 'tratamiento_datos'
                       check (tipo in ('tratamiento_datos', 'notificaciones_servicio', 'comerciales')),
  otorgado           boolean not null,
  canal              text not null check (canal in ('panel', 'app', 'enlace_baja', 'migracion')),
  politica_version   text references politicas_datos (version),
  ip                 inet,
  registrado_por     uuid,
  created_at         timestamptz not null default now(),
  foreign key (cliente_id, establecimiento_id) references clientes (id, establecimiento_id) on delete cascade,
  -- Toda autorización nueva indica la versión aceptada; solo los registros migrados pueden no tenerla.
  check (politica_version is not null or canal = 'migracion')
);

create index consentimientos_cliente_tipo_fecha_idx on consentimientos (cliente_id, tipo, created_at desc);
create index consentimientos_establecimiento_idx on consentimientos (establecimiento_id, cliente_id);
create index consentimientos_politica_idx on consentimientos (politica_version);

-- Solo inserción: revocar es insertar otorgado = false. Únicamente se eliminan junto con el titular
-- (borrado en cascada del cliente), nunca de forma directa.
create or replace function privado.impedir_modificacion_consentimiento()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old; -- borrado en cascada desde clientes
  end if;
  raise exception 'La evidencia de autorización no se puede modificar ni eliminar' using errcode = '42501';
end $$;

create trigger consentimientos_inmutables
  before update or delete on consentimientos
  for each row execute function privado.impedir_modificacion_consentimiento();

alter table consentimientos enable row level security;
create policy "ver consentimientos" on consentimientos
  for select using (establecimiento_id = privado.mi_establecimiento());

revoke execute on function privado.impedir_modificacion_politica() from public, anon, authenticated;
revoke execute on function privado.impedir_modificacion_consentimiento() from public, anon, authenticated;
revoke execute on function privado.politica_vigente() from public, anon;
grant execute on function privado.politica_vigente() to authenticated, service_role;

-- Clientes registrados antes del versionado: se conserva su autorización con la fecha original.
insert into consentimientos (establecimiento_id, cliente_id, tipo, otorgado, canal, politica_version, created_at)
select establecimiento_id, id, 'tratamiento_datos', true, 'migracion', null, fecha_autorizacion
from clientes where autorizacion_datos;

---------------------------------------------------------------------------
-- Registro atómico de cliente + autorización (CA2, CA3)
---------------------------------------------------------------------------
create or replace function public.crear_cliente_con_consentimiento(
  p_establecimiento_id uuid,
  p_nombre             text,
  p_telefono           text,
  p_correo             text,
  p_autoriza           boolean,
  p_politica_version   text,
  p_canal              text,
  p_ip                 inet,
  p_registrado_por     uuid
) returns setof clientes
language plpgsql security definer set search_path = public as $$
declare
  v_vigente text := privado.politica_vigente();
  v_cliente clientes;
begin
  if p_autoriza is distinct from true then
    raise exception 'La autorización de tratamiento de datos es obligatoria para registrar al cliente'
      using errcode = '23514', hint = 'autorizacionDatos';
  end if;
  if p_politica_version is distinct from v_vigente then
    raise exception 'La versión de la política aceptada (%) no es la vigente (%)', p_politica_version, v_vigente
      using errcode = '23514', hint = 'politica';
  end if;

  insert into clientes (establecimiento_id, nombre, telefono, correo, autorizacion_datos, fecha_autorizacion)
  values (p_establecimiento_id, p_nombre, p_telefono, p_correo, true, now())
  returning * into v_cliente;

  insert into consentimientos (establecimiento_id, cliente_id, tipo, otorgado, canal, politica_version, ip, registrado_por)
  values (p_establecimiento_id, v_cliente.id, 'tratamiento_datos', true, p_canal, p_politica_version, p_ip, p_registrado_por);

  return next v_cliente;
end $$;

-- Solo el backend (service_role) puede llamarla; no se expone a usuarios del panel ni al público.
revoke execute on function public.crear_cliente_con_consentimiento(uuid, text, text, text, boolean, text, text, inet, uuid)
  from public, anon, authenticated;
grant execute on function public.crear_cliente_con_consentimiento(uuid, text, text, text, boolean, text, text, inet, uuid)
  to service_role;
