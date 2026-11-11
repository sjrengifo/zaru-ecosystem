-- HU-08: crear la orden de un vehículo registrado o de un cliente y vehículo nuevos.
-- Uso: psql -d zaru_prueba -f database/pruebas/10_ordenes.sql
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

insert into auth.users (id) values ('10000000-0000-0000-0000-00000000000a');
insert into establecimientos (id, nombre) values
  ('10000000-0000-0000-0000-0000000000e1', 'Lavadero HU-08 A'),
  ('10000000-0000-0000-0000-0000000000e2', 'Lavadero HU-08 B');
insert into perfiles (id, establecimiento_id, nombre, rol) values
  ('10000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000e1', 'Operario HU-08', 'operario');
insert into servicios (id, establecimiento_id, nombre, precio, duracion_min, activo) values
  ('10000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000e1', 'Lavado básico', 25000, 30, true),
  ('10000000-0000-0000-0000-0000000000d2', '10000000-0000-0000-0000-0000000000e1', 'Lavado de motor', 30000, 40, true),
  ('10000000-0000-0000-0000-0000000000d3', '10000000-0000-0000-0000-0000000000e1', 'Lavado inactivo', 10000, 10, false),
  ('10000000-0000-0000-0000-0000000000d4', '10000000-0000-0000-0000-0000000000e2', 'Lavado de B', 20000, 20, true);
insert into clientes (id, establecimiento_id, nombre, telefono, autorizacion_datos) values
  ('10000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-0000000000e1', 'Ana Registrada', '3001000101', true),
  ('10000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-0000000000e2', 'Cliente de B', '3001000104', true);
insert into vehiculos (id, establecimiento_id, cliente_id, placa, tipo) values
  ('10000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000c1', 'HU8101', 'carro'),
  ('10000000-0000-0000-0000-0000000000f2', '10000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000c1', 'HU8103', 'carro'),
  ('10000000-0000-0000-0000-0000000000f4', '10000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-0000000000c2', 'HU8104', 'carro');

insert into promociones (id, establecimiento_id, nombre, descuento_pct, fecha_inicio, fecha_fin)
values ('10000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000e1', 'Motor 20', 20, privado.hoy_bogota() - 1, privado.hoy_bogota() + 1);
insert into promocion_servicios (promocion_id, servicio_id) values
  ('10000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000d2');

create temp table ids (clave text primary key, id uuid);

---------------------------------------------------------------------------
-- CA1: vehículo registrado, precios, promoción, entrega e historial
---------------------------------------------------------------------------
insert into ids select 'ca1', public.crear_orden(
  '10000000-0000-0000-0000-0000000000e1',
  '10000000-0000-0000-0000-0000000000f1',
  array['10000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d2']::uuid[],
  '  Rayón en la puerta  ',
  '10000000-0000-0000-0000-00000000000a'
);

select pg_temp.verificar('CA1: la orden queda recibida con subtotal, descuento y total calculados',
  (select estado = 'recibido' and subtotal = 55000 and descuento = 6000 and total = 49000 and observaciones = 'Rayón en la puerta'
   from ordenes where id = (select id from ids where clave = 'ca1')), '55 000 − 6 000 = 49 000');

select pg_temp.verificar('CA1: genera un código de seguimiento de 10 caracteres sin ambigüedades',
  (select codigo_seguimiento ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$'
   from ordenes where id = (select id from ids where clave = 'ca1')), 'alfabeto permitido');

select pg_temp.verificar('RF-F3-04: la entrega estimada es ahora + la duración de los servicios',
  (select entrega_estimada_at between created_at + interval '69 minutes' and created_at + interval '71 minutes'
   from ordenes where id = (select id from ids where clave = 'ca1')), '30 + 40 = 70 minutos');

select pg_temp.verificar('RF-F3-04: guarda precio y duración del momento para cada servicio',
  (select count(*) = 2
     and bool_and(os.precio = s.precio and os.duracion_min = s.duracion_min)
   from orden_servicios os join servicios s on s.id = os.servicio_id
   where os.orden_id = (select id from ids where clave = 'ca1')), 'dos servicios copiados');

select pg_temp.verificar('HU-12 CA3: aplica la mejor promoción vigente y la guarda en la orden',
  (select o.promocion_id = '10000000-0000-0000-0000-0000000000a1'
     and os.descuento = 6000 and os.promocion_id = o.promocion_id
   from ordenes o join orden_servicios os on os.orden_id = o.id
   where o.id = (select id from ids where clave = 'ca1')
     and os.servicio_id = '10000000-0000-0000-0000-0000000000d2'), '20 % de 30 000');

select pg_temp.verificar('RF-F3-06: deja el primer registro del historial con el usuario',
  exists (select 1 from historial_estados
          where orden_id = (select id from ids where clave = 'ca1')
            and estado = 'recibido' and usuario_id = '10000000-0000-0000-0000-00000000000a'), 'historial inicial');

---------------------------------------------------------------------------
-- RF-F3-03: una sola orden activa por vehículo
---------------------------------------------------------------------------
select pg_temp.debe_fallar('RF-F3-03: no permite una segunda orden activa para el mismo vehículo',
  $q$select public.crear_orden('10000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000f1',
    array['10000000-0000-0000-0000-0000000000d1']::uuid[], null, '10000000-0000-0000-0000-00000000000a')$q$);
select pg_temp.verificar('RF-F3-03: el intento rechazado no dejó otra orden',
  (select count(*) = 1 from ordenes where vehiculo_id = '10000000-0000-0000-0000-0000000000f1'), 'una orden');

select pg_temp.debe_fallar('RF-F3-03: el índice parcial también protege una inserción directa',
  $q$insert into ordenes (establecimiento_id, vehiculo_id, estado, subtotal, total, codigo_seguimiento)
     values ('10000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000f1', 'recibido', 0, 0, 'DUPLICADA1')$q$);

---------------------------------------------------------------------------
-- RF-F3-01: servicios válidos, del tenant y sin repetir
---------------------------------------------------------------------------
select pg_temp.debe_fallar('Sin servicios se rechaza',
  $q$select public.crear_orden('10000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000f2', '{}', null, '10000000-0000-0000-0000-00000000000a')$q$);
select pg_temp.debe_fallar('Un servicio repetido se rechaza',
  $q$select public.crear_orden('10000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000f2',
    array['10000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1']::uuid[], null, '10000000-0000-0000-0000-00000000000a')$q$);
select pg_temp.debe_fallar('Un servicio inactivo se rechaza',
  $q$select public.crear_orden('10000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000f2',
    array['10000000-0000-0000-0000-0000000000d3']::uuid[], null, '10000000-0000-0000-0000-00000000000a')$q$);
select pg_temp.debe_fallar('Un servicio de otra sede se rechaza',
  $q$select public.crear_orden('10000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000f2',
    array['10000000-0000-0000-0000-0000000000d4']::uuid[], null, '10000000-0000-0000-0000-00000000000a')$q$);
select pg_temp.debe_fallar('Un vehículo de otra sede se rechaza',
  $q$select public.crear_orden('10000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000f4',
    array['10000000-0000-0000-0000-0000000000d1']::uuid[], null, '10000000-0000-0000-0000-00000000000a')$q$);
select pg_temp.verificar('Los intentos inválidos no crearon órdenes',
  (select count(*) = 1 from ordenes), 'solo la orden CA1');

---------------------------------------------------------------------------
-- CA2: cliente + consentimiento + vehículo + orden en una transacción
---------------------------------------------------------------------------
insert into ids select 'ca2', public.crear_orden(
  '10000000-0000-0000-0000-0000000000e1',
  null,
  array['10000000-0000-0000-0000-0000000000d1']::uuid[],
  null,
  '10000000-0000-0000-0000-00000000000a',
  jsonb_build_object(
    'nombre', 'Cliente Nuevo', 'telefono', '3001000102', 'correo', 'nuevo@example.com',
    'autorizacionDatos', true, 'politicaVersion', privado.politica_vigente(), 'canal', 'panel', 'ip', '10.0.0.8'
  ),
  jsonb_build_object('placa', 'HU8102', 'tipo', 'carro', 'marca', 'Renault', 'color', 'Gris')
);

select pg_temp.verificar('CA2: crea cliente, consentimiento, vehículo y orden juntos',
  (select c.nombre = 'Cliente Nuevo' and k.otorgado and k.politica_version = privado.politica_vigente()
     and v.placa = 'HU8102' and o.estado = 'recibido'
   from clientes c
   join consentimientos k on k.cliente_id = c.id and k.tipo = 'tratamiento_datos' -- HU-30: hay una fila por autorización
   join vehiculos v on v.cliente_id = c.id
   join ordenes o on o.vehiculo_id = v.id
   where c.telefono = '3001000102' and o.id = (select id from ids where clave = 'ca2')), 'una sola transacción');

select pg_temp.debe_fallar('CA2: una política no vigente revierte todo',
  $q$select public.crear_orden('10000000-0000-0000-0000-0000000000e1', null,
    array['10000000-0000-0000-0000-0000000000d1']::uuid[], null, '10000000-0000-0000-0000-00000000000a',
    jsonb_build_object('nombre', 'Sin política', 'telefono', '3001000105', 'correo', 'x@example.com',
      'autorizacionDatos', true, 'politicaVersion', '0.0'),
    jsonb_build_object('placa', 'HU8105', 'tipo', 'carro'))$q$);
select pg_temp.verificar('CA2: la política inválida no dejó cliente ni vehículo',
  not exists (select 1 from clientes where telefono = '3001000105')
  and not exists (select 1 from vehiculos where placa = 'HU8105'), '0 registros');

select pg_temp.debe_fallar('CA2: un teléfono repetido revierte todo',
  $q$select public.crear_orden('10000000-0000-0000-0000-0000000000e1', null,
    array['10000000-0000-0000-0000-0000000000d1']::uuid[], null, '10000000-0000-0000-0000-00000000000a',
    jsonb_build_object('nombre', 'Teléfono repetido', 'telefono', '3001000101', 'correo', null,
      'autorizacionDatos', true, 'politicaVersion', privado.politica_vigente()),
    jsonb_build_object('placa', 'HU8106', 'tipo', 'carro'))$q$);
select pg_temp.verificar('CA2: el teléfono repetido no dejó el vehículo',
  not exists (select 1 from vehiculos where placa = 'HU8106'), '0 vehículos');

select pg_temp.debe_fallar('CA2: una placa repetida revierte también el cliente',
  $q$select public.crear_orden('10000000-0000-0000-0000-0000000000e1', null,
    array['10000000-0000-0000-0000-0000000000d1']::uuid[], null, '10000000-0000-0000-0000-00000000000a',
    jsonb_build_object('nombre', 'Placa repetida', 'telefono', '3001000107', 'correo', null,
      'autorizacionDatos', true, 'politicaVersion', privado.politica_vigente()),
    jsonb_build_object('placa', 'HU8101', 'tipo', 'carro'))$q$);
select pg_temp.verificar('CA2: la placa repetida no dejó al cliente',
  not exists (select 1 from clientes where telefono = '3001000107'), '0 clientes');

select pg_temp.debe_fallar('Sin vehículo ni datos nuevos se rechaza',
  $q$select public.crear_orden('10000000-0000-0000-0000-0000000000e1', null,
    array['10000000-0000-0000-0000-0000000000d1']::uuid[], null, '10000000-0000-0000-0000-00000000000a')$q$);

---------------------------------------------------------------------------
-- Permisos
---------------------------------------------------------------------------
select pg_temp.verificar('Solo service_role ejecuta crear_orden',
  not has_function_privilege('anon', 'public.crear_orden(uuid, uuid, uuid[], text, uuid, jsonb, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.crear_orden(uuid, uuid, uuid[], text, uuid, jsonb, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.crear_orden(uuid, uuid, uuid[], text, uuid, jsonb, jsonb)', 'execute'), 'privilegios');
select pg_temp.verificar('El generador de códigos no se expone al panel',
  not has_function_privilege('anon', 'privado.nuevo_codigo_seguimiento()', 'execute')
  and not has_function_privilege('authenticated', 'privado.nuevo_codigo_seguimiento()', 'execute'), 'solo uso interno');

delete from ordenes where establecimiento_id in ('10000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e2');
delete from perfiles where id = '10000000-0000-0000-0000-00000000000a';
delete from auth.users where id = '10000000-0000-0000-0000-00000000000a';
delete from establecimientos where id in ('10000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000e2');

\o
\set QUIET off
\pset footer off
select n as "#", case when ok then 'PASA' else 'FALLA' end as resultado, prueba, detalle from resultados order by n;
select count(*) filter (where ok) || ' de ' || count(*) || ' pruebas aprobadas' as resumen from resultados;
