-- ===========================================================================
-- HU-39 / HU-31 - preferencia de canales por sede (parte 09, posterior a 01..08)
-- Contenido extraido de:
-- supabase/migrations/20261119110000_hu31_preferencias_canales.sql
-- Ejecutar despues de las partes 01 -> 08. No contiene DROP, TRUNCATE ni DELETE.
-- ===========================================================================

create table if not exists public.config_canales (
  establecimiento_id  uuid not null references public.establecimientos(id) on delete cascade,
  canal               text not null,
  activo              boolean not null default true,
  created_at          timestamptz not null default now(),
  actualizado_at      timestamptz not null default now(),
  primary key (establecimiento_id, canal),
  constraint config_canales_canal_check check (canal in ('sms', 'correo', 'push'))
);

alter table public.config_canales enable row level security;

-- La política se valida antes de reemplazarla: no se borra una política ajena.
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
    and tablename = 'config_canales'
    and policyname = 'ver preferencias de canales';

  if not found then
    create policy "ver preferencias de canales" on public.config_canales
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
        'HU-39: la política "ver preferencias de canales" ya existe con otra definición; no se reemplaza';
    end if;
  end if;
end $$;

revoke all on public.config_canales from anon;
grant select on public.config_canales to authenticated, service_role;

-- La función solo se crea si no existe o si está marcada como HU-39.
do $$
declare
  v_descripcion text;
begin
  select obj_description(p.oid, 'pg_proc')
    into v_descripcion
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'guardar_preferencias_canales'
    and p.pronargs = 2;

  if found and (v_descripcion is null or v_descripcion not like 'HU-39%') then
    raise exception 'HU-39: la función public.guardar_preferencias_canales ya existe y no pertenece a HU-39; no se sobrescribe';
  end if;
end $$;

create or replace function public.guardar_preferencias_canales(
  p_establecimiento_id uuid,
  p_canales            jsonb
) returns setof public.config_canales
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item      jsonb;
  v_canal   text;
  v_vistos  text[] := array[]::text[];
begin
  if jsonb_typeof(p_canales) is distinct from 'array' then
    raise exception 'La preferencia de canales debe ser una lista'
      using errcode = '23514', hint = 'canales';
  end if;

  for item in select * from jsonb_array_elements(p_canales) loop
    v_canal := item ->> 'canal';
    if v_canal is null or v_canal not in ('sms', 'correo', 'push') then
      raise exception 'Canal de notificación no válido: %', coalesce(v_canal, 'null')
        using errcode = '23514', hint = 'canal';
    end if;
    if v_canal = any(v_vistos) then
      raise exception 'El canal % está repetido', v_canal using errcode = '23514', hint = 'canal';
    end if;
    if jsonb_typeof(item -> 'activo') is distinct from 'boolean' then
      raise exception 'Cada canal debe indicar si está activo' using errcode = '23514', hint = 'activo';
    end if;
    v_vistos := v_vistos || v_canal;

    insert into public.config_canales (establecimiento_id, canal, activo)
    values (p_establecimiento_id, v_canal, (item ->> 'activo')::boolean)
    on conflict (establecimiento_id, canal)
    do update set activo = excluded.activo, actualizado_at = now();
  end loop;

  return query
    select c.* from public.config_canales c
    where c.establecimiento_id = p_establecimiento_id
    order by c.canal;
end $$;

revoke execute on function public.guardar_preferencias_canales(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.guardar_preferencias_canales(uuid, jsonb) to service_role;

comment on table public.config_canales is
  'HU-39/HU-31: preferencia de canales por sede para la prueba de envío; NO bloquea avisos operativos.';
comment on function public.guardar_preferencias_canales(uuid, jsonb) is
  'HU-39: guarda las preferencias de canales de una sede en una sola operación; el tenant sale de la sesión.';
