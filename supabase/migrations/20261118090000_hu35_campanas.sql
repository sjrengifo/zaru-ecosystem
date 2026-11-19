-- HU-35 (ZARU-24): envío de promociones segmentadas a los clientes del establecimiento.
--
-- Una campaña se crea sobre una promoción vigente de la sede y un segmento (días sin visita,
-- servicios usados y tipo de vehículo). Antes de confirmar se estiman los destinatarios excluyendo
-- a quien no autorizó comunicaciones comerciales (HU-30), a quien ya recibió 2 mensajes comerciales
-- en los últimos 7 días y a quien no tiene correo (canal de la campaña).
--
-- Los mensajes se materializan en la cola `notificaciones` (HU-42) con tipo 'comercial' y
-- prioridad 2 (RNF-F7-02), de modo que heredan reintentos, bitácora y deduplicación. La
-- revalidación de autorización y límite se repite al enviar con `reclamar_comercial`, nunca se
-- confía solo en la estimación.
--
-- La migración es idempotente: crea objetos nuevos y agrega columnas solo si faltan.

---------------------------------------------------------------------------
-- 1. Campañas
---------------------------------------------------------------------------
create table if not exists public.campanas (
  id                    uuid primary key default gen_random_uuid(),
  establecimiento_id    uuid not null references public.establecimientos(id) on delete cascade,
  promocion_id          uuid not null references public.promociones(id) on delete restrict,
  promocion_snapshot    jsonb not null default '{}'::jsonb,
  segmento              jsonb not null default '{}'::jsonb,
  estado                text not null default 'programada',
  programada_para       timestamptz not null,
  programada_solicitada timestamptz not null,
  total_destinatarios   integer not null default 0,
  exclusiones           jsonb not null default '{}'::jsonb,
  omitidos              jsonb not null default '{}'::jsonb,
  clave_idempotencia    text not null,
  creada_por            uuid references public.perfiles(id) on delete set null,
  materializada_at      timestamptz,
  error                 text,
  created_at            timestamptz not null default now(),
  constraint campanas_estado_check check (estado in ('programada', 'enviando', 'enviada', 'cancelada')),
  constraint campanas_destinatarios_check check (total_destinatarios >= 0),
  constraint campanas_idempotencia_unica unique (establecimiento_id, clave_idempotencia),
  constraint campanas_id_establecimiento_unica unique (id, establecimiento_id)
);

create index if not exists campanas_establecimiento_fecha_idx
  on public.campanas (establecimiento_id, created_at desc);

-- El worker solo busca las que ya vencieron; el índice parcial mantiene la consulta pequeña.
create index if not exists campanas_pendientes_idx
  on public.campanas (programada_para)
  where estado = 'programada';

alter table public.campanas enable row level security;

drop policy if exists "ver campanas" on public.campanas;
create policy "ver campanas" on public.campanas
  for select using (establecimiento_id = privado.mi_establecimiento());

revoke all on public.campanas from anon;
grant select on public.campanas to authenticated, service_role;
grant insert, update on public.campanas to service_role;

comment on table public.campanas is
  'HU-35: campaña de una promoción vigente sobre un segmento de clientes. Se materializa en notificaciones comerciales.';
comment on column public.campanas.promocion_snapshot is
  'Copia de la promoción al confirmar: nombre, descripción, condiciones, descuento, vigencia y servicios.';
comment on column public.campanas.programada_solicitada is
  'Hora pedida por el administrador, antes del ajuste de horario de Bogotá (RF-F7-09).';
comment on column public.campanas.omitidos is
  'Conteo de exclusiones al materializar (autorización, límite semanal o sin correo).';
comment on column public.campanas.error is
  'Motivo por el que la campaña se canceló al materializar (por ejemplo, la promoción dejó de estar vigente).';

---------------------------------------------------------------------------
-- 2. Cola de notificaciones: prioridad y vínculo con la campaña
---------------------------------------------------------------------------
alter table public.notificaciones
  add column if not exists prioridad smallint not null default 1,
  add column if not exists campana_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'notificaciones_prioridad_check') then
    alter table public.notificaciones
      add constraint notificaciones_prioridad_check check (prioridad between 0 and 2);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notificaciones_campana_id_fkey') then
    alter table public.notificaciones
      add constraint notificaciones_campana_id_fkey
      foreign key (campana_id) references public.campanas(id) on delete set null;
  end if;
end $$;

comment on column public.notificaciones.prioridad is
  'RNF-F7-02: 0 = novedad, 1 = operativa, 2 = comercial. El worker atiende primero la prioridad menor.';
comment on column public.notificaciones.campana_id is
  'HU-35: campaña que originó el mensaje comercial.';

create index if not exists notificaciones_campana_idx
  on public.notificaciones (campana_id)
  where campana_id is not null;

-- Límite semanal: contar los comerciales ya enviados de un cliente en la sede.
create index if not exists notificaciones_comerciales_limite_idx
  on public.notificaciones (establecimiento_id, cliente_id, programada_para)
  where tipo = 'comercial' and estado in ('enviada', 'entregada');

---------------------------------------------------------------------------
-- 3. Segmentador de campañas (RF-F7-06 a RF-F7-08)
---------------------------------------------------------------------------
-- Devuelve un cliente por fila con `motivo`:
--   null              → destinatario válido
--   sin_autorizacion  → no autorizó comunicaciones comerciales (HU-30)
--   sin_correo        → no tiene canal de correo
--   limite_semanal    → ya recibió 2 comerciales de la sede en los últimos 7 días
-- Solo entran clientes con al menos una orden entregada: la campaña busca reactivar a quien ya
-- visitó la sede. Los filtros vacíos no restringen.
create or replace function privado.segmento_campana(
  p_establecimiento_id uuid,
  p_dias_sin_visita   integer,
  p_servicio_ids      uuid[] default null,
  p_tipos_vehiculo    text[] default null,
  p_ahora             timestamptz default now()
) returns table (cliente_id uuid, motivo text, ultima_visita timestamptz)
language sql stable security definer set search_path = public as $$
  with parametros as (
    select
      coalesce(p_ahora, now()) as ahora,
      coalesce(p_dias_sin_visita, 30) as dias,
      coalesce((
        select array_agg(distinct s) from unnest(p_servicio_ids) as s where s is not null
      ), '{}'::uuid[]) as servicios,
      coalesce((
        select array_agg(distinct lower(btrim(t)))
        from unnest(p_tipos_vehiculo) as t
        where t is not null and btrim(t) <> ''
      ), '{}'::text[]) as tipos
  ),
  visitas as (
    select o.vehiculo_id, max(o.entregada_at) as ultima
    from ordenes o
    where o.establecimiento_id = p_establecimiento_id
      and o.estado = 'entregado'
      and o.entregada_at is not null
    group by o.vehiculo_id
  ),
  ultima_por_cliente as (
    select v.cliente_id, max(vi.ultima) as ultima_visita
    from vehiculos v
    join visitas vi on vi.vehiculo_id = v.id
    where v.establecimiento_id = p_establecimiento_id
    group by v.cliente_id
  ),
  base as (
    select c.id as cliente_id, u.ultima_visita
    from clientes c
    join ultima_por_cliente u on u.cliente_id = c.id
    cross join parametros p
    where c.establecimiento_id = p_establecimiento_id
      and u.ultima_visita <= p.ahora - make_interval(days => p.dias)
      and (
        cardinality(p.servicios) = 0
        or exists (
          select 1
          from ordenes o
          join orden_servicios os on os.orden_id = o.id
          join vehiculos v on v.id = o.vehiculo_id
          where o.establecimiento_id = p_establecimiento_id
            and o.estado = 'entregado'
            and v.cliente_id = c.id
            and os.servicio_id = any (p.servicios)
        )
      )
      and (
        cardinality(p.tipos) = 0
        or exists (
          select 1
          from vehiculos v
          where v.establecimiento_id = p_establecimiento_id
            and v.cliente_id = c.id
            and lower(btrim(v.tipo)) = any (p.tipos)
        )
      )
  )
  select
    b.cliente_id,
    case
      when coalesce((
        select a.otorgado
        from autorizaciones_vigentes a
        where a.cliente_id = b.cliente_id and a.tipo = 'comerciales'
      ), false) is not true then 'sin_autorizacion'
      when coalesce(c.correo, '') = '' then 'sin_correo'
      when (
        select count(*)
        from notificaciones n
        cross join parametros p
        where n.establecimiento_id = p_establecimiento_id
          and n.cliente_id = b.cliente_id
          and n.tipo = 'comercial'
          and n.estado in ('enviada', 'entregada')
          and coalesce(n.programada_para, n.created_at) >= p.ahora - interval '7 days'
          and coalesce(n.programada_para, n.created_at) <= p.ahora
      ) >= 2 then 'limite_semanal'
      else null
    end as motivo,
    b.ultima_visita
  from base b
  join clientes c on c.id = b.cliente_id and c.establecimiento_id = p_establecimiento_id
$$;

-- Envoltorio público que usa tenant.rpc (agrega p_establecimiento_id desde la sesión).
create or replace function public.segmento_campana(
  p_establecimiento_id uuid,
  p_dias_sin_visita   integer,
  p_servicio_ids      uuid[] default null,
  p_tipos_vehiculo    text[] default null,
  p_ahora             timestamptz default now()
) returns table (cliente_id uuid, motivo text, ultima_visita timestamptz)
language sql stable security definer set search_path = public as $$
  select * from privado.segmento_campana(
    p_establecimiento_id, p_dias_sin_visita, p_servicio_ids, p_tipos_vehiculo, p_ahora
  );
$$;

revoke execute on function privado.segmento_campana(uuid, integer, uuid[], text[], timestamptz)
  from public, anon, authenticated;
revoke execute on function public.segmento_campana(uuid, integer, uuid[], text[], timestamptz)
  from public, anon, authenticated;
grant execute on function privado.segmento_campana(uuid, integer, uuid[], text[], timestamptz) to service_role;
grant execute on function public.segmento_campana(uuid, integer, uuid[], text[], timestamptz) to service_role;

comment on function public.segmento_campana(uuid, integer, uuid[], text[], timestamptz) is
  'HU-35: clientes del segmento con el motivo de exclusión. El backend solo envía a motivo = null.';

---------------------------------------------------------------------------
-- 4. Revalidación atómica al enviar (HU-30 CA2 · HU-35 CA2, CA3)
---------------------------------------------------------------------------
-- El worker la llama antes de cada envío comercial. Bloquea la fila para que dos workers no
-- cuenten ni envíen a la vez, y vuelve a leer la autorización vigente y el límite semanal.
-- Devuelve: ok · sin_autorizacion · limite_semanal · ya_procesada · no_comercial · no_existe.
create or replace function public.reclamar_comercial(
  p_establecimiento_id uuid,
  p_notificacion_id    uuid,
  p_ahora              timestamptz default now()
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_fila       notificaciones;
  v_autorizado boolean;
  v_enviadas   integer;
  v_ahora      timestamptz := coalesce(p_ahora, now());
begin
  select * into v_fila
  from notificaciones n
  where n.id = p_notificacion_id
    and n.establecimiento_id = p_establecimiento_id
  for update;

  if not found then
    return 'no_existe';
  end if;
  if v_fila.tipo <> 'comercial' then
    return 'no_comercial';
  end if;
  if v_fila.estado in ('enviada', 'entregada', 'cancelada') then
    return 'ya_procesada';
  end if;

  select a.otorgado into v_autorizado
  from autorizaciones_vigentes a
  where a.cliente_id = v_fila.cliente_id
    and a.tipo = 'comerciales';

  if coalesce(v_autorizado, false) is not true then
    return 'sin_autorizacion';
  end if;

  -- Se cuentan los ya enviados y los que otro worker está enviando en este momento (arriendo de
  -- 10 minutos que el worker renueva al reclamar). Así dos workers no superan juntos el límite.
  select count(*) into v_enviadas
  from notificaciones n
  where n.establecimiento_id = p_establecimiento_id
    and n.cliente_id = v_fila.cliente_id
    and n.tipo = 'comercial'
    and n.id <> v_fila.id
    and (
      n.estado in ('enviada', 'entregada')
      or (n.estado = 'enviando' and n.proximo_intento_at > v_ahora)
    )
    and coalesce(n.programada_para, n.created_at) >= v_ahora - interval '7 days'
    and coalesce(n.programada_para, n.created_at) <= v_ahora;

  if v_enviadas >= 2 then
    return 'limite_semanal';
  end if;

  return 'ok';
end $$;

revoke execute on function public.reclamar_comercial(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reclamar_comercial(uuid, uuid, timestamptz) to service_role;

comment on function public.reclamar_comercial(uuid, uuid, timestamptz) is
  'HU-35: revalida autorización comercial y límite semanal antes de enviar; la fila queda bloqueada.';
