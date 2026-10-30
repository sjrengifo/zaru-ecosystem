-- HU-52 (ZARU-52): eliminar los datos personales de un cliente a solicitud del titular.
--
-- Se borran el cliente, sus vehículos, sus autorizaciones y sus notificaciones (estas últimas en cascada).
-- Las órdenes entregadas se conservan sin vehículo: sin él ya no identifican a nadie y mantienen las
-- estadísticas de ingresos del establecimiento.

alter table ordenes alter column vehiculo_id drop not null;

-- Todo o nada. Devuelve el resultado en lugar de lanzar un error para que la API elija la respuesta:
--   no_encontrado       el cliente no existe en este establecimiento
--   servicios_en_curso  tiene un vehículo en el car wash; no se puede borrar hasta entregarlo
--   eliminado           incluye cuántos vehículos se borraron y cuántas órdenes se conservaron
create or replace function public.eliminar_cliente(p_establecimiento_id uuid, p_cliente_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_vehiculos uuid[];
  v_ordenes integer;
begin
  perform 1 from clientes where id = p_cliente_id and establecimiento_id = p_establecimiento_id for update;
  if not found then
    return jsonb_build_object('resultado', 'no_encontrado');
  end if;

  select coalesce(array_agg(id), '{}') into v_vehiculos
  from vehiculos where cliente_id = p_cliente_id and establecimiento_id = p_establecimiento_id;

  if exists (
    select 1 from ordenes
    where establecimiento_id = p_establecimiento_id and vehiculo_id = any (v_vehiculos) and estado <> 'entregado'
  ) then
    return jsonb_build_object('resultado', 'servicios_en_curso');
  end if;

  update ordenes set vehiculo_id = null
  where establecimiento_id = p_establecimiento_id and vehiculo_id = any (v_vehiculos);
  get diagnostics v_ordenes = row_count;

  delete from clientes where id = p_cliente_id and establecimiento_id = p_establecimiento_id;

  return jsonb_build_object('resultado', 'eliminado', 'vehiculos', cardinality(v_vehiculos), 'ordenes', v_ordenes);
end $$;

-- Solo el backend (service_role) puede llamarla; no se expone a usuarios del panel ni al público.
revoke execute on function public.eliminar_cliente(uuid, uuid) from public, anon, authenticated;
grant execute on function public.eliminar_cliente(uuid, uuid) to service_role;
