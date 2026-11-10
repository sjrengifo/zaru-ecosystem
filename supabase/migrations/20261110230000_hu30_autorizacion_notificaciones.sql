-- HU-30 (ZARU-19): autorización y revocación del tratamiento de datos para notificaciones
-- (Ley 1581 de 2012).
--
-- La tabla consentimientos (HU-51) ya admite los tipos 'notificaciones_servicio' y 'comerciales' y el
-- canal 'enlace_baja', y es de solo inserción: cada otorgamiento o revocación es una fila nueva con
-- fecha, hora, canal y versión de la política (CA4). Esta migración:
--   1. registra las dos autorizaciones al crear el cliente, en la misma transacción (CA1);
--   2. deja constancia del estado de los clientes que ya existían;
--   3. expone la autorización vigente de cada cliente para excluir de las campañas a quien no
--      autorizó promociones (CA2) y respetar la revocación de avisos (CA3).

---------------------------------------------------------------------------
-- 1. Alta de cliente con las tres autorizaciones (CA1)
---------------------------------------------------------------------------
create or replace function public.crear_cliente_con_consentimiento(
  p_establecimiento_id        uuid,
  p_nombre                    text,
  p_telefono                  text,
  p_correo                    text,
  p_autoriza                  boolean,
  p_politica_version          text,
  p_canal                     text,
  p_ip                        inet,
  p_registrado_por            uuid,
  p_autoriza_notificaciones   boolean,
  p_autoriza_comerciales      boolean
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

  -- Las dos casillas de HU-30 son independientes y opcionales: se guarda lo que el titular eligió,
  -- también cuando no autoriza, para tener evidencia de la decisión (CA4).
  insert into consentimientos (establecimiento_id, cliente_id, tipo, otorgado, canal, politica_version, ip, registrado_por)
  values
    (p_establecimiento_id, v_cliente.id, 'tratamiento_datos', true, p_canal, p_politica_version, p_ip, p_registrado_por),
    (p_establecimiento_id, v_cliente.id, 'notificaciones_servicio', coalesce(p_autoriza_notificaciones, false), p_canal, p_politica_version, p_ip, p_registrado_por),
    (p_establecimiento_id, v_cliente.id, 'comerciales', coalesce(p_autoriza_comerciales, false), p_canal, p_politica_version, p_ip, p_registrado_por);

  return next v_cliente;
end $$;

revoke execute on function public.crear_cliente_con_consentimiento(uuid, text, text, text, boolean, text, text, inet, uuid, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.crear_cliente_con_consentimiento(uuid, text, text, text, boolean, text, text, inet, uuid, boolean, boolean)
  to service_role;

-- HU-08: el ingreso con cliente nuevo pasa las dos casillas que llegan en p_cliente. Se reescribe la
-- llamada dentro de crear_orden a partir de su definición vigente (mismo patrón que la migración
-- hu08_corrige_tilde_mensaje): la lógica y los permisos de crear_orden no cambian.
do $$
declare
  v_def text;
  v_nueva text;
begin
  v_def := pg_get_functiondef('public.crear_orden(uuid, uuid, uuid[], text, uuid, jsonb, jsonb)'::regprocedure);
  if position('autorizaNotificaciones' in v_def) > 0 then
    return; -- ya aplicada
  end if;
  v_nueva := regexp_replace(
    v_def,
    '(nullif\(p_cliente->>''ip'', ''''\)::inet,\s*p_creada_por)',
    E'\\1,\n        coalesce((p_cliente->>''autorizaNotificaciones'')::boolean, false),\n        coalesce((p_cliente->>''autorizaComerciales'')::boolean, false)'
  );
  if v_nueva = v_def then
    raise exception 'No se encontró la llamada a crear_cliente_con_consentimiento dentro de crear_orden';
  end if;
  execute v_nueva;
end
$$;

-- La versión de 9 parámetros ya no la usa nadie (clientes.controller y crear_orden pasan 11).
drop function if exists public.crear_cliente_con_consentimiento(uuid, text, text, text, boolean, text, text, inet, uuid);

---------------------------------------------------------------------------
-- 2. Estado de los clientes registrados antes de HU-30 (CA4)
---------------------------------------------------------------------------
-- Aceptaron la política, cuya finalidad 2 es informarles el estado del vehículo: los avisos del
-- servicio quedan autorizados. La finalidad 4 (promociones) exige autorización por separado, que
-- nunca dieron: quedan sin autorizar. Se registra como 'migracion' para distinguirlo en la auditoría.
insert into consentimientos (establecimiento_id, cliente_id, tipo, otorgado, canal, politica_version, created_at)
select c.establecimiento_id, c.id, t.tipo, t.tipo = 'notificaciones_servicio', 'migracion', null, now()
from clientes c
cross join (values ('notificaciones_servicio'), ('comerciales')) as t(tipo)
where not exists (
  select 1 from consentimientos k where k.cliente_id = c.id and k.tipo = t.tipo
);

---------------------------------------------------------------------------
-- 3. Autorización vigente por cliente y tipo (CA2, CA3)
---------------------------------------------------------------------------
-- La última fila de cada tipo es la que vale. security_invoker: respeta la RLS de consentimientos
-- (cada establecimiento solo ve las de sus clientes).
create or replace view public.autorizaciones_vigentes
with (security_invoker = true) as
select distinct on (k.cliente_id, k.tipo)
  k.establecimiento_id,
  k.cliente_id,
  k.tipo,
  k.otorgado,
  k.canal,
  k.politica_version,
  k.created_at
from public.consentimientos k
order by k.cliente_id, k.tipo, k.created_at desc, k.id desc;

revoke all on public.autorizaciones_vigentes from anon;
grant select on public.autorizaciones_vigentes to authenticated, service_role;

comment on view public.autorizaciones_vigentes is
  'HU-30: autorización vigente (la más reciente) de cada cliente por tipo. Las campañas comerciales solo van a quienes tienen comerciales = otorgado (CA2).';
