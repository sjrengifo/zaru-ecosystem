-- HU-42 CA1: integridad referencial y pertenencia de cada registro a su establecimiento.
-- Cada caso intenta una operación inválida y verifica que la base la rechace.
-- Uso: psql -d zaru_prueba -f database/pruebas/01_integridad.sql
\set QUIET on
set client_min_messages = notice;

create temp table resultados (n serial, prueba text, ok boolean, detalle text);

create or replace function pg_temp.debe_fallar(prueba text, sentencia text) returns void language plpgsql as $$
begin
  begin
    execute sentencia;
    insert into resultados (prueba, ok, detalle) values (prueba, false, 'la base aceptó la operación');
  exception when others then
    insert into resultados (prueba, ok, detalle) values (prueba, true, sqlstate || ': ' || left(sqlerrm, 90));
  end;
end $$;

create or replace function pg_temp.debe_pasar(prueba text, sentencia text) returns void language plpgsql as $$
begin
  execute sentencia;
  insert into resultados (prueba, ok, detalle) values (prueba, true, 'aceptada');
exception when others then
  insert into resultados (prueba, ok, detalle) values (prueba, false, sqlstate || ': ' || sqlerrm);
end $$;

\o /dev/null
-- Datos base: dos establecimientos con su administrador, cliente, vehículo, servicio, promoción y orden.
insert into auth.users (id) values ('10000000-0000-0000-0000-00000000000a'), ('10000000-0000-0000-0000-00000000000b');
insert into establecimientos (id, nombre) values
  ('a0000000-0000-0000-0000-000000000000', 'Lavadero A'), ('b0000000-0000-0000-0000-000000000000', 'Lavadero B');
insert into perfiles (id, establecimiento_id, nombre, rol) values
  ('10000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000000', 'Admin A', 'admin'),
  ('10000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000000', 'Admin B', 'admin');
insert into clientes (id, establecimiento_id, nombre, telefono, autorizacion_datos) values
  ('ac000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'Cliente A', '3000000001', true),
  ('bc000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'Cliente B', '3000000002', true);
insert into vehiculos (id, establecimiento_id, cliente_id, placa, tipo) values
  ('ae000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'ac000000-0000-0000-0000-000000000000', 'AAA001', 'carro'),
  ('be000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'bc000000-0000-0000-0000-000000000000', 'BBB001', 'carro');
insert into servicios (id, establecimiento_id, nombre, precio, duracion_min) values
  ('a5000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'Lavado A', 20000, 30),
  ('b5000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'Lavado B', 20000, 30);
insert into promociones (id, establecimiento_id, nombre, descuento_pct, fecha_inicio, fecha_fin) values
  ('a9000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'Promo A', 10, current_date, current_date + 7);
insert into ordenes (id, establecimiento_id, vehiculo_id, creada_por) values
  ('a0d00000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'ae000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-00000000000a');

-- Relaciones válidas dentro del mismo establecimiento.
select pg_temp.debe_pasar('Orden con servicio de su propio establecimiento',
  $q$insert into orden_servicios values ('a0d00000-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000000', 20000, 30)$q$);
select pg_temp.debe_pasar('Historial registrado por un usuario del mismo establecimiento',
  $q$insert into historial_estados (orden_id, estado, usuario_id) values ('a0d00000-0000-0000-0000-000000000000', 'en_lavado', '10000000-0000-0000-0000-00000000000a')$q$);
select pg_temp.debe_pasar('Notificación para un cliente y una orden del mismo establecimiento',
  $q$insert into notificaciones (establecimiento_id, cliente_id, orden_id, tipo, evento, canal, destino)
     values ('a0000000-0000-0000-0000-000000000000', 'ac000000-0000-0000-0000-000000000000', 'a0d00000-0000-0000-0000-000000000000', 'operativa', 'orden.listo', 'sms', '3000000001')$q$);

-- Relaciones entre establecimientos distintos: deben rechazarse.
select pg_temp.debe_fallar('Vehículo de A asociado a un cliente de B',
  $q$insert into vehiculos (establecimiento_id, cliente_id, placa, tipo) values ('a0000000-0000-0000-0000-000000000000', 'bc000000-0000-0000-0000-000000000000', 'XXX999', 'carro')$q$);
select pg_temp.debe_fallar('Orden de A con un vehículo de B',
  $q$insert into ordenes (establecimiento_id, vehiculo_id) values ('a0000000-0000-0000-0000-000000000000', 'be000000-0000-0000-0000-000000000000')$q$);
select pg_temp.debe_fallar('Orden de A creada por un usuario de B',
  $q$insert into ordenes (establecimiento_id, vehiculo_id, creada_por) values ('a0000000-0000-0000-0000-000000000000', 'ae000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-00000000000b')$q$);
select pg_temp.debe_fallar('Orden de A con un servicio de B',
  $q$insert into orden_servicios values ('a0d00000-0000-0000-0000-000000000000', 'b5000000-0000-0000-0000-000000000000', 20000, 30)$q$);
select pg_temp.debe_fallar('Promoción de A con un servicio de B',
  $q$insert into promocion_servicios values ('a9000000-0000-0000-0000-000000000000', 'b5000000-0000-0000-0000-000000000000')$q$);
select pg_temp.debe_fallar('Cambio de estado de una orden de A registrado por un usuario de B',
  $q$insert into historial_estados (orden_id, estado, usuario_id) values ('a0d00000-0000-0000-0000-000000000000', 'listo', '10000000-0000-0000-0000-00000000000b')$q$);
select pg_temp.debe_fallar('Notificación de A dirigida a un cliente de B',
  $q$insert into notificaciones (establecimiento_id, cliente_id, tipo, evento, canal, destino)
     values ('a0000000-0000-0000-0000-000000000000', 'bc000000-0000-0000-0000-000000000000', 'operativa', 'orden.listo', 'sms', '3000000002')$q$);
select pg_temp.debe_fallar('Mover una orden de A al establecimiento B sin cambiar su vehículo',
  $q$update ordenes set establecimiento_id = 'b0000000-0000-0000-0000-000000000000' where id = 'a0d00000-0000-0000-0000-000000000000'$q$);

-- Integridad referencial y reglas básicas.
select pg_temp.debe_fallar('Registro de negocio sin establecimiento',
  $q$insert into clientes (nombre, telefono, autorizacion_datos) values ('Sin sede', '3000000009', true)$q$);
select pg_temp.debe_fallar('Vehículo con un cliente inexistente',
  $q$insert into vehiculos (establecimiento_id, cliente_id, placa, tipo) values ('a0000000-0000-0000-0000-000000000000', gen_random_uuid(), 'ZZZ000', 'carro')$q$);
select pg_temp.debe_fallar('Teléfono de cliente repetido en el mismo establecimiento',
  $q$insert into clientes (establecimiento_id, nombre, telefono, autorizacion_datos) values ('a0000000-0000-0000-0000-000000000000', 'Otro', '3000000001', true)$q$);
select pg_temp.debe_pasar('El mismo teléfono en otro establecimiento sí se permite',
  $q$insert into clientes (establecimiento_id, nombre, telefono, autorizacion_datos) values ('b0000000-0000-0000-0000-000000000000', 'Mismo número', '3000000001', true)$q$);
select pg_temp.debe_fallar('Placa repetida en el mismo establecimiento',
  $q$insert into vehiculos (establecimiento_id, cliente_id, placa, tipo) values ('a0000000-0000-0000-0000-000000000000', 'ac000000-0000-0000-0000-000000000000', 'AAA001', 'moto')$q$);
select pg_temp.debe_fallar('Cliente sin autorización de tratamiento de datos',
  $q$insert into clientes (establecimiento_id, nombre, telefono, autorizacion_datos) values ('a0000000-0000-0000-0000-000000000000', 'Sin permiso', '3000000010', false)$q$);
select pg_temp.debe_fallar('Servicio con precio negativo',
  $q$insert into servicios (establecimiento_id, nombre, precio, duracion_min) values ('a0000000-0000-0000-0000-000000000000', 'Malo', -1, 30)$q$);
select pg_temp.debe_fallar('Estado de orden inexistente',
  $q$update ordenes set estado = 'perdida' where id = 'a0d00000-0000-0000-0000-000000000000'$q$);
select pg_temp.debe_fallar('Borrar un vehículo que tiene órdenes',
  $q$delete from vehiculos where id = 'ae000000-0000-0000-0000-000000000000'$q$);
select pg_temp.debe_pasar('Borrar un establecimiento elimina en cascada todos sus datos',
  $q$delete from establecimientos where id = 'b0000000-0000-0000-0000-000000000000'$q$);
select pg_temp.debe_pasar('Tras borrar B no queda ningún registro huérfano de B',
  $q$do $d$ begin if exists (select 1 from clientes where establecimiento_id = 'b0000000-0000-0000-0000-000000000000')
       or exists (select 1 from vehiculos where establecimiento_id = 'b0000000-0000-0000-0000-000000000000')
       or exists (select 1 from servicios where establecimiento_id = 'b0000000-0000-0000-0000-000000000000')
     then raise exception 'quedaron registros huérfanos'; end if; end $d$$q$);

-- RLS habilitado en todas las tablas de negocio.
select pg_temp.debe_pasar('RLS habilitado en todas las tablas del esquema public',
  $q$do $d$ begin if exists (select 1 from pg_tables where schemaname = 'public' and not rowsecurity)
     then raise exception 'hay tablas sin RLS'; end if; end $d$$q$);

\o
\set QUIET off
\pset footer off
select n as "#", case when ok then 'PASA' else 'FALLA' end as resultado, prueba, detalle from resultados order by n;
select count(*) filter (where ok) || ' de ' || count(*) || ' pruebas aprobadas' as resumen from resultados;
