-- HU-10: avanzar, revertir y cerrar una orden con historial y evento.
-- Uso: psql -d zaru_prueba -f database/pruebas/11_estado_orden.sql
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

insert into auth.users (id) values ('11000000-0000-0000-0000-00000000000a');
insert into establecimientos (id, nombre) values
  ('11000000-0000-0000-0000-0000000000e1', 'Lavadero HU-10 A'),
  ('11000000-0000-0000-0000-0000000000e2', 'Lavadero HU-10 B');
insert into perfiles (id, establecimiento_id, nombre, rol) values
  ('11000000-0000-0000-0000-00000000000a', '11000000-0000-0000-0000-0000000000e1', 'Operario HU-10', 'operario');
insert into clientes (id, establecimiento_id, nombre, telefono, autorizacion_datos) values
  ('11000000-0000-0000-0000-0000000000c1', '11000000-0000-0000-0000-0000000000e1', 'Ana HU-10', '3001100101', true),
  ('11000000-0000-0000-0000-0000000000c2', '11000000-0000-0000-0000-0000000000e2', 'Cliente B HU-10', '3001100102', true);
insert into vehiculos (id, establecimiento_id, cliente_id, placa, tipo) values
  ('11000000-0000-0000-0000-0000000000f1', '11000000-0000-0000-0000-0000000000e1', '11000000-0000-0000-0000-0000000000c1', 'HU1001', 'carro'),
  ('11000000-0000-0000-0000-0000000000f2', '11000000-0000-0000-0000-0000000000e1', '11000000-0000-0000-0000-0000000000c1', 'HU1002', 'carro'),
  ('11000000-0000-0000-0000-0000000000f3', '11000000-0000-0000-0000-0000000000e1', '11000000-0000-0000-0000-0000000000c1', 'HU1003', 'carro'),
  ('11000000-0000-0000-0000-0000000000f4', '11000000-0000-0000-0000-0000000000e2', '11000000-0000-0000-0000-0000000000c2', 'HU1004', 'carro');
insert into ordenes (id, establecimiento_id, vehiculo_id, estado, total, codigo_seguimiento) values
  ('11000000-0000-0000-0000-0000000000a1', '11000000-0000-0000-0000-0000000000e1', '11000000-0000-0000-0000-0000000000f1', 'recibido', 25000, 'HU2AAAAAAA'),
  ('11000000-0000-0000-0000-0000000000a2', '11000000-0000-0000-0000-0000000000e1', '11000000-0000-0000-0000-0000000000f2', 'recibido', 25000, 'HU2BBBBBBB'),
  ('11000000-0000-0000-0000-0000000000a3', '11000000-0000-0000-0000-0000000000e1', '11000000-0000-0000-0000-0000000000f3', 'recibido', 25000, 'HU2CCCCCCC'),
  ('11000000-0000-0000-0000-0000000000b1', '11000000-0000-0000-0000-0000000000e2', '11000000-0000-0000-0000-0000000000f4', 'recibido', 25000, 'HU2DDDDDDD');
insert into historial_estados (orden_id, estado, usuario_id) values
  ('11000000-0000-0000-0000-0000000000a1', 'recibido', '11000000-0000-0000-0000-00000000000a'),
  ('11000000-0000-0000-0000-0000000000a2', 'recibido', '11000000-0000-0000-0000-00000000000a'),
  ('11000000-0000-0000-0000-0000000000a3', 'recibido', '11000000-0000-0000-0000-00000000000a'),
  ('11000000-0000-0000-0000-0000000000b1', 'recibido', null);

---------------------------------------------------------------------------
-- CA1: recorrido completo con historial y evento
---------------------------------------------------------------------------
select public.cambiar_estado_orden('11000000-0000-0000-0000-0000000000e1', '11000000-0000-0000-0000-0000000000a1', 'en_lavado', '11000000-0000-0000-0000-00000000000a', false);
select public.cambiar_estado_orden('11000000-0000-0000-0000-0000000000e1', '11000000-0000-0000-0000-0000000000a1', 'secado', '11000000-0000-0000-0000-00000000000a', false);
select public.cambiar_estado_orden('11000000-0000-0000-0000-0000000000e1', '11000000-0000-0000-0000-0000000000a1', 'listo', '11000000-0000-0000-0000-00000000000a', false);
select public.cambiar_estado_orden('11000000-0000-0000-0000-0000000000e1', '11000000-0000-0000-0000-0000000000a1', 'entregado', '11000000-0000-0000-0000-00000000000a', false);

select pg_temp.verificar('CA1: la orden termina entregada, con versión y fecha de entrega',
  (select estado = 'entregado' and version = 5 and entregada_at is not null
   from ordenes where id = '11000000-0000-0000-0000-0000000000a1'), 'entregado');

select pg_temp.verificar('CA1: el historial guarda estado anterior, nuevo, usuario y hora en cada cambio',
  (select count(*) = 5
     and bool_and(usuario_id = '11000000-0000-0000-0000-00000000000a')
     and bool_and(created_at is not null)
   from historial_estados where orden_id = '11000000-0000-0000-0000-0000000000a1'), '5 registros');

select pg_temp.verificar('CA1: el historial conserva la secuencia de estados',
  (select array_agg(estado order by id) = array['recibido', 'en_lavado', 'secado', 'listo', 'entregado']::estado_orden[]
   from historial_estados where orden_id = '11000000-0000-0000-0000-0000000000a1'), 'secuencia completa');

select pg_temp.verificar('CA2: cada cambio deja un evento orden.estado_cambiado',
  (select count(*) = 4
     and bool_and(tipo = 'orden.estado_cambiado')
     and bool_and(payload->>'estadoNuevo' is not null)
   from eventos where orden_id = '11000000-0000-0000-0000-0000000000a1'), '4 eventos');

select pg_temp.verificar('CA2: el evento de listo incluye placa, total y código de seguimiento',
  exists (
    select 1 from eventos
    where orden_id = '11000000-0000-0000-0000-0000000000a1'
      and payload->>'estadoNuevo' = 'listo'
      and payload->>'placa' = 'HU1001'
      and payload->>'codigoSeguimiento' = 'HU2AAAAAAA'
      and payload->>'total' = '25000.00'
  ), 'datos para HU-46');

select pg_temp.verificar('CA3: la orden entregada aparece en el historial del vehículo',
  exists (
    select 1 from ordenes
    where id = '11000000-0000-0000-0000-0000000000a1'
      and vehiculo_id = '11000000-0000-0000-0000-0000000000f1'
      and entregada_at is not null
  ), 'cerrada con entregada_at');

---------------------------------------------------------------------------
-- RF-F3-05: transición inválida
---------------------------------------------------------------------------
select pg_temp.debe_fallar('RF-F3-05: no se puede saltar de recibido a entregado',
  $q$select public.cambiar_estado_orden('11000000-0000-0000-0000-0000000000e1', '11000000-0000-0000-0000-0000000000a3', 'entregado', '11000000-0000-0000-0000-00000000000a', false)$q$);
select pg_temp.verificar('RF-F3-05: la transición inválida no cambió el estado ni dejó historial o evento',
  (select estado = 'recibido' and version = 1 from ordenes where id = '11000000-0000-0000-0000-0000000000a3')
  and not exists (select 1 from historial_estados where orden_id = '11000000-0000-0000-0000-0000000000a3' and estado <> 'recibido')
  and not exists (select 1 from eventos where orden_id = '11000000-0000-0000-0000-0000000000a3'),
  'sin cambios');

---------------------------------------------------------------------------
-- RF-F3-07: reversión dentro de 60 segundos
---------------------------------------------------------------------------
select public.cambiar_estado_orden('11000000-0000-0000-0000-0000000000e1', '11000000-0000-0000-0000-0000000000a2', 'en_lavado', '11000000-0000-0000-0000-00000000000a', false);
select public.cambiar_estado_orden('11000000-0000-0000-0000-0000000000e1', '11000000-0000-0000-0000-0000000000a2', null, '11000000-0000-0000-0000-00000000000a', true);

select pg_temp.verificar('RF-F3-07: la reversión vuelve al estado anterior',
  (select estado = 'recibido' from ordenes where id = '11000000-0000-0000-0000-0000000000a2'), 'recibido');
select pg_temp.verificar('RF-F3-07: el último cambio queda marcado como revertido',
  (select revertido from historial_estados
   where orden_id = '11000000-0000-0000-0000-0000000000a2' and estado = 'en_lavado'), 'revertido');
select pg_temp.verificar('RF-F3-07: la reversión genera un evento propio',
  exists (
    select 1 from eventos
    where orden_id = '11000000-0000-0000-0000-0000000000a2'
      and tipo = 'orden.estado_revertido'
  ), 'orden.estado_revertido');

select pg_temp.debe_fallar('RF-F3-07: una orden entregada no se puede revertir',
  $q$select public.cambiar_estado_orden('11000000-0000-0000-0000-0000000000e1', '11000000-0000-0000-0000-0000000000a1', null, '11000000-0000-0000-0000-00000000000a', true)$q$);

---------------------------------------------------------------------------
-- Aislamiento y permisos
---------------------------------------------------------------------------
select pg_temp.debe_fallar('Una orden de otra sede no se puede cambiar',
  $q$select public.cambiar_estado_orden('11000000-0000-0000-0000-0000000000e1', '11000000-0000-0000-0000-0000000000b1', 'en_lavado', '11000000-0000-0000-0000-00000000000a', false)$q$);
select pg_temp.verificar('La orden de otra sede conserva su estado',
  (select estado = 'recibido' from ordenes where id = '11000000-0000-0000-0000-0000000000b1'), 'sin cambios');

select pg_temp.verificar('Solo service_role ejecuta cambiar_estado_orden',
  not has_function_privilege('anon', 'public.cambiar_estado_orden(uuid, uuid, estado_orden, uuid, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.cambiar_estado_orden(uuid, uuid, estado_orden, uuid, boolean)', 'execute')
  and has_function_privilege('service_role', 'public.cambiar_estado_orden(uuid, uuid, estado_orden, uuid, boolean)', 'execute'), 'privilegios');

delete from ordenes where establecimiento_id in ('11000000-0000-0000-0000-0000000000e1', '11000000-0000-0000-0000-0000000000e2');
delete from perfiles where id = '11000000-0000-0000-0000-00000000000a';
delete from auth.users where id = '11000000-0000-0000-0000-00000000000a';
delete from establecimientos where id in ('11000000-0000-0000-0000-0000000000e1', '11000000-0000-0000-0000-0000000000e2');

\o
\set QUIET off
\pset footer off
select n as "#", case when ok then 'PASA' else 'FALLA' end as resultado, prueba, detalle from resultados order by n;
select count(*) filter (where ok) || ' de ' || count(*) || ' pruebas aprobadas' as resumen from resultados;

