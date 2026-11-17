-- HU-31: configuración de los estados que generan notificación por establecimiento.
-- CA1: cinco estados con interruptor; CA2: "listo" obligatorio; CA3: por sede y de inmediato.
-- Uso: psql -d zaru_prueba -f database/pruebas/12_configuracion_notificaciones.sql
\set QUIET on
\o /dev/null
create temp table resultados (n serial, prueba text, ok boolean, detalle text);

create or replace function pg_temp.verificar(prueba text, condicion boolean, detalle text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (prueba, coalesce(condicion, false), detalle);
$$;

create or replace function pg_temp.debe_fallar(prueba text, sentencia text) returns void language plpgsql as $$
begin
  begin
    execute sentencia;
    insert into resultados (prueba, ok, detalle) values (prueba, false, 'la base aceptó la operación');
  exception when others then
    insert into resultados (prueba, ok, detalle) values (prueba, true, sqlstate || ': ' || left(sqlerrm, 75));
  end;
end $$;

insert into auth.users (id) values ('13000000-0000-0000-0000-00000000000a');
insert into establecimientos (id, nombre, estado, prueba_finaliza_at) values
  ('13000000-0000-0000-0000-0000000000e1', 'Lavadero HU-31 A', 'activo', null),
  ('13000000-0000-0000-0000-0000000000e2', 'Lavadero HU-31 B', 'activo', null);
insert into perfiles (id, establecimiento_id, nombre, rol) values
  ('13000000-0000-0000-0000-00000000000a', '13000000-0000-0000-0000-0000000000e1', 'Admin HU-31', 'admin');

---------------------------------------------------------------------------
-- CA1 y CA2: valores por defecto y "listo" obligatorio
---------------------------------------------------------------------------
select pg_temp.verificar('CA1: una sede nueva nace con los cinco estados activos',
  (select count(*) = 5 and bool_and(activo)
   from config_notificaciones
   where establecimiento_id = '13000000-0000-0000-0000-0000000000e1'), '5 estados activos');
select pg_temp.verificar('CA1: la segunda sede también recibe su propia configuración',
  (select count(*) = 5
   from config_notificaciones
   where establecimiento_id = '13000000-0000-0000-0000-0000000000e2'), 'configuración por sede');

select pg_temp.debe_fallar('CA2: la base rechaza insertar "listo" apagado',
  $q$insert into config_notificaciones (establecimiento_id, estado, activo)
     values ('13000000-0000-0000-0000-0000000000e1', 'listo', false)$q$);
select pg_temp.debe_fallar('CA2: la base rechaza apagar "listo" con un update directo',
  $q$update config_notificaciones set activo = false
     where establecimiento_id = '13000000-0000-0000-0000-0000000000e1' and estado = 'listo'$q$);

---------------------------------------------------------------------------
-- CA1 y CA2: guardar_config_notificaciones
---------------------------------------------------------------------------
select * from public.guardar_config_notificaciones(
  '13000000-0000-0000-0000-0000000000e1',
  '[{"estado":"en_lavado","activo":false},{"estado":"secado","activo":false}]'::jsonb
);
select pg_temp.verificar('CA1: el RPC guarda los interruptores enviados',
  (select not activo from config_notificaciones
   where establecimiento_id = '13000000-0000-0000-0000-0000000000e1' and estado in ('en_lavado', 'secado') limit 1)
  and (select count(*) = 2 from config_notificaciones
       where establecimiento_id = '13000000-0000-0000-0000-0000000000e1' and estado in ('en_lavado', 'secado') and not activo),
  'en_lavado y secado apagados');
select pg_temp.verificar('CA1: los estados no enviados conservan su valor',
  (select activo from config_notificaciones
   where establecimiento_id = '13000000-0000-0000-0000-0000000000e1' and estado = 'recibido')
  and (select activo from config_notificaciones
       where establecimiento_id = '13000000-0000-0000-0000-0000000000e1' and estado = 'listo')
  and (select activo from config_notificaciones
       where establecimiento_id = '13000000-0000-0000-0000-0000000000e1' and estado = 'entregado'),
  'recibido, listo y entregado activos');

select pg_temp.debe_fallar('CA2: el RPC rechaza apagar "listo"',
  $q$select * from public.guardar_config_notificaciones(
       '13000000-0000-0000-0000-0000000000e1',
       '[{"estado":"listo","activo":false}]'::jsonb)$q$);
select pg_temp.debe_fallar('El RPC rechaza una configuración que no es una lista',
  $q$select * from public.guardar_config_notificaciones(
       '13000000-0000-0000-0000-0000000000e1', '{}'::jsonb)$q$);

---------------------------------------------------------------------------
-- CA3: cada sede conserva su configuración
---------------------------------------------------------------------------
select * from public.guardar_config_notificaciones(
  '13000000-0000-0000-0000-0000000000e2',
  '[{"estado":"entregado","activo":false}]'::jsonb
);
select pg_temp.verificar('CA3: el cambio de B no toca la configuración de A',
  (select not activo from config_notificaciones
   where establecimiento_id = '13000000-0000-0000-0000-0000000000e2' and estado = 'entregado')
  and (select activo from config_notificaciones
       where establecimiento_id = '13000000-0000-0000-0000-0000000000e1' and estado = 'entregado'),
  'A conserva entregado activo');

set role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-00000000000a', false);
create temp table config_admin_a as
  select establecimiento_id, estado from config_notificaciones;
reset role;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.verificar('CA3: con RLS, la sede A solo ve sus cinco filas',
  (select count(*) = 5 from config_admin_a
   where establecimiento_id = '13000000-0000-0000-0000-0000000000e1'), '5 filas propias');
select pg_temp.verificar('CA3: con RLS, la sede A no ve la configuración de B',
  (select count(*) = 0 from config_admin_a
   where establecimiento_id = '13000000-0000-0000-0000-0000000000e2'), '0 filas ajenas');

select pg_temp.verificar('Solo service_role ejecuta guardar_config_notificaciones',
  not has_function_privilege('anon', 'public.guardar_config_notificaciones(uuid, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.guardar_config_notificaciones(uuid, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.guardar_config_notificaciones(uuid, jsonb)', 'execute'), 'privilegios');

delete from perfiles where id = '13000000-0000-0000-0000-00000000000a';
delete from auth.users where id = '13000000-0000-0000-0000-00000000000a';
delete from establecimientos where id in ('13000000-0000-0000-0000-0000000000e1', '13000000-0000-0000-0000-0000000000e2');

\o
\set QUIET off
\pset footer off
select n as "#", case when ok then 'PASA' else 'FALLA' end as resultado, prueba, detalle from resultados order by n;
select count(*) filter (where ok) || ' de ' || count(*) || ' pruebas aprobadas' as resumen from resultados;
