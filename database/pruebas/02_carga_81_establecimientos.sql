-- HU-42 CA3: genera datos sintéticos equivalentes a un año de operación de 81 establecimientos.
-- Supuestos (docs/arquitectura/spike-hu58.md): 40 órdenes diarias por establecimiento,
-- 1 a 2 servicios por orden, 4 cambios de estado por orden y 1 notificación por orden.
-- Solo para bases locales o de pruebas. Uso: psql -d zaru_prueba -f database/pruebas/02_carga_81_establecimientos.sql
\set QUIET on
\timing off
set session_replication_role = replica; -- los datos generados son consistentes; se omiten triggers en la carga masiva

insert into establecimientos (id, nombre)
select ('e0000000-0000-0000-0000-' || lpad(e::text, 12, '0'))::uuid, 'Lavadero ' || e
from generate_series(1, 81) e;

insert into auth.users (id)
select ('f0000000-0000-0000-' || lpad(e::text, 4, '0') || '-' || lpad(u::text, 12, '0'))::uuid
from generate_series(1, 81) e, generate_series(1, 3) u;

insert into perfiles (id, establecimiento_id, nombre, rol)
select ('f0000000-0000-0000-' || lpad(e::text, 4, '0') || '-' || lpad(u::text, 12, '0'))::uuid,
       ('e0000000-0000-0000-0000-' || lpad(e::text, 12, '0'))::uuid,
       'Usuario ' || u, case when u = 1 then 'admin' else 'operario' end::rol_usuario
from generate_series(1, 81) e, generate_series(1, 3) u;

-- 1.500 clientes por establecimiento (121.500 en total).
insert into clientes (id, establecimiento_id, nombre, telefono, autorizacion_datos)
select ('c0000000-0000-' || lpad(e::text, 4, '0') || '-0000-' || lpad(c::text, 12, '0'))::uuid,
       ('e0000000-0000-0000-0000-' || lpad(e::text, 12, '0'))::uuid,
       (array['Ana','Luis','Carlos','María','Jorge','Paula','Andrés','Sofía','Camilo','Valentina'])[1 + c % 10] || ' ' ||
       (array['Gómez','Rodríguez','Pérez','López','Martínez','García','Hernández','Torres','Ramírez','Castro'])[1 + (c / 10) % 10] || ' ' || c,
       '3' || lpad((e * 10000 + c)::text, 9, '0'), true
from generate_series(1, 81) e, generate_series(1, 1500) c;

-- 1 vehículo por cliente y uno adicional por cada tercer cliente (unos 2.000 por establecimiento).
insert into vehiculos (id, establecimiento_id, cliente_id, placa, tipo)
select ('d0000000-' || lpad(v::text, 4, '0') || '-' || lpad(e::text, 4, '0') || '-0000-' || lpad(c::text, 12, '0'))::uuid,
       ('e0000000-0000-0000-0000-' || lpad(e::text, 12, '0'))::uuid,
       ('c0000000-0000-' || lpad(e::text, 4, '0') || '-0000-' || lpad(c::text, 12, '0'))::uuid,
       chr(65 + (c + v) % 26) || chr(65 + (c / 26) % 26) || chr(65 + (c / 676 + v) % 26) || lpad(((c * 7 + v * 3) % 1000)::text, 3, '0'),
       case when c % 4 = 0 then 'moto' else 'carro' end
from generate_series(1, 81) e, generate_series(1, 1500) c, generate_series(1, 2) v
where v = 1 or c % 3 = 0
on conflict do nothing;

insert into servicios (id, establecimiento_id, nombre, precio, duracion_min)
select ('50000000-0000-' || lpad(e::text, 4, '0') || '-0000-' || lpad(s::text, 12, '0'))::uuid,
       ('e0000000-0000-0000-0000-' || lpad(e::text, 12, '0'))::uuid,
       (array['Lavado básico','Lavado premium','Polichado','Aspirado','Lavado de motor','Encerado','Desinfección','Lavado de tapicería'])[s],
       15000 + s * 5000, 20 + s * 10
from generate_series(1, 81) e, generate_series(1, 8) s;

-- 40 órdenes diarias por establecimiento durante 365 días (1.182.600 órdenes).
create temp table vehiculos_numerados as
select id, establecimiento_id, row_number() over (partition by establecimiento_id order by id) as n,
       count(*) over (partition by establecimiento_id) as total
from vehiculos where establecimiento_id::text like 'e0000000%';
create index on vehiculos_numerados (establecimiento_id, n);

insert into ordenes (id, establecimiento_id, vehiculo_id, estado, subtotal, total, creada_por, estado_desde, created_at, entregada_at)
select gen_random_uuid(), x.est, vn.id,
       case when x.d = 0 and x.k > 30 then (array['recibido','en_lavado','listo'])[1 + x.k % 3]::estado_orden else 'entregado' end,
       40000, 40000,
       ('f0000000-0000-0000-' || lpad(x.e::text, 4, '0') || '-' || lpad((1 + x.k % 3)::text, 12, '0'))::uuid,
       x.creada + interval '45 minutes', x.creada,
       case when x.d = 0 and x.k > 30 then null else x.creada + interval '90 minutes' end
from (
  select e, ('e0000000-0000-0000-0000-' || lpad(e::text, 12, '0'))::uuid as est, d, k,
         date_trunc('day', now()) - make_interval(days => d) + make_interval(mins => 420 + k * 15) as creada
  from generate_series(1, 81) e, generate_series(0, 364) d, generate_series(1, 40) k
) x
join vehiculos_numerados vn on vn.establecimiento_id = x.est
 and vn.n = 1 + ((x.d * 40 + x.k) * 7919) % vn.total;

insert into orden_servicios (orden_id, servicio_id, precio, duracion_min)
select o.id, ('50000000-0000-' || substr(o.establecimiento_id::text, 20, 4) || '-0000-' || lpad(s::text, 12, '0'))::uuid, 20000, 30
from ordenes o
cross join lateral (select 1 + (abs(hashtext(o.id::text)) % 8) as s
                    union select 1 + (abs(hashtext(o.id::text || 'x')) % 8)) sel
where o.establecimiento_id::text like 'e0000000%';

insert into historial_estados (orden_id, estado, usuario_id, created_at)
select o.id, st.estado, o.creada_por, o.created_at + st.minutos * interval '1 minute'
from ordenes o
cross join (values ('recibido'::estado_orden, 0), ('en_lavado', 15), ('listo', 60), ('entregado', 90)) st(estado, minutos)
where o.establecimiento_id::text like 'e0000000%'
  and (o.estado = 'entregado' or st.estado <= o.estado);

insert into notificaciones (establecimiento_id, cliente_id, orden_id, tipo, evento, canal, destino, estado, programada_para, created_at)
select o.establecimiento_id, v.cliente_id, o.id, 'operativa', 'orden.listo', 'sms', '3000000000',
       case when o.estado = 'entregado' then 'entregada' else 'pendiente' end,
       o.created_at + interval '60 minutes', o.created_at + interval '60 minutes'
from ordenes o join vehiculos v on v.id = o.vehiculo_id
where o.establecimiento_id::text like 'e0000000%';

set session_replication_role = origin;
analyze;

\set QUIET off
\pset footer off
select tabla, to_char(filas, 'FM9G999G999') as filas from (
  select 'establecimientos' tabla, count(*) filas from establecimientos union all
  select 'clientes', count(*) from clientes union all
  select 'vehiculos', count(*) from vehiculos union all
  select 'ordenes', count(*) from ordenes union all
  select 'orden_servicios', count(*) from orden_servicios union all
  select 'historial_estados', count(*) from historial_estados union all
  select 'notificaciones', count(*) from notificaciones) t;
select pg_size_pretty(pg_database_size(current_database())) as tamano_base;
