-- HU-12: estado de las promociones por fecha (Bogotá), guardado atómico y mejor promoción por servicio.
-- Uso: psql -d zaru_prueba -f database/pruebas/09_promociones.sql
\set QUIET on
\o /dev/null
create temp table resultados (n serial, prueba text, ok boolean, detalle text);

create or replace function pg_temp.verificar(prueba text, condicion boolean, detalle text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (prueba, coalesce(condicion, false), detalle);
$$;

-- Sede A con dos servicios y sede B con uno. Fechas fijas: "hoy" en las pruebas es el 15 de noviembre de 2026.
insert into establecimientos (id, nombre) values
  ('12000000-0000-0000-0000-0000000000e1', 'Lavadero HU-12 A'),
  ('12000000-0000-0000-0000-0000000000e2', 'Lavadero HU-12 B');
insert into servicios (id, establecimiento_id, nombre, precio, duracion_min) values
  ('12000000-0000-0000-0000-0000000000d1', '12000000-0000-0000-0000-0000000000e1', 'Lavado de motor', 30000, 40),
  ('12000000-0000-0000-0000-0000000000d2', '12000000-0000-0000-0000-0000000000e1', 'Lavado básico', 25000, 30),
  ('12000000-0000-0000-0000-0000000000d3', '12000000-0000-0000-0000-0000000000e2', 'Lavado de motor B', 30000, 40);

---------------------------------------------------------------------------
-- RF-F4-02: estado según la fecha
---------------------------------------------------------------------------
select pg_temp.verificar('Vigente el primer día (inicio incluido)',
  privado.estado_promocion(true, '2026-11-15', '2026-11-30', '2026-11-15') = 'vigente', 'inicio = hoy');
select pg_temp.verificar('Vigente el último día (fin incluido)',
  privado.estado_promocion(true, '2026-11-01', '2026-11-15', '2026-11-15') = 'vigente', 'fin = hoy');
select pg_temp.verificar('CA2: vencida al día siguiente del fin, sin intervención',
  privado.estado_promocion(true, '2026-11-01', '2026-11-14', '2026-11-15') = 'vencida', 'fin = ayer');
select pg_temp.verificar('Programada si aún no empieza',
  privado.estado_promocion(true, '2026-11-16', '2026-11-30', '2026-11-15') = 'programada', 'inicio = mañana');
select pg_temp.verificar('Desactivada aunque esté dentro de sus fechas',
  privado.estado_promocion(false, '2026-11-01', '2026-11-30', '2026-11-15') = 'desactivada', 'activa = false');
select pg_temp.verificar('Sin fecha usa hoy en Bogotá',
  privado.hoy_bogota() = (now() at time zone 'America/Bogota')::date, privado.hoy_bogota()::text);

---------------------------------------------------------------------------
-- RF-F4-01, RF-F4-03: guardar_promocion
---------------------------------------------------------------------------
create temp table ids (clave text primary key, id uuid);

insert into ids select 'creada', public.guardar_promocion(
  '12000000-0000-0000-0000-0000000000e1', null, 'Martes de motor', null, null, 20, '2026-11-01', '2026-11-30', null,
  array['12000000-0000-0000-0000-0000000000d1', '12000000-0000-0000-0000-0000000000d1']::uuid[]);
select pg_temp.verificar('Crea la promoción activa con sus servicios, sin repetirlos',
  (select activa and (select count(*) from promocion_servicios where promocion_id = p.id) = 1
   from promociones p where p.id = (select id from ids where clave = 'creada')), 'servicio repetido una sola vez');

select public.guardar_promocion(
  '12000000-0000-0000-0000-0000000000e1', (select id from ids where clave = 'creada'), 'Martes de motor y básico', 'Solo martes', null,
  20, '2026-11-01', '2026-11-30', null, array['12000000-0000-0000-0000-0000000000d2']::uuid[]);
select pg_temp.verificar('Editar reemplaza los servicios y conserva activa',
  (select activa and nombre = 'Martes de motor y básico'
     and array(select servicio_id from promocion_servicios where promocion_id = p.id) = array['12000000-0000-0000-0000-0000000000d2']::uuid[]
   from promociones p where p.id = (select id from ids where clave = 'creada')), 'solo Lavado básico');

select pg_temp.verificar('Editar una promoción de otra sede no la cambia',
  public.guardar_promocion('12000000-0000-0000-0000-0000000000e2', (select id from ids where clave = 'creada'), 'Robada', null, null,
    10, '2026-11-01', '2026-11-30', false, array['12000000-0000-0000-0000-0000000000d3']::uuid[]) is null
  and (select nombre from promociones where id = (select id from ids where clave = 'creada')) = 'Martes de motor y básico', 'devuelve null');

create or replace function pg_temp.error_al_guardar(p_establecimiento uuid, p_servicios uuid[], p_inicio date, p_fin date) returns text language plpgsql as $$
begin
  perform public.guardar_promocion(p_establecimiento, null, 'Inválida', null, null, 10, p_inicio, p_fin, null, p_servicios);
  return 'sin error';
exception when check_violation then
  return sqlerrm;
end $$;

select pg_temp.verificar('Sin servicios se rechaza',
  pg_temp.error_al_guardar('12000000-0000-0000-0000-0000000000e1', '{}', '2026-11-01', '2026-11-30') = 'Elige al menos un servicio del catálogo', 'arreglo vacío');
select pg_temp.verificar('Un servicio de otra sede se rechaza y no deja la promoción a medias',
  pg_temp.error_al_guardar('12000000-0000-0000-0000-0000000000e1', array['12000000-0000-0000-0000-0000000000d3']::uuid[], '2026-11-01', '2026-11-30')
    = 'Uno o más servicios no existen en el catálogo del establecimiento'
  and not exists (select 1 from promociones where nombre = 'Inválida'), 'servicio de B en promoción de A');
select pg_temp.verificar('Fin antes del inicio se rechaza',
  pg_temp.error_al_guardar('12000000-0000-0000-0000-0000000000e1', array['12000000-0000-0000-0000-0000000000d1']::uuid[], '2026-11-30', '2026-11-01')
    = 'La fecha de fin no puede ser anterior a la de inicio', 'fechas invertidas');

---------------------------------------------------------------------------
-- RF-F4-04, RF-F4-05: mejor_promocion (ESC-F4-03 y ESC-F4-04)
---------------------------------------------------------------------------
delete from promociones where establecimiento_id = '12000000-0000-0000-0000-0000000000e1';
insert into promociones (id, establecimiento_id, nombre, descuento_pct, fecha_inicio, fecha_fin, activa, created_at) values
  ('12000000-0000-0000-0000-0000000000a1', '12000000-0000-0000-0000-0000000000e1', 'Diez',            10, '2026-11-01', '2026-11-30', true,  '2026-10-01'),
  ('12000000-0000-0000-0000-0000000000a2', '12000000-0000-0000-0000-0000000000e1', 'Veinte',          20, '2026-11-01', '2026-11-30', true,  '2026-10-02'),
  ('12000000-0000-0000-0000-0000000000a3', '12000000-0000-0000-0000-0000000000e1', 'Treinta apagada', 30, '2026-11-01', '2026-11-30', false, '2026-10-03'),
  ('12000000-0000-0000-0000-0000000000a4', '12000000-0000-0000-0000-0000000000e1', 'Cuarenta vencida', 40, '2026-10-01', '2026-11-14', true, '2026-10-04'),
  ('12000000-0000-0000-0000-0000000000a5', '12000000-0000-0000-0000-0000000000e1', 'Cincuenta futura', 50, '2026-11-16', '2026-11-30', true, '2026-10-05'),
  -- Empate en Lavado básico: misma tasa, creadas en distinto momento; y dos creadas a la vez.
  ('12000000-0000-0000-0000-0000000000b2', '12000000-0000-0000-0000-0000000000e1', 'Quince nueva',    15, '2026-11-01', '2026-11-30', true,  '2026-10-20'),
  ('12000000-0000-0000-0000-0000000000b1', '12000000-0000-0000-0000-0000000000e1', 'Quince antigua',  15, '2026-11-01', '2026-11-30', true,  '2026-10-10'),
  ('12000000-0000-0000-0000-0000000000c2', '12000000-0000-0000-0000-0000000000e1', 'Cinco gemela 2',   5, '2026-11-01', '2026-11-30', true,  '2026-10-30'),
  ('12000000-0000-0000-0000-0000000000c1', '12000000-0000-0000-0000-0000000000e1', 'Cinco gemela 1',   5, '2026-11-01', '2026-11-30', true,  '2026-10-30');
insert into promocion_servicios (promocion_id, servicio_id) values
  ('12000000-0000-0000-0000-0000000000a1', '12000000-0000-0000-0000-0000000000d1'),
  ('12000000-0000-0000-0000-0000000000a2', '12000000-0000-0000-0000-0000000000d1'),
  ('12000000-0000-0000-0000-0000000000a3', '12000000-0000-0000-0000-0000000000d1'),
  ('12000000-0000-0000-0000-0000000000a4', '12000000-0000-0000-0000-0000000000d1'),
  ('12000000-0000-0000-0000-0000000000a5', '12000000-0000-0000-0000-0000000000d1'),
  ('12000000-0000-0000-0000-0000000000b1', '12000000-0000-0000-0000-0000000000d2'),
  ('12000000-0000-0000-0000-0000000000b2', '12000000-0000-0000-0000-0000000000d2');

create temp table mejor as select * from public.mejor_promocion(
  '12000000-0000-0000-0000-0000000000e1', '12000000-0000-0000-0000-0000000000d1', '2026-11-15', 30000);
select pg_temp.verificar('ESC-F4-04: entre 10 % y 20 % vigentes elige 20 %; ignora desactivada, vencida y programada',
  (select promocion_id = '12000000-0000-0000-0000-0000000000a2' from mejor), (select nombre from mejor));
select pg_temp.verificar('ESC-F4-03: 20 % de 30 000 = 6 000',
  (select descuento = 6000 from mejor), (select descuento::text from mejor));
select pg_temp.verificar('Redondea el descuento a pesos enteros',
  (select descuento = 3333 from public.mejor_promocion('12000000-0000-0000-0000-0000000000e1', '12000000-0000-0000-0000-0000000000d1', '2026-11-15', 16665)),
  '20 % de 16 665 = 3 333');
select pg_temp.verificar('Desempate 1: con el mismo porcentaje gana la creada primero',
  (select promocion_id = '12000000-0000-0000-0000-0000000000b1'
   from public.mejor_promocion('12000000-0000-0000-0000-0000000000e1', '12000000-0000-0000-0000-0000000000d2', '2026-11-15', 25000)),
  'Quince antigua sobre Quince nueva');

-- Desempate 2: mismo porcentaje y misma fecha de creación → id menor. Se mueven las gemelas a Lavado básico solas.
delete from promocion_servicios where servicio_id = '12000000-0000-0000-0000-0000000000d2';
insert into promocion_servicios (promocion_id, servicio_id) values
  ('12000000-0000-0000-0000-0000000000c2', '12000000-0000-0000-0000-0000000000d2'),
  ('12000000-0000-0000-0000-0000000000c1', '12000000-0000-0000-0000-0000000000d2');
select pg_temp.verificar('Desempate 2: mismo porcentaje y misma creación, gana el id menor (siempre la misma)',
  (select promocion_id = '12000000-0000-0000-0000-0000000000c1'
   from public.mejor_promocion('12000000-0000-0000-0000-0000000000e1', '12000000-0000-0000-0000-0000000000d2', '2026-11-15', 25000)),
  'Cinco gemela 1');

select pg_temp.verificar('Sin promoción vigente no devuelve filas',
  not exists (select 1 from public.mejor_promocion('12000000-0000-0000-0000-0000000000e1', '12000000-0000-0000-0000-0000000000d1', '2026-12-15', 30000)),
  'después del 30 de noviembre');
select pg_temp.verificar('Otra sede no recibe promociones de A para su servicio',
  not exists (select 1 from public.mejor_promocion('12000000-0000-0000-0000-0000000000e2', '12000000-0000-0000-0000-0000000000d1', '2026-11-15', 30000)),
  'establecimiento B');
select pg_temp.verificar('Sin precio informa la promoción y deja el descuento en null',
  (select descuento is null and descuento_pct = 20
   from public.mejor_promocion('12000000-0000-0000-0000-0000000000e1', '12000000-0000-0000-0000-0000000000d1', '2026-11-15')), 'p_precio null');

---------------------------------------------------------------------------
-- Vistas y permisos
---------------------------------------------------------------------------
select pg_temp.verificar('La vista trae el estado calculado y los servicios de cada promoción',
  (select estado = privado.estado_promocion(activa, fecha_inicio, fecha_fin)
     and servicios = '[{"id": "12000000-0000-0000-0000-0000000000d1", "nombre": "Lavado de motor"}]'::jsonb
   from promociones_con_estado where id = '12000000-0000-0000-0000-0000000000a2'), 'promociones_con_estado');
select pg_temp.verificar('promociones_vigentes solo contiene vigentes',
  not exists (select 1 from promociones_vigentes where estado <> 'vigente'), 'filtro por estado');
select pg_temp.verificar('Las vistas respetan el RLS de quien consulta (security_invoker)',
  (select bool_and(coalesce(reloptions, '{}') @> array['security_invoker=true']) from pg_class
   where relname in ('promociones_con_estado', 'promociones_vigentes')), 'reloptions');
select pg_temp.verificar('El público no consulta las vistas',
  not has_table_privilege('anon', 'promociones_con_estado', 'select') and not has_table_privilege('anon', 'promociones_vigentes', 'select'), 'anon');
select pg_temp.verificar('Solo service_role ejecuta guardar_promocion y mejor_promocion',
  not has_function_privilege('authenticated', 'public.guardar_promocion(uuid, uuid, text, text, text, numeric, date, date, boolean, uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.mejor_promocion(uuid, uuid, date, numeric)', 'execute')
  and not has_function_privilege('authenticated', 'public.mejor_promocion(uuid, uuid, date, numeric)', 'execute')
  and has_function_privilege('service_role', 'public.mejor_promocion(uuid, uuid, date, numeric)', 'execute'), 'privilegios');

-- Un administrador de A consulta la vista con su sesión: solo ve las promociones de A.
insert into auth.users (id, email) values ('12000000-0000-0000-0000-0000000000f1', 'admin-hu12@zaru.test');
insert into perfiles (id, establecimiento_id, nombre, rol) values ('12000000-0000-0000-0000-0000000000f1', '12000000-0000-0000-0000-0000000000e1', 'Admin HU-12', 'admin');
insert into promociones (id, establecimiento_id, nombre, descuento_pct, fecha_inicio, fecha_fin) values
  ('12000000-0000-0000-0000-0000000000b9', '12000000-0000-0000-0000-0000000000e2', 'Promo de B', 10, '2026-11-01', '2026-11-30');
set role authenticated;
select set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-0000000000f1', false);
create temp table vistas_admin_a as select establecimiento_id from promociones_con_estado;
reset role;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.verificar('Multi-tenant: con la sesión del admin de A la vista solo muestra promociones de A',
  (select count(*) > 0 and bool_and(establecimiento_id = '12000000-0000-0000-0000-0000000000e1') from vistas_admin_a),
  (select count(*) || ' promociones visibles' from vistas_admin_a));

delete from perfiles where id = '12000000-0000-0000-0000-0000000000f1';
delete from auth.users where id = '12000000-0000-0000-0000-0000000000f1';
delete from establecimientos where id in ('12000000-0000-0000-0000-0000000000e1', '12000000-0000-0000-0000-0000000000e2');

\o
\set QUIET off
\pset footer off
select n as "#", case when ok then 'PASA' else 'FALLA' end as resultado, prueba, detalle from resultados order by n;
select count(*) filter (where ok) || ' de ' || count(*) || ' pruebas aprobadas' as resumen from resultados;
