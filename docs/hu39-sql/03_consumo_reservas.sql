-- ===========================================================================
-- HU-39 (ZARU-28) - reservas por notificacion
-- Ejecutar las partes en orden (01 -> 08). Contenido extraido de:
-- supabase/migrations/20261119100000_hu39_consumo_por_plan.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Reservas por notificaciÃ³n (idempotencia entre reintentos y workers).
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
        'HU-39: la polÃ­tica "ver reservas de consumo" ya existe con otra definiciÃ³n (cmd=%, permissive=%, qual=%); no se reemplaza',
        v_cmd, v_permissive, v_qual;
    end if;
  end if;
end $$;

revoke all on public.consumo_reservas from anon;
grant select on public.consumo_reservas to authenticated, service_role;
grant insert, update on public.consumo_reservas to service_role;
