-- HU-42 CA3: mide las consultas más frecuentes sobre los datos de 02_carga_81_establecimientos.sql.
-- Ejecuta cada consulta 7 veces y reporta la mediana del tiempo de ejecución en la base
-- y el tipo de acceso principal. Solo se reporta como recorrido completo el de tablas grandes;
-- las tablas pequeñas por establecimiento (servicios, perfiles, promociones) se leen completas a propósito.
-- Uso: psql -d zaru_prueba -f database/pruebas/03_rendimiento.sql
\set QUIET on
\o /dev/null
select set_config('zaru.est', 'e0000000-0000-0000-0000-000000000041', false);
select set_config('zaru.vehiculo', (select vehiculo_id::text from ordenes
  where establecimiento_id = current_setting('zaru.est')::uuid group by vehiculo_id order by count(*) desc limit 1), false);
select set_config('zaru.placa', (select placa from vehiculos where id = current_setting('zaru.vehiculo')::uuid), false);
select set_config('zaru.orden', (select id::text from ordenes
  where establecimiento_id = current_setting('zaru.est')::uuid order by created_at desc limit 1), false);

create temp table consultas (n int, hu text, consulta text, sql text);
insert into consultas values
 (1, 'HU-09', 'Dashboard: órdenes activas del establecimiento',
  $q$select id, vehiculo_id, estado, estado_desde from ordenes
     where establecimiento_id = current_setting('zaru.est')::uuid and estado <> 'entregado' order by estado_desde$q$),
 (2, 'HU-08', 'Buscar vehículo por placa exacta',
  $q$select * from vehiculos where establecimiento_id = current_setting('zaru.est')::uuid and placa = current_setting('zaru.placa')$q$),
 (3, 'HU-05', 'Buscar vehículo por placa parcial',
  $q$select id, placa from vehiculos where establecimiento_id = current_setting('zaru.est')::uuid
     and placa ilike '%' || substr(current_setting('zaru.placa'), 2, 4) || '%' limit 20$q$),
 (4, 'HU-04', 'Buscar clientes por nombre parcial',
  $q$select id, nombre, telefono from clientes where establecimiento_id = current_setting('zaru.est')::uuid
     and nombre ilike '%rodríguez 4%' order by nombre limit 20$q$),
 (5, 'HU-06', 'Historial de servicios de un vehículo',
  $q$select o.id, o.created_at, o.total, s.nombre from ordenes o
     join orden_servicios os on os.orden_id = o.id join servicios s on s.id = os.servicio_id
     where o.vehiculo_id = current_setting('zaru.vehiculo')::uuid order by o.created_at desc limit 20$q$),
 (6, 'HU-10', 'Línea de tiempo de estados de una orden',
  $q$select estado, created_at from historial_estados where orden_id = current_setting('zaru.orden')::uuid order by created_at$q$),
 (7, 'HU-09', 'Órdenes de los últimos 7 días (página de 50)',
  $q$select id, estado, total, created_at from ordenes where establecimiento_id = current_setting('zaru.est')::uuid
     and created_at >= now() - interval '7 days' order by created_at desc limit 50$q$),
 (8, 'HU-16', 'Reporte: servicios más demandados del último mes',
  $q$select s.nombre, count(*) from ordenes o join orden_servicios os on os.orden_id = o.id join servicios s on s.id = os.servicio_id
     where o.establecimiento_id = current_setting('zaru.est')::uuid and o.created_at >= now() - interval '30 days'
     group by s.nombre order by 2 desc$q$),
 (9, 'HU-46', 'Cola de notificaciones pendientes (worker)',
  $q$select id from notificaciones where estado in ('pendiente', 'programada') and programada_para <= now()
     order by proximo_intento_at nulls first, programada_para limit 50$q$),
 (10, 'HU-34', 'Bitácora de notificaciones del establecimiento',
  $q$select id, evento, canal, estado, created_at from notificaciones
     where establecimiento_id = current_setting('zaru.est')::uuid order by created_at desc limit 50$q$);

create temp table resultados (n int, ms numeric, acceso text);
do $$
declare c record; plan json; tiempos numeric[]; acceso text; tablas_completas text; i int;
begin
  for c in select * from consultas order by n loop
    if c.sql like '%notificaciones%' and to_regclass('public.notificaciones') is null then
      insert into resultados values (c.n, null, 'tabla no existe');
      continue;
    end if;
    tiempos := '{}';
    for i in 1..7 loop
      execute 'explain (analyze, format json) ' || c.sql into plan;
      tiempos := tiempos || (plan->0->>'Execution Time')::numeric;
    end loop;
    select string_agg(distinct r #>> '{}', ', ') into tablas_completas
      from jsonb_path_query(plan::jsonb, 'strict $.**? (@."Node Type" == "Seq Scan")."Relation Name"') r
     where r #>> '{}' not in ('servicios', 'establecimientos', 'perfiles', 'promociones');
    acceso := case when tablas_completas is not null then 'Recorrido completo de ' || tablas_completas
                   when plan::text ~ 'Bitmap Index Scan' then 'Índice (bitmap)'
                   when plan::text ~ 'Index Only Scan' then 'Índice (solo índice)'
                   else 'Índice' end;
    insert into resultados values (c.n, (select percentile_cont(0.5) within group (order by t) from unnest(tiempos) t), acceso);
  end loop;
end $$;
\o
\set QUIET off
\pset footer off
select c.n as "#", c.hu, c.consulta, coalesce(to_char(r.ms, 'FM9990.000') || ' ms', '—') as "mediana", r.acceso as "acceso principal"
from consultas c join resultados r using (n) order by c.n;
