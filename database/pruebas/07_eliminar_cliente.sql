-- HU-52: eliminar los datos personales de un cliente.
-- Uso: psql -d zaru_prueba -f database/pruebas/07_eliminar_cliente.sql
\set QUIET on
\o /dev/null
create temp table resultados (n serial, prueba text, ok boolean, detalle text);

create or replace function pg_temp.verificar(prueba text, condicion boolean, detalle text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (prueba, coalesce(condicion, false), detalle);
$$;

insert into establecimientos (id, nombre) values
  ('52000000-0000-0000-0000-0000000000e1', 'Lavadero HU-52 A'),
  ('52000000-0000-0000-0000-0000000000e2', 'Lavadero HU-52 B');
insert into clientes (id, establecimiento_id, nombre, telefono, correo, autorizacion_datos) values
  ('52000000-0000-0000-0000-0000000000c1', '52000000-0000-0000-0000-0000000000e1', 'Ana Borrar', '3005200001', 'ana@correo.com', true),
  ('52000000-0000-0000-0000-0000000000c2', '52000000-0000-0000-0000-0000000000e1', 'Luis En Curso', '3005200002', null, true),
  ('52000000-0000-0000-0000-0000000000c3', '52000000-0000-0000-0000-0000000000e1', 'Sin Vehiculos', '3005200003', null, true),
  ('52000000-0000-0000-0000-0000000000c4', '52000000-0000-0000-0000-0000000000e2', 'Otro Establecimiento', '3005200001', null, true);
insert into vehiculos (id, establecimiento_id, cliente_id, placa, tipo) values
  ('52000000-0000-0000-0000-0000000000a1', '52000000-0000-0000-0000-0000000000e1', '52000000-0000-0000-0000-0000000000c1', 'HUE521', 'carro'),
  ('52000000-0000-0000-0000-0000000000a2', '52000000-0000-0000-0000-0000000000e1', '52000000-0000-0000-0000-0000000000c1', 'HUE522', 'carro'),
  ('52000000-0000-0000-0000-0000000000a3', '52000000-0000-0000-0000-0000000000e1', '52000000-0000-0000-0000-0000000000c2', 'HUE523', 'carro');
insert into ordenes (id, establecimiento_id, vehiculo_id, estado, subtotal, total) values
  ('52000000-0000-0000-0000-0000000000d1', '52000000-0000-0000-0000-0000000000e1', '52000000-0000-0000-0000-0000000000a1', 'entregado', 30000, 30000),
  ('52000000-0000-0000-0000-0000000000d2', '52000000-0000-0000-0000-0000000000e1', '52000000-0000-0000-0000-0000000000a3', 'en_lavado', 40000, 40000);
insert into consentimientos (establecimiento_id, cliente_id, otorgado, canal, politica_version)
  values ('52000000-0000-0000-0000-0000000000e1', '52000000-0000-0000-0000-0000000000c1', true, 'panel', privado.politica_vigente());
insert into notificaciones (establecimiento_id, cliente_id, tipo, evento, canal, destino)
  values ('52000000-0000-0000-0000-0000000000e1', '52000000-0000-0000-0000-0000000000c1', 'operativa', 'listo', 'correo', 'ana@correo.com');

create temp table respuesta as select
  public.eliminar_cliente('52000000-0000-0000-0000-0000000000e2', '52000000-0000-0000-0000-0000000000c1') as otro,
  public.eliminar_cliente('52000000-0000-0000-0000-0000000000e1', '52000000-0000-0000-0000-0000000000c2') as en_curso,
  public.eliminar_cliente('52000000-0000-0000-0000-0000000000e1', '52000000-0000-0000-0000-0000000000c1') as ana,
  public.eliminar_cliente('52000000-0000-0000-0000-0000000000e1', '52000000-0000-0000-0000-0000000000c3') as sin_vehiculos;

select pg_temp.verificar('Otro establecimiento no puede eliminarlo', (select otro->>'resultado' = 'no_encontrado' from respuesta), (select otro::text from respuesta));
select pg_temp.verificar('Con un servicio en curso no se elimina', (select en_curso->>'resultado' = 'servicios_en_curso' from respuesta), (select en_curso::text from respuesta));
select pg_temp.verificar('Con un servicio en curso se conservan cliente, vehículo y orden',
  exists (select 1 from clientes where id = '52000000-0000-0000-0000-0000000000c2')
  and exists (select 1 from ordenes where id = '52000000-0000-0000-0000-0000000000d2' and vehiculo_id = '52000000-0000-0000-0000-0000000000a3'), 'sin cambios');
select pg_temp.verificar('Informa los vehículos borrados y las órdenes conservadas',
  (select ana = '{"resultado": "eliminado", "vehiculos": 2, "ordenes": 1}'::jsonb from respuesta), (select ana::text from respuesta));
select pg_temp.verificar('CA1: el cliente ya no existe', not exists (select 1 from clientes where id = '52000000-0000-0000-0000-0000000000c1'), '0 filas');
select pg_temp.verificar('CA1: sus vehículos ya no existen', not exists (select 1 from vehiculos where cliente_id = '52000000-0000-0000-0000-0000000000c1' or placa in ('HUE521', 'HUE522')), '0 filas');
select pg_temp.verificar('Sus autorizaciones y notificaciones se borran',
  not exists (select 1 from consentimientos where cliente_id = '52000000-0000-0000-0000-0000000000c1')
  and not exists (select 1 from notificaciones where cliente_id = '52000000-0000-0000-0000-0000000000c1'), '0 filas');
select pg_temp.verificar('La orden entregada se conserva sin vehículo, con su valor',
  exists (select 1 from ordenes where id = '52000000-0000-0000-0000-0000000000d1' and vehiculo_id is null and total = 30000), 'estadísticas intactas');
select pg_temp.verificar('Un cliente sin vehículos también se elimina',
  (select sin_vehiculos = '{"resultado": "eliminado", "vehiculos": 0, "ordenes": 0}'::jsonb from respuesta), (select sin_vehiculos::text from respuesta));
select pg_temp.verificar('CA3: otro establecimiento conserva a su cliente con el mismo teléfono',
  exists (select 1 from clientes where id = '52000000-0000-0000-0000-0000000000c4'), '1 fila');
select pg_temp.verificar('Una orden nueva sigue sin poder apuntar a un vehículo de otro establecimiento',
  not exists (select 1 from vehiculos where id = '52000000-0000-0000-0000-0000000000a3' and establecimiento_id = '52000000-0000-0000-0000-0000000000e2'), 'llave compuesta vigente');
select pg_temp.verificar('Seguridad: el público y los usuarios del panel no pueden ejecutar la función',
  not has_function_privilege('anon', 'public.eliminar_cliente(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.eliminar_cliente(uuid, uuid)', 'execute'), 'solo service_role');

\o
\set QUIET off
\pset footer off
select n as "#", case when ok then 'PASA' else 'FALLA' end as resultado, prueba, detalle from resultados order by n;
select count(*) filter (where ok) || ' de ' || count(*) || ' pruebas aprobadas' as resumen from resultados;
