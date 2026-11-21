-- HU-31 (ZARU-20): configuración de los estados que generan notificación por establecimiento.
--
-- CA1: cada sede consulta los cinco estados del flujo con su interruptor.
-- CA2: "listo" es obligatorio y la base también rechaza desactivarlo.
-- CA3: la configuración es por establecimiento y se lee en cada envío, así que aplica de inmediato.
--
-- La tabla sigue el modelo de datos de F6 (`config_notificaciones`) y nace con todos los estados
-- activos, tal como define el plan técnico de la fase.

create table if not exists public.config_notificaciones (
  establecimiento_id uuid not null references public.establecimientos(id) on delete cascade,
  estado             public.estado_orden not null,
  activo             boolean not null default true,
  primary key (establecimiento_id, estado),
  constraint config_notificaciones_listo_obligatorio check (estado <> 'listo' or activo)
);

alter table public.config_notificaciones enable row level security;

drop policy if exists "ver configuracion de notificaciones" on public.config_notificaciones;
create policy "ver configuracion de notificaciones" on public.config_notificaciones
  for select using (establecimiento_id = privado.mi_establecimiento());

-- CA3: todo establecimiento nuevo queda con la configuración completa y activa.
create or replace function privado.sembrar_config_notificaciones()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.config_notificaciones (establecimiento_id, estado, activo)
  select new.id, estados.estado, true
  from unnest(enum_range(null::public.estado_orden)) as estados(estado);
  return new;
end $$;

drop trigger if exists establecimientos_config_notificaciones on public.establecimientos;
create trigger establecimientos_config_notificaciones
  after insert on public.establecimientos
  for each row execute function privado.sembrar_config_notificaciones();

revoke execute on function privado.sembrar_config_notificaciones() from public, anon, authenticated;

-- Establecimientos anteriores a HU-31: se rellenan sin cambiar su comportamiento actual.
insert into public.config_notificaciones (establecimiento_id, estado, activo)
select e.id, estados.estado, true
from public.establecimientos e
cross join unnest(enum_range(null::public.estado_orden)) as estados(estado)
on conflict (establecimiento_id, estado) do nothing;

-- CA1 y CA2: guardar varios interruptores en una sola operación. La función recibe el
-- establecimiento desde la sesión (tenant.rpc) y vuelve a validar que "listo" siga activo.
create or replace function public.guardar_config_notificaciones(
  p_establecimiento_id uuid,
  p_config jsonb
) returns setof public.config_notificaciones
language plpgsql security definer set search_path = public as $$
declare
  item     jsonb;
  v_estado public.estado_orden;
begin
  if jsonb_typeof(p_config) is distinct from 'array' then
    raise exception 'La configuración debe ser una lista de estados' using errcode = '23514', hint = 'configuracion';
  end if;

  for item in select * from jsonb_array_elements(p_config) loop
    v_estado := (item ->> 'estado')::public.estado_orden;
    if v_estado = 'listo' and coalesce((item ->> 'activo')::boolean, false) = false then
      raise exception 'El estado "listo" es obligatorio y no se puede desactivar'
        using errcode = '23514', hint = 'estado';
    end if;

    insert into public.config_notificaciones (establecimiento_id, estado, activo)
    values (p_establecimiento_id, v_estado, coalesce((item ->> 'activo')::boolean, true))
    on conflict (establecimiento_id, estado)
    do update set activo = excluded.activo;
  end loop;

  return query
    select * from public.config_notificaciones c
    where c.establecimiento_id = p_establecimiento_id
    order by c.estado;
end $$;

revoke execute on function public.guardar_config_notificaciones(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.guardar_config_notificaciones(uuid, jsonb) to service_role;

comment on table public.config_notificaciones is
  'HU-31: estados del flujo que generan notificación en cada establecimiento. "listo" siempre activo (CA2).';
