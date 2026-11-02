-- HU-51: pruebas de la política de datos y de la evidencia de autorización en la base de datos.
-- Uso: psql -d zaru_prueba -f database/pruebas/05_consentimientos.sql
\set QUIET on
\o /dev/null
create temp table resultados (n serial, prueba text, ok boolean, detalle text);

create or replace function pg_temp.debe_fallar(prueba text, sentencia text) returns void language plpgsql as $$
begin
  begin
    execute sentencia;
    insert into resultados (prueba, ok, detalle) values (prueba, false, 'la base aceptó la operación');
  exception when others then
    insert into resultados (prueba, ok, detalle) values (prueba, true, sqlstate || ': ' || left(sqlerrm, 75));
  end;
end $$;

create or replace function pg_temp.verificar(prueba text, condicion boolean, detalle text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (prueba, coalesce(condicion, false), detalle);
$$;

insert into auth.users (id) values ('51000000-0000-0000-0000-00000000000a');
insert into establecimientos (id, nombre) values ('51000000-0000-0000-0000-0000000000e1', 'Lavadero HU-51');
insert into perfiles (id, establecimiento_id, nombre, rol) values ('51000000-0000-0000-0000-00000000000a', '51000000-0000-0000-0000-0000000000e1', 'Operario', 'operario');

-- CA1
select pg_temp.verificar('CA1: existe una política vigente con su texto',
  (select length(contenido) > 500 from politicas_datos where version = privado.politica_vigente()),
  'versión ' || coalesce(privado.politica_vigente(), 'ninguna'));
select pg_temp.debe_fallar('CA1: una versión publicada de la política no se puede editar',
  $q$update politicas_datos set contenido = 'otro texto'$q$);

-- CA3: sin autorización no se guarda nada
select pg_temp.debe_fallar('CA3: sin autorización el registro se rechaza',
  $q$select crear_cliente_con_consentimiento('51000000-0000-0000-0000-0000000000e1', 'Sin autorizar', '3005100001', null, false, privado.politica_vigente(), 'panel', '10.0.0.1', '51000000-0000-0000-0000-00000000000a')$q$);
select pg_temp.debe_fallar('CA3: con una versión de la política distinta a la vigente se rechaza',
  $q$select crear_cliente_con_consentimiento('51000000-0000-0000-0000-0000000000e1', 'Versión vieja', '3005100002', null, true, '0.9', 'panel', '10.0.0.1', '51000000-0000-0000-0000-00000000000a')$q$);
select pg_temp.verificar('CA3: los intentos rechazados no dejaron ningún dato personal',
  not exists (select 1 from clientes where telefono in ('3005100001', '3005100002')), '0 clientes guardados');

-- CA2: registro con autorización
select crear_cliente_con_consentimiento('51000000-0000-0000-0000-0000000000e1', 'Ana Autoriza', '3005100003', 'ana@correo.com', true, privado.politica_vigente(), 'panel', '10.0.0.7', '51000000-0000-0000-0000-00000000000a');
select pg_temp.verificar('CA2: se guarda la autorización con fecha, hora, versión, canal, IP y usuario',
  exists (select 1 from consentimientos k join clientes c on c.id = k.cliente_id
          where c.telefono = '3005100003' and k.otorgado and k.tipo = 'tratamiento_datos' and k.politica_version = privado.politica_vigente()
            and k.canal = 'panel' and k.ip = '10.0.0.7' and k.registrado_por = '51000000-0000-0000-0000-00000000000a'
            and k.created_at > now() - interval '1 minute'),
  'consentimiento completo');
select pg_temp.debe_fallar('CA2: la evidencia no se puede modificar',
  $q$update consentimientos set otorgado = false where politica_version = privado.politica_vigente()$q$);
select pg_temp.debe_fallar('CA2: la evidencia no se puede borrar directamente',
  $q$delete from consentimientos where politica_version = privado.politica_vigente()$q$);
select pg_temp.debe_fallar('CA2: una autorización nueva sin versión de la política se rechaza',
  $q$insert into consentimientos (establecimiento_id, cliente_id, otorgado, canal)
     select establecimiento_id, id, true, 'panel' from clientes where telefono = '3005100003'$q$);
insert into consentimientos (establecimiento_id, cliente_id, otorgado, canal, politica_version)
select establecimiento_id, id, false, 'app', privado.politica_vigente() from clientes where telefono = '3005100003';
select pg_temp.verificar('CA2: revocar es agregar un registro nuevo (el historial se conserva)',
  (select count(*) = 2 and bool_or(otorgado) and bool_or(not otorgado)
   from consentimientos k join clientes c on c.id = k.cliente_id where c.telefono = '3005100003'),
  '2 registros: otorgado y revocado');
create temp table titular_borrado as select id from clientes where telefono = '3005100003';
delete from clientes where telefono = '3005100003';
select pg_temp.verificar('CA2: si se elimina al titular, su evidencia se elimina con él',
  not exists (select 1 from consentimientos where cliente_id in (select id from titular_borrado)),
  'borrado en cascada permitido');
select pg_temp.verificar('Seguridad: el público y los usuarios del panel no pueden ejecutar la función de registro',
  not has_function_privilege('anon', 'public.crear_cliente_con_consentimiento(uuid, text, text, text, boolean, text, text, inet, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.crear_cliente_con_consentimiento(uuid, text, text, text, boolean, text, text, inet, uuid)', 'execute'),
  'solo service_role');

\o
\set QUIET off
\pset footer off
select n as "#", case when ok then 'PASA' else 'FALLA' end as resultado, prueba, detalle from resultados order by n;
select count(*) filter (where ok) || ' de ' || count(*) || ' pruebas aprobadas' as resumen from resultados;
