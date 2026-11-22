-- ===========================================================================
-- HU-39 (ZARU-28) - entregas de la alerta del 80%
-- Ejecutar las partes en orden (01 -> 08). Contenido extraido de:
-- supabase/migrations/20261119100000_hu39_consumo_por_plan.sql
-- ===========================================================================

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
        'HU-39: la polÃ­tica "ver alertas de consumo" ya existe con otra definiciÃ³n (cmd=%, permissive=%, qual=%); no se reemplaza',
        v_cmd, v_permissive, v_qual;
    end if;
  end if;
end $$;

revoke all on public.consumo_alertas from anon;
grant select on public.consumo_alertas to authenticated, service_role;
grant insert, update on public.consumo_alertas to service_role;
