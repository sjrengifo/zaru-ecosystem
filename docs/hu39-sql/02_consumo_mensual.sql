-- ===========================================================================
-- HU-39 (ZARU-28) - contador mensual
-- Ejecutar las partes en orden (01 -> 08). Contenido extraido de:
-- supabase/migrations/20261119100000_hu39_consumo_por_plan.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Contador mensual por establecimiento, mes y canal.
-- `cantidad` = envÃ­os aceptados por el proveedor; `reservada` = envÃ­os en curso.
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
        'HU-39: la polÃ­tica "ver consumo mensual" ya existe con otra definiciÃ³n (cmd=%, permissive=%, qual=%); no se reemplaza',
        v_cmd, v_permissive, v_qual;
    end if;
  end if;
end $$;

-- Alcance HU-39: anon sin acceso; el tenant se resuelve en RLS, nunca desde el frontend.
revoke all on public.consumo_mensual from anon;
grant select on public.consumo_mensual to authenticated, service_role;
grant insert, update on public.consumo_mensual to service_role;
