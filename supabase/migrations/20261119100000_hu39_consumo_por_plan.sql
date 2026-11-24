-- HU-39 (ZARU-28): control de consumo de notificaciones por plan.
--
-- DA-12 propone los cupos iniciales (básico 200 SMS / 1.000 correos, intermedio 600 / 3.000,
-- empresarial 2.000 / 10.000). No se hardcodean en el backend: quedan en `public.planes` para que
-- el administrador de la plataforma pueda ajustarlos sin desplegar código.
-- ATENCIÓN: estos valores son una propuesta sujeta a confirmación formal del Product Owner.
-- NO promover a producción sin esa confirmación (ver specs/backend/06-decisiones-abiertas.md).
--
-- CA1: `consumo_mensual` lleva el acumulado por establecimiento, mes y canal. La RPC
--      `hu39_confirmar_consumo` bloquea la fila y devuelve una sola vez el cruce del 80 % en SMS
--      (`alerta_80_enviada`), aunque lleguen varios SMS en paralelo.
-- CA2: `hu39_reservar_consumo` aparta el cupo ANTES de llamar al proveedor. Con el cupo de SMS
--      agotado devuelve `sin_cupo` y la cola busca un canal alterno; nunca cuenta un intento
--      fallido como envío. La reserva se libera si el proveedor falla.
-- CA3: las mismas filas alimentan el reporte global por establecimiento, plan, mes y canal.
--
-- El periodo se calcula en America/Bogota (primer día del mes). El historial nunca se borra:
-- cada mes es una fila distinta y las FK a `establecimientos` son ON DELETE RESTRICT, de modo
-- que eliminar un establecimiento no puede eliminar su historial de consumo.
-- La migración es idempotente:
--   * CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
--   * Las políticas RLS se crean solo si no existen; si ya existen se valida su definición y
--     se aborta con error antes de reemplazarlas silenciosamente. No se tocan otras políticas
--     del proyecto y en ningún caso se deshabilita RLS.
--   * Las FK se normalizan a RESTRICT solo en las tres tablas de HU-39.
--   * CREATE OR REPLACE FUNCTION va precedido de una guardia que impide sobrescribir una
--     función homónima que no esté identificada como HU-39.
--   * INSERT ... ON CONFLICT DO NOTHING, GRANT/REVOKE y COMMENT son idempotentes.
-- No hay DROP TABLE, TRUNCATE ni DELETE: no se eliminan tablas ni datos.

-- ---------------------------------------------------------------------------
-- Catálogo de planes (única tabla global: es el equivalente a la columna
-- `establecimientos.plan`, no sustituye ni elimina esa columna).
-- ---------------------------------------------------------------------------
create table if not exists public.planes (
  nombre            text primary key,
  cupo_sms_mes      integer not null check (cupo_sms_mes >= 0),
  cupo_correo_mes   integer check (cupo_correo_mes >= 0),
  created_at        timestamptz not null default now(),
  actualizado_at    timestamptz not null default now(),
  constraint planes_nombre_check check (nombre in ('basico', 'intermedio', 'empresarial'))
);

-- DA-12 (PENDIENTE DE CONFIRMACIÓN DEL PO): semilla configurable, nunca hardcodeada en backend.
insert into public.planes (nombre, cupo_sms_mes, cupo_correo_mes) values
  ('basico', 200, 1000),
  ('intermedio', 600, 3000),
  ('empresarial', 2000, 10000)
on conflict (nombre) do nothing;

alter table public.planes enable row level security;

-- Política creada solo si no existe. Si ya existe, se verifica cmd/permissive/qual;
-- cualquier diferencia aborta la migración en lugar de borrar la política.
do $$
declare
  v_qual       text;
  v_cmd        text;
  v_permissive text;
  v_norm       text;
begin
  select qual, cmd, permissive
    into v_qual, v_cmd, v_permissive
  from pg_policies
  where schemaname = 'public'
    and tablename = 'planes'
    and policyname = 'ver planes';

  if not found then
    create policy "ver planes" on public.planes for select using (true);
  else
    v_norm := regexp_replace(coalesce(v_qual, ''), '\s+', '', 'g');
    if v_cmd <> 'SELECT' or v_permissive <> 'PERMISSIVE' or v_norm <> 'true' then
      raise exception
        'HU-39: la política "ver planes" ya existe con otra definición (cmd=%, permissive=%, qual=%); no se reemplaza',
        v_cmd, v_permissive, v_qual;
    end if;
  end if;
end $$;

-- Alcance HU-39: anon nunca obtiene privilegios de tabla; solo authenticated y service_role.
revoke all on public.planes from anon;
grant select on public.planes to authenticated, service_role;
grant insert, update on public.planes to service_role;

-- ---------------------------------------------------------------------------
-- Contador mensual por establecimiento, mes y canal.
-- `cantidad` = envíos aceptados por el proveedor; `reservada` = envíos en curso.
-- ---------------------------------------------------------------------------
create table if not exists public.consumo_mensual (
  establecimiento_id    uuid not null,
  mes                   date not null,
  canal                 text not null,
  cantidad              integer not null default 0 check (cantidad >= 0),
  reservada             integer not null default 0 check (reservada >= 0),
  alerta_80_enviada     boolean not null default false,
  alerta_80_enviada_at  timestamptz,
  created_at            timestamptz not null default now(),
  actualizado_at        timestamptz not null default now(),
  primary key (establecimiento_id, mes, canal),
  constraint consumo_mensual_establecimiento_fkey
    foreign key (establecimiento_id) references public.establecimientos(id) on delete restrict,
  constraint consumo_mensual_canal_check check (canal in ('sms', 'correo', 'push')),
  constraint consumo_mensual_mes_check check (extract(day from mes) = 1)
);

create index if not exists consumo_mensual_periodo_idx
  on public.consumo_mensual (mes, canal);

alter table public.consumo_mensual enable row level security;

-- Misma estrategia segura: crear si falta, validar si ya existe. El using() es el
-- aislamiento multi-tenant original del proyecto, no se sustituye ni se debilita.
do $$
declare
  v_qual       text;
  v_cmd        text;
  v_permissive text;
  v_norm       text;
begin
  select qual, cmd, permissive
    into v_qual, v_cmd, v_permissive
  from pg_policies
  where schemaname = 'public'
    and tablename = 'consumo_mensual'
    and policyname = 'ver consumo mensual';

  if not found then
    create policy "ver consumo mensual" on public.consumo_mensual
      for select using (establecimiento_id = privado.mi_establecimiento());
  else
    v_norm := regexp_replace(coalesce(v_qual, ''), '\s+', '', 'g');
    if v_cmd <> 'SELECT'
       or v_permissive <> 'PERMISSIVE'
       or v_norm not in (
            '(establecimiento_id=privado.mi_establecimiento())',
            '(establecimiento_id=mi_establecimiento())'
          ) then
      raise exception
        'HU-39: la política "ver consumo mensual" ya existe con otra definición (cmd=%, permissive=%, qual=%); no se reemplaza',
        v_cmd, v_permissive, v_qual;
    end if;
  end if;
end $$;

-- Alcance HU-39: anon sin acceso; el tenant se resuelve en RLS, nunca desde el frontend.
revoke all on public.consumo_mensual from anon;
grant select on public.consumo_mensual to authenticated, service_role;
grant insert, update on public.consumo_mensual to service_role;

-- ---------------------------------------------------------------------------
-- Reservas por notificación (idempotencia entre reintentos y workers).
-- ---------------------------------------------------------------------------
create table if not exists public.consumo_reservas (
  establecimiento_id  uuid not null,
  mes                 date not null,
  canal               text not null,
  referencia          text not null,
  estado              text not null default 'reservada',
  created_at          timestamptz not null default now(),
  confirmada_at       timestamptz,
  liberada_at         timestamptz,
  primary key (establecimiento_id, mes, canal, referencia),
  constraint consumo_reservas_establecimiento_fkey
    foreign key (establecimiento_id) references public.establecimientos(id) on delete restrict,
  constraint consumo_reservas_canal_check check (canal in ('sms', 'correo', 'push')),
  constraint consumo_reservas_estado_check check (estado in ('reservada', 'confirmada', 'liberada'))
);

alter table public.consumo_reservas enable row level security;

do $$
declare
  v_qual       text;
  v_cmd        text;
  v_permissive text;
  v_norm       text;
begin
  select qual, cmd, permissive
    into v_qual, v_cmd, v_permissive
  from pg_policies
  where schemaname = 'public'
    and tablename = 'consumo_reservas'
    and policyname = 'ver reservas de consumo';

  if not found then
    create policy "ver reservas de consumo" on public.consumo_reservas
      for select using (establecimiento_id = privado.mi_establecimiento());
  else
    v_norm := regexp_replace(coalesce(v_qual, ''), '\s+', '', 'g');
    if v_cmd <> 'SELECT'
       or v_permissive <> 'PERMISSIVE'
       or v_norm not in (
            '(establecimiento_id=privado.mi_establecimiento())',
            '(establecimiento_id=mi_establecimiento())'
          ) then
      raise exception
        'HU-39: la política "ver reservas de consumo" ya existe con otra definición (cmd=%, permissive=%, qual=%); no se reemplaza',
        v_cmd, v_permissive, v_qual;
    end if;
  end if;
end $$;

revoke all on public.consumo_reservas from anon;
grant select on public.consumo_reservas to authenticated, service_role;
grant insert, update on public.consumo_reservas to service_role;

-- ---------------------------------------------------------------------------
-- Entregas de la alerta del 80 %. Una fila por destinatario y periodo: la
-- unicidad evita dos correos aunque dos SMS crucen el umbral a la vez.
-- ---------------------------------------------------------------------------
create table if not exists public.consumo_alertas (
  id                  uuid primary key default gen_random_uuid(),
  establecimiento_id  uuid not null,
  mes                 date not null,
  destinatario_tipo   text not null,
  destinatario_id     uuid not null,
  estado              text not null default 'pendiente',
  intentos            smallint not null default 0 check (intentos >= 0),
  detalle             jsonb not null default '{}'::jsonb,
  error               text,
  enviada_at          timestamptz,
  created_at          timestamptz not null default now(),
  actualizado_at      timestamptz not null default now(),
  constraint consumo_alertas_establecimiento_fkey
    foreign key (establecimiento_id) references public.establecimientos(id) on delete restrict,
  constraint consumo_alertas_tipo_check check (destinatario_tipo in ('sede', 'plataforma')),
  constraint consumo_alertas_estado_check check (estado in ('pendiente', 'enviada', 'fallida')),
  constraint consumo_alertas_unica unique (establecimiento_id, mes, destinatario_tipo, destinatario_id)
);

create index if not exists consumo_alertas_pendientes_idx
  on public.consumo_alertas (estado, created_at)
  where estado in ('pendiente', 'fallida');

alter table public.consumo_alertas enable row level security;

do $$
declare
  v_qual       text;
  v_cmd        text;
  v_permissive text;
  v_norm       text;
begin
  select qual, cmd, permissive
    into v_qual, v_cmd, v_permissive
  from pg_policies
  where schemaname = 'public'
    and tablename = 'consumo_alertas'
    and policyname = 'ver alertas de consumo';

  if not found then
    create policy "ver alertas de consumo" on public.consumo_alertas
      for select using (establecimiento_id = privado.mi_establecimiento());
  else
    v_norm := regexp_replace(coalesce(v_qual, ''), '\s+', '', 'g');
    if v_cmd <> 'SELECT'
       or v_permissive <> 'PERMISSIVE'
       or v_norm not in (
            '(establecimiento_id=privado.mi_establecimiento())',
            '(establecimiento_id=mi_establecimiento())'
          ) then
      raise exception
        'HU-39: la política "ver alertas de consumo" ya existe con otra definición (cmd=%, permissive=%, qual=%); no se reemplaza',
        v_cmd, v_permissive, v_qual;
    end if;
  end if;
end $$;

revoke all on public.consumo_alertas from anon;
grant select on public.consumo_alertas to authenticated, service_role;
grant insert, update on public.consumo_alertas to service_role;

-- ---------------------------------------------------------------------------
-- Normalización de FK históricas: si alguna de estas tres tablas se creó con una
-- versión anterior del FK sin nombre y ON DELETE CASCADE, se sustituye por el
-- constraint con nombre y ON DELETE RESTRICT. Solo afecta a tablas de HU-39;
-- no se eliminan filas ni se tocan FK de otros módulos.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabla      text;
  v_nombre_fk  text;
  v_ok         boolean;
  r            record;
begin
  for v_tabla in
    select unnest(array['consumo_mensual', 'consumo_reservas', 'consumo_alertas'])
  loop
    v_nombre_fk := v_tabla || '_establecimiento_fkey';
    v_ok := false;

    for r in
      select c.conname, pg_get_constraintdef(c.oid) as def
      from pg_constraint c
      where c.conrelid = format('public.%I', v_tabla)::regclass
        and c.contype = 'f'
        and c.confrelid = 'public.establecimientos'::regclass
        and exists (
          select 1
          from unnest(c.conkey) k
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
          where a.attname = 'establecimiento_id'
        )
    loop
      if r.conname = v_nombre_fk and r.def like '%ON DELETE RESTRICT%' then
        v_ok := true;
      else
        execute format('alter table public.%I drop constraint %I', v_tabla, r.conname);
      end if;
    end loop;

    if not v_ok then
      execute format(
        'alter table public.%I add constraint %I foreign key (establecimiento_id) references public.establecimientos(id) on delete restrict',
        v_tabla, v_nombre_fk
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Guardia anti-sobrescritura: las RPCs llevan prefijo hu39_ y COMMENT con HU-39.
-- Si existiera una función homónima de otro módulo, se aborta en vez de
-- reemplazarla con CREATE OR REPLACE.
-- ---------------------------------------------------------------------------
do $$
declare
  v_nombre       text;
  v_descripcion  text;
begin
  foreach v_nombre in array array[
    'hu39_reservar_consumo', 'hu39_confirmar_consumo', 'hu39_liberar_consumo'
  ] loop
    select obj_description(p.oid, 'pg_proc')
      into v_descripcion
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = v_nombre
      and p.pronargs = 5;

    if found and (v_descripcion is null or v_descripcion not like 'HU-39%') then
      raise exception
        'HU-39: la función public.% ya existe y no está identificada como HU-39; no se sobrescribe',
        v_nombre;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- CA2: aparta una unidad del cupo antes de enviar. Solo el SMS está limitado;
-- correo y push se contabilizan pero nunca bloquean una notificación operativa.
-- SECURITY DEFINER con search_path explícito (public, pg_temp) y todas las
-- referencias schema-qualificadas: no se expone datos de otros establecimientos.
-- ---------------------------------------------------------------------------
create or replace function public.hu39_reservar_consumo(
  p_establecimiento_id uuid,
  p_canal              text,
  p_referencia         text,
  p_mes                date,
  p_ahora              timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_plan      record;
  v_consumo   record;
  v_reserva   record;
  v_cupo      integer;
  v_usados    integer;
begin
  if p_canal not in ('sms', 'correo', 'push') or p_referencia is null or p_referencia = '' then
    return jsonb_build_object('estado', 'datos_invalidos');
  end if;

  select p.nombre, p.cupo_sms_mes, p.cupo_correo_mes into v_plan
  from public.planes p
  join public.establecimientos e on e.plan = p.nombre
  where e.id = p_establecimiento_id;
  if not found then
    return jsonb_build_object('estado', 'sin_plan');
  end if;

  v_cupo := case when p_canal = 'sms' then v_plan.cupo_sms_mes else v_plan.cupo_correo_mes end;

  insert into public.consumo_mensual (establecimiento_id, mes, canal)
  values (p_establecimiento_id, p_mes, p_canal)
  on conflict do nothing;

  -- Se bloquea primero la fila del contador: todas las reservas del mismo
  -- establecimiento/mes/canal se serializan aquí, evitando sobrepasar el cupo.
  select * into v_consumo
  from public.consumo_mensual
  where establecimiento_id = p_establecimiento_id and mes = p_mes and canal = p_canal
  for update;

  select * into v_reserva
  from public.consumo_reservas
  where establecimiento_id = p_establecimiento_id
    and mes = p_mes and canal = p_canal and referencia = p_referencia;

  if found then
    if v_reserva.estado = 'confirmada' then
      -- Idempotencia: un reintento del worker no vuelve a contabilizar.
      return jsonb_build_object('estado', 'ok', 'ya_contabilizada', true,
        'cantidad', v_consumo.cantidad, 'cupo', v_cupo);
    end if;
    if v_reserva.estado = 'reservada' then
      return jsonb_build_object('estado', 'ok', 'ya_reservada', true,
        'cantidad', v_consumo.cantidad, 'cupo', v_cupo);
    end if;
    -- El intento anterior falló y liberó la reserva: puede volver a intentarse.
    update public.consumo_reservas
       set estado = 'reservada', liberada_at = null, created_at = p_ahora
     where establecimiento_id = p_establecimiento_id
       and mes = p_mes and canal = p_canal and referencia = p_referencia;
    update public.consumo_mensual
       set reservada = reservada + 1, actualizado_at = p_ahora
     where establecimiento_id = p_establecimiento_id and mes = p_mes and canal = p_canal;
    return jsonb_build_object('estado', 'ok', 'cantidad', v_consumo.cantidad,
      'cupo', v_cupo, 'reservada', v_consumo.reservada + 1);
  end if;

  v_usados := v_consumo.cantidad + v_consumo.reservada;
  if p_canal = 'sms' and v_cupo is not null and v_usados >= v_cupo then
    -- Sin cupo: la cola busca canal alterno. No se contabiliza el intento fallido.
    return jsonb_build_object('estado', 'sin_cupo', 'cantidad', v_consumo.cantidad,
      'cupo', v_cupo, 'restantes', 0, 'mes', to_char(p_mes, 'YYYY-MM'));
  end if;

  insert into public.consumo_reservas (establecimiento_id, mes, canal, referencia)
  values (p_establecimiento_id, p_mes, p_canal, p_referencia);

  update public.consumo_mensual
     set reservada = reservada + 1, actualizado_at = p_ahora
   where establecimiento_id = p_establecimiento_id and mes = p_mes and canal = p_canal;

  return jsonb_build_object('estado', 'ok', 'cantidad', v_consumo.cantidad,
    'cupo', v_cupo, 'reservada', v_consumo.reservada + 1);
end $$;

-- ---------------------------------------------------------------------------
-- CA1 / contabilización: confirma solo lo que el proveedor aceptó. Devuelve el
-- aviso del 80 % una única vez por mes, con la fila bloqueada.
-- ---------------------------------------------------------------------------
create or replace function public.hu39_confirmar_consumo(
  p_establecimiento_id uuid,
  p_canal              text,
  p_referencia         text,
  p_mes                date,
  p_ahora              timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_reserva    record;
  v_consumo    record;
  v_plan       record;
  v_cupo       integer;
  v_cantidad   integer;
  v_porcentaje numeric;
  v_alerta     jsonb;
begin
  -- Se bloquea la reserva y después el contador. Distintas referencias pueden
  -- esperar en la reserva, pero todas convergen en la misma fila del contador.
  select * into v_reserva
  from public.consumo_reservas
  where establecimiento_id = p_establecimiento_id
    and mes = p_mes and canal = p_canal and referencia = p_referencia
  for update;
  if not found then
    return jsonb_build_object('estado', 'sin_reserva');
  end if;

  select p.nombre, p.cupo_sms_mes, p.cupo_correo_mes into v_plan
  from public.planes p
  join public.establecimientos e on e.plan = p.nombre
  where e.id = p_establecimiento_id;

  select * into v_consumo
  from public.consumo_mensual
  where establecimiento_id = p_establecimiento_id and mes = p_mes and canal = p_canal
  for update;

  if v_reserva.estado = 'confirmada' then
    -- Doble conteo imposible: la reserva ya fue contabilizada.
    v_cantidad := v_consumo.cantidad;
  elsif v_reserva.estado = 'liberada' then
    -- Un intento liberado nunca cuenta como envío.
    return jsonb_build_object('estado', 'liberada');
  else
    update public.consumo_reservas
       set estado = 'confirmada', confirmada_at = p_ahora
     where establecimiento_id = p_establecimiento_id
       and mes = p_mes and canal = p_canal and referencia = p_referencia;

    update public.consumo_mensual
       set cantidad = cantidad + 1,
           reservada = greatest(reservada - 1, 0),
           actualizado_at = p_ahora
     where establecimiento_id = p_establecimiento_id and mes = p_mes and canal = p_canal
     returning cantidad into v_cantidad;
  end if;

  v_cupo := case when p_canal = 'sms' then v_plan.cupo_sms_mes else v_plan.cupo_correo_mes end;
  if v_cupo is null or v_cupo = 0 then
    v_porcentaje := null;
  else
    v_porcentaje := round(v_cantidad::numeric * 100 / v_cupo, 2);
  end if;

  -- Solo SMS: el criterio CA1 pide la alerta al 80 % del cupo de SMS.
  if p_canal = 'sms' and v_cupo is not null and v_cupo > 0
     and v_cantidad >= ceil(v_cupo * 0.80)::integer
     and not v_consumo.alerta_80_enviada then

    update public.consumo_mensual
       set alerta_80_enviada = true, alerta_80_enviada_at = p_ahora
     where establecimiento_id = p_establecimiento_id and mes = p_mes and canal = p_canal;

    v_alerta := jsonb_build_object(
      'establecimientoId', p_establecimiento_id::text,
      'mes', to_char(p_mes, 'YYYY-MM'),
      'plan', v_plan.nombre,
      'cupo', v_cupo,
      'consumo', v_cantidad,
      'porcentaje', v_porcentaje,
      'restantes', greatest(v_cupo - v_cantidad, 0)
    );
  end if;

  return jsonb_build_object(
    'estado', 'ok',
    'cantidad', v_cantidad,
    'cupo', v_cupo,
    'porcentaje', v_porcentaje,
    'restantes', case when v_cupo is null then null else greatest(v_cupo - v_cantidad, 0) end,
    'alerta_80', v_alerta
  );
end $$;

-- ---------------------------------------------------------------------------
-- Libera una reserva cuando el proveedor falló: no cuenta como envío y deja
-- el sitio libre para el siguiente intento o para el canal alterno.
-- ---------------------------------------------------------------------------
create or replace function public.hu39_liberar_consumo(
  p_establecimiento_id uuid,
  p_canal              text,
  p_referencia         text,
  p_mes                date,
  p_ahora              timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_reserva record;
begin
  select * into v_reserva
  from public.consumo_reservas
  where establecimiento_id = p_establecimiento_id
    and mes = p_mes and canal = p_canal and referencia = p_referencia
  for update;

  if not found then
    return jsonb_build_object('estado', 'sin_reserva');
  end if;
  if v_reserva.estado <> 'reservada' then
    return jsonb_build_object('estado', v_reserva.estado);
  end if;

  update public.consumo_reservas
     set estado = 'liberada', liberada_at = p_ahora
   where establecimiento_id = p_establecimiento_id
     and mes = p_mes and canal = p_canal and referencia = p_referencia;

  update public.consumo_mensual
     set reservada = greatest(reservada - 1, 0), actualizado_at = p_ahora
   where establecimiento_id = p_establecimiento_id and mes = p_mes and canal = p_canal;

  return jsonb_build_object('estado', 'ok');
end $$;

-- Alcance HU-39: estas tres RPCs solo son ejecutables por service_role (backend).
-- No se otorgan a public/anon/authenticated; el frontend nunca las invoca.
revoke execute on function public.hu39_reservar_consumo(uuid, text, text, date, timestamptz) from public, anon, authenticated;
revoke execute on function public.hu39_confirmar_consumo(uuid, text, text, date, timestamptz) from public, anon, authenticated;
revoke execute on function public.hu39_liberar_consumo(uuid, text, text, date, timestamptz) from public, anon, authenticated;
grant execute on function public.hu39_reservar_consumo(uuid, text, text, date, timestamptz) to service_role;
grant execute on function public.hu39_confirmar_consumo(uuid, text, text, date, timestamptz) to service_role;
grant execute on function public.hu39_liberar_consumo(uuid, text, text, date, timestamptz) to service_role;

comment on table public.consumo_mensual is
  'HU-39: consumo mensual real por establecimiento y canal en America/Bogota. El historial se conserva.';
comment on column public.consumo_mensual.cantidad is
  'HU-39: envíos aceptados por el proveedor. No incluye intentos fallidos ni reservas en curso.';
comment on column public.consumo_mensual.alerta_80_enviada is
  'HU-39 CA1: el aviso del 80 % de SMS ya se generó en este periodo; evita duplicados concurrentes.';
comment on function public.hu39_reservar_consumo(uuid, text, text, date, timestamptz) is
  'HU-39 CA2: aparta el cupo antes de enviar; con SMS agotado devuelve sin_cupo sin bloquear otros canales.';
comment on function public.hu39_confirmar_consumo(uuid, text, text, date, timestamptz) is
  'HU-39 CA1: contabiliza el envío aceptado y devuelve una sola vez la alerta del 80 % del mes.';
