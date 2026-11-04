-- =====================================================================
--  ZARU ECOSYSTEM — Verificación de aislamiento multi-tenant (HU-01 CA3)
-- =====================================================================
--  Qué hace:
--    Simula el JWT de un administrador real y comprueba que, al consultar
--    directamente Supabase con el rol "authenticated", RLS solo devuelve
--    filas de su establecimiento. También intenta leer y modificar datos
--    de otro establecimiento usando su id.
--
--  Seguridad:
--    Todo ocurre dentro de una transacción que termina en ROLLBACK.
--    No se insertan, actualizan ni eliminan datos de forma permanente.
--
--  Cómo usarlo:
--    1) Supabase → SQL Editor.
--    2) Reemplaza 'PEGAR-UUID-DE-ADMIN-A' por el id (auth.users) de un
--       usuario que tenga perfil activo en la tabla perfiles.
--    3) Ejecuta el bloque completo.
--    4) Resultado esperado: mi_tenant = establecimiento del admin y
--       TODAS las demás columnas numéricas en 0.
--
--  Requisito: debe existir al menos un segundo establecimiento con datos
--  (el seed crea uno solo; crea otro o usa dos sedes reales).
-- =====================================================================

begin;

-- 1) Administrador que queremos simular.
select set_config('test.admin_a', 'PEGAR-UUID-DE-ADMIN-A', true);

-- 2) Datos del "otro" establecimiento, leídos antes de cambiar de rol.
select set_config(
  'test.tenant_b',
  coalesce(
    (
      select e.id::text
      from establecimientos e
      where e.id <> (
        select p.establecimiento_id
        from perfiles p
        where p.id = current_setting('test.admin_a')::uuid
      )
      limit 1
    ),
    '00000000-0000-0000-0000-000000000000'
  ),
  true
);

select set_config(
  'test.cliente_b',
  coalesce(
    (
      select c.id::text
      from clientes c
      where c.establecimiento_id = current_setting('test.tenant_b')::uuid
      limit 1
    ),
    '00000000-0000-0000-0000-000000000000'
  ),
  true
);

-- 3) Simula el JWT de Supabase Auth y el rol del cliente web.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('test.admin_a'))::text,
  true
);
set local role authenticated;

-- 4) Comprobaciones -----------------------------------------------------

-- 4.1 El establecimiento resuelto debe ser el del administrador simulado.
select privado.mi_establecimiento() as mi_tenant;

-- 4.2 Ninguna fila visible puede pertenecer a otro establecimiento.
select 'clientes' as tabla, count(*) as filas_de_otro_tenant
from clientes
where establecimiento_id <> privado.mi_establecimiento()
union all
select 'vehiculos', count(*)
from vehiculos
where establecimiento_id <> privado.mi_establecimiento()
union all
select 'servicios', count(*)
from servicios
where establecimiento_id <> privado.mi_establecimiento()
union all
select 'promociones', count(*)
from promociones
where establecimiento_id <> privado.mi_establecimiento()
union all
select 'ordenes', count(*)
from ordenes
where establecimiento_id <> privado.mi_establecimiento()
union all
select 'perfiles', count(*)
from perfiles
where establecimiento_id <> privado.mi_establecimiento()
union all
select 'establecimientos', count(*)
from establecimientos
where id <> privado.mi_establecimiento();

-- 4.3 Un id del otro establecimiento no debe ser accesible por id.
select count(*) as clientes_de_otro_tenant_por_id
from clientes
where id = current_setting('test.cliente_b')::uuid;

-- 4.4 Modificar por id un registro del otro establecimiento afecta 0 filas.
with afectadas as (
  update clientes
  set nombre = nombre
  where id = current_setting('test.cliente_b')::uuid
  returning 1
)
select count(*) as filas_modificadas_de_otro_tenant
from afectadas;

rollback;
