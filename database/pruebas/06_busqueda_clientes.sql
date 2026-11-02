-- HU-04: búsqueda de clientes por nombre, teléfono o placa, sin distinguir tildes ni mayúsculas.
-- Uso: psql -d zaru_prueba -f database/pruebas/06_busqueda_clientes.sql
\set QUIET on
\o /dev/null
create temp table resultados (n serial, prueba text, ok boolean, detalle text);

create or replace function pg_temp.encuentra(prueba text, establecimiento uuid, texto text, esperado text[]) returns void language sql as $$
  insert into resultados (prueba, ok, detalle)
  select prueba, coalesce(array_agg(nombre order by nombre), '{}') = esperado, coalesce(array_agg(nombre order by nombre)::text, '{}')
  from public.buscar_clientes(establecimiento, texto);
$$;

insert into establecimientos (id, nombre) values
  ('04000000-0000-0000-0000-0000000000e1', 'Lavadero HU-04 A'),
  ('04000000-0000-0000-0000-0000000000e2', 'Lavadero HU-04 B');
insert into clientes (id, establecimiento_id, nombre, telefono, autorizacion_datos) values
  ('04000000-0000-0000-0000-0000000000c1', '04000000-0000-0000-0000-0000000000e1', 'José Pérez', '3004000001', true),
  ('04000000-0000-0000-0000-0000000000c2', '04000000-0000-0000-0000-0000000000e1', 'MARÍA Ñáñez', '3104000002', true),
  ('04000000-0000-0000-0000-0000000000c3', '04000000-0000-0000-0000-0000000000e1', 'Ana_50% Gómez', '3204000003', true),
  ('04000000-0000-0000-0000-0000000000c4', '04000000-0000-0000-0000-0000000000e2', 'José Ajeno', '3004000001', true);
insert into vehiculos (establecimiento_id, cliente_id, placa, tipo) values
  ('04000000-0000-0000-0000-0000000000e1', '04000000-0000-0000-0000-0000000000c1', 'ABC123', 'carro'),
  ('04000000-0000-0000-0000-0000000000e2', '04000000-0000-0000-0000-0000000000c4', 'XYZ987', 'carro');

select pg_temp.encuentra('Nombre sin tilde encuentra con tilde', '04000000-0000-0000-0000-0000000000e1', 'jose perez', '{"José Pérez"}');
select pg_temp.encuentra('Nombre con tilde y en mayúsculas', '04000000-0000-0000-0000-0000000000e1', 'JOSÉ', '{"José Pérez"}');
select pg_temp.encuentra('La eñe se compara como n', '04000000-0000-0000-0000-0000000000e1', 'nanez', '{"MARÍA Ñáñez"}');
select pg_temp.encuentra('Teléfono parcial', '04000000-0000-0000-0000-0000000000e1', '31040', '{"MARÍA Ñáñez"}');
select pg_temp.encuentra('Teléfono con espacios y guiones', '04000000-0000-0000-0000-0000000000e1', '300 400-0001', '{"José Pérez"}');
select pg_temp.encuentra('Placa en minúsculas', '04000000-0000-0000-0000-0000000000e1', 'abc123', '{"José Pérez"}');
select pg_temp.encuentra('Placa con guion', '04000000-0000-0000-0000-0000000000e1', 'abc-123', '{"José Pérez"}');
select pg_temp.encuentra('Los comodines se buscan literalmente: %', '04000000-0000-0000-0000-0000000000e1', '%', '{"Ana_50% Gómez"}');
select pg_temp.encuentra('Los comodines se buscan literalmente: _', '04000000-0000-0000-0000-0000000000e1', '_', '{"Ana_50% Gómez"}');
select pg_temp.encuentra('Un guion solo no coincide con todos', '04000000-0000-0000-0000-0000000000e1', '-', '{}');
select pg_temp.encuentra('Aislamiento: no encuentra placas de otro establecimiento', '04000000-0000-0000-0000-0000000000e1', 'XYZ987', '{}');
select pg_temp.encuentra('Aislamiento: el mismo nombre solo trae su establecimiento', '04000000-0000-0000-0000-0000000000e2', 'jose', '{"José Ajeno"}');

insert into resultados (prueba, ok, detalle) select 'Seguridad: el público y los usuarios del panel no pueden ejecutar la búsqueda',
  not has_function_privilege('anon', 'public.buscar_clientes(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.buscar_clientes(uuid, text)', 'execute'),
  'solo service_role';

\o
\set QUIET off
\pset footer off
select n as "#", case when ok then 'PASA' else 'FALLA' end as resultado, prueba, detalle from resultados order by n;
select count(*) filter (where ok) || ' de ' || count(*) || ' pruebas aprobadas' as resumen from resultados;
