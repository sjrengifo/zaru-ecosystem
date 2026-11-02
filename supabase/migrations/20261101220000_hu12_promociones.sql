-- HU-12 (ZARU-13): crear y gestionar promociones con vigencia.
--
-- Antes de aplicarla, revisar los datos existentes (al escribirla, ambas tablas estaban vacías).
-- La migración no modifica filas: solo agrega columnas con valor por defecto, vistas y funciones.
--   select count(*) as promociones, count(*) filter (where fecha_fin < fecha_inicio) as fechas_invertidas
--   from promociones;
--   select count(*) as servicios_de_otra_sede from promocion_servicios ps
--   join promociones p on p.id = ps.promocion_id join servicios s on s.id = ps.servicio_id
--   where s.establecimiento_id <> p.establecimiento_id;

-- RF-F4-01, RF-F4-03: descripción y condiciones opcionales; "activa" permite desactivarla sin borrarla.
alter table promociones
  add column descripcion text,
  add column condiciones text,
  add column activa boolean not null default true;

---------------------------------------------------------------------------
-- RF-F4-02: el estado se calcula con la fecha de Bogotá; no hay tareas programadas.
-- Al día siguiente de la fecha de fin la promoción deja de estar vigente sin intervención (HU-12 CA2).
---------------------------------------------------------------------------
create or replace function privado.hoy_bogota()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Bogota')::date
$$;

-- desactivada (la apagó el administrador) · programada (aún no empieza) · vencida (ya pasó su fin) · vigente.
-- Inicio y fin están incluidos: una promoción del 1 al 30 es vigente todo el 30.
create or replace function privado.estado_promocion(p_activa boolean, p_inicio date, p_fin date, p_hoy date default null)
returns text language sql stable set search_path = '' as $$
  select case
    when not p_activa then 'desactivada'
    when coalesce(p_hoy, privado.hoy_bogota()) < p_inicio then 'programada'
    when coalesce(p_hoy, privado.hoy_bogota()) > p_fin then 'vencida'
    else 'vigente'
  end
$$;

revoke execute on function privado.hoy_bogota() from public, anon;
revoke execute on function privado.estado_promocion(boolean, date, date, date) from public, anon;
grant execute on function privado.hoy_bogota() to authenticated, service_role;
grant execute on function privado.estado_promocion(boolean, date, date, date) to authenticated, service_role;

---------------------------------------------------------------------------
-- RF-F4-06, HU-12 CA1: vistas de consulta. security_invoker hace que respeten el RLS de quien consulta:
-- cada sede solo ve sus promociones (política "ver promociones" de la migración inicial).
---------------------------------------------------------------------------
create view promociones_con_estado with (security_invoker = true) as
select
  p.id, p.establecimiento_id, p.nombre, p.descripcion, p.condiciones, p.descuento_pct,
  p.fecha_inicio, p.fecha_fin, p.activa, p.created_at,
  privado.estado_promocion(p.activa, p.fecha_inicio, p.fecha_fin) as estado,
  coalesce((
    select jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre) order by s.nombre)
    from promocion_servicios ps join servicios s on s.id = ps.servicio_id
    where ps.promocion_id = p.id
  ), '[]'::jsonb) as servicios
from promociones p;

-- Las que hoy puede ver el cliente final (F5 la usará en /publico/{slug}/promociones).
create view promociones_vigentes with (security_invoker = true) as
select * from promociones_con_estado where estado = 'vigente';

revoke all on promociones_con_estado, promociones_vigentes from anon;
grant select on promociones_con_estado, promociones_vigentes to authenticated, service_role;

---------------------------------------------------------------------------
-- RF-F4-01, RF-F4-03: crear o editar una promoción y sus servicios en una sola transacción.
-- p_promocion_id null → crea. Devuelve el id, o null si la promoción no es de ese establecimiento.
-- Editar no toca órdenes: cada orden guarda su propio precio y descuento.
---------------------------------------------------------------------------
create or replace function public.guardar_promocion(
  p_establecimiento_id uuid,
  p_promocion_id uuid,
  p_nombre text,
  p_descripcion text,
  p_condiciones text,
  p_descuento_pct numeric,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_activa boolean,
  p_servicio_ids uuid[]
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if coalesce(cardinality(p_servicio_ids), 0) = 0 then
    raise exception 'Elige al menos un servicio del catálogo' using errcode = '23514', hint = 'servicioIds';
  end if;
  if exists (
    select 1 from unnest(p_servicio_ids) as elegido(id)
    where not exists (select 1 from servicios s where s.id = elegido.id and s.establecimiento_id = p_establecimiento_id)
  ) then
    raise exception 'Uno o más servicios no existen en el catálogo del establecimiento' using errcode = '23514', hint = 'servicioIds';
  end if;
  if p_fecha_fin < p_fecha_inicio then
    raise exception 'La fecha de fin no puede ser anterior a la de inicio' using errcode = '23514', hint = 'fechaFin';
  end if;

  if p_promocion_id is null then
    insert into promociones (establecimiento_id, nombre, descripcion, condiciones, descuento_pct, fecha_inicio, fecha_fin, activa)
    values (p_establecimiento_id, p_nombre, p_descripcion, p_condiciones, p_descuento_pct, p_fecha_inicio, p_fecha_fin, coalesce(p_activa, true))
    returning id into v_id;
  else
    update promociones set
      nombre = p_nombre, descripcion = p_descripcion, condiciones = p_condiciones, descuento_pct = p_descuento_pct,
      fecha_inicio = p_fecha_inicio, fecha_fin = p_fecha_fin, activa = coalesce(p_activa, activa)
    where id = p_promocion_id and establecimiento_id = p_establecimiento_id
    returning id into v_id;
    if v_id is null then
      return null;
    end if;
    delete from promocion_servicios where promocion_id = v_id and servicio_id <> all (p_servicio_ids);
  end if;

  insert into promocion_servicios (promocion_id, servicio_id)
  select distinct v_id, unnest(p_servicio_ids)
  on conflict do nothing;

  return v_id;
end $$;

---------------------------------------------------------------------------
-- RF-F4-04, RF-F4-05, HU-12 CA3: mejor promoción vigente para un servicio en una fecha.
-- La usará crear_orden (HU-08) por cada servicio de la orden. Ver plan.md de F4.
--   p_fecha  null → hoy en Bogotá.
--   p_precio null → `descuento` sale null; con precio, el descuento va redondeado a pesos enteros.
-- Desempate determinista: mayor porcentaje → la promoción creada primero → el id menor.
-- Sin promoción vigente no devuelve filas.
---------------------------------------------------------------------------
create or replace function public.mejor_promocion(
  p_establecimiento_id uuid,
  p_servicio_id uuid,
  p_fecha date default null,
  p_precio numeric default null
)
returns table (promocion_id uuid, nombre text, descuento_pct numeric, descuento numeric)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, p.descuento_pct, round(p_precio * p.descuento_pct / 100, 0)
  from promociones p
  join promocion_servicios ps on ps.promocion_id = p.id
  where p.establecimiento_id = p_establecimiento_id
    and ps.servicio_id = p_servicio_id
    and privado.estado_promocion(p.activa, p.fecha_inicio, p.fecha_fin, coalesce(p_fecha, privado.hoy_bogota())) = 'vigente'
  order by p.descuento_pct desc, p.created_at asc, p.id asc
  limit 1
$$;

-- Solo el backend (service_role) y las funciones de la base las llaman; no se exponen al panel ni al público.
revoke execute on function public.guardar_promocion(uuid, uuid, text, text, text, numeric, date, date, boolean, uuid[]) from public, anon, authenticated;
revoke execute on function public.mejor_promocion(uuid, uuid, date, numeric) from public, anon, authenticated;
grant execute on function public.guardar_promocion(uuid, uuid, text, text, text, numeric, date, date, boolean, uuid[]) to service_role;
grant execute on function public.mejor_promocion(uuid, uuid, date, numeric) to service_role;
