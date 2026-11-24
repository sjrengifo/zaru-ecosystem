-- ===========================================================================
-- HU-39 (ZARU-28) - catalogo de planes
-- Ejecutar las partes en orden (01 -> 08). Contenido extraido de:
-- supabase/migrations/20261119100000_hu39_consumo_por_plan.sql
-- ===========================================================================

-- HU-39 (ZARU-28): control de consumo de notificaciones por plan.
--
-- DA-12 propone los cupos iniciales (bÃ¡sico 200 SMS / 1.000 correos, intermedio 600 / 3.000,
-- empresarial 2.000 / 10.000). No se hardcodean en el backend: quedan en `public.planes` para que
-- el administrador de la plataforma pueda ajustarlos sin desplegar cÃ³digo.
-- ATENCIÃ“N: estos valores son una propuesta sujeta a confirmaciÃ³n formal del Product Owner.
-- NO promover a producciÃ³n sin esa confirmaciÃ³n (ver specs/backend/06-decisiones-abiertas.md).
--
-- CA1: `consumo_mensual` lleva el acumulado por establecimiento, mes y canal. La RPC
--      `hu39_confirmar_consumo` bloquea la fila y devuelve una sola vez el cruce del 80 % en SMS
--      (`alerta_80_enviada`), aunque lleguen varios SMS en paralelo.
-- CA2: `hu39_reservar_consumo` aparta el cupo ANTES de llamar al proveedor. Con el cupo de SMS
--      agotado devuelve `sin_cupo` y la cola busca un canal alterno; nunca cuenta un intento
--      fallido como envÃ­o. La reserva se libera si el proveedor falla.
-- CA3: las mismas filas alimentan el reporte global por establecimiento, plan, mes y canal.
--
-- El periodo se calcula en America/Bogota (primer dÃ­a del mes). El historial nunca se borra:
-- cada mes es una fila distinta y las FK a `establecimientos` son ON DELETE RESTRICT, de modo
-- que eliminar un establecimiento no puede eliminar su historial de consumo.
-- La migraciÃ³n es idempotente:
--   * CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
--   * Las polÃ­ticas RLS se crean solo si no existen; si ya existen se valida su definiciÃ³n y
--     se aborta con error antes de reemplazarlas silenciosamente. No se tocan otras polÃ­ticas
--     del proyecto y en ningÃºn caso se deshabilita RLS.
--   * Las FK se normalizan a RESTRICT solo en las tres tablas de HU-39.
--   * CREATE OR REPLACE FUNCTION va precedido de una guardia que impide sobrescribir una
--     funciÃ³n homÃ³nima que no estÃ© identificada como HU-39.
--   * INSERT ... ON CONFLICT DO NOTHING, GRANT/REVOKE y COMMENT son idempotentes.
-- No hay DROP TABLE, TRUNCATE ni DELETE: no se eliminan tablas ni datos.

-- ---------------------------------------------------------------------------
-- CatÃ¡logo de planes (Ãºnica tabla global: es el equivalente a la columna
-- `establecimientos.plan`, no sustituye ni elimina esa columna).
-- ---------------------------------------------------------------------------
create table if not exists public.planes (
  nombre            text primary key,
  cupo_sms_mes      integer not null check (cupo_sms_mes >= 0),
  cupo_correo_mes   integer check (cupo_correo_mes >= 0),
  created_at        timestamptz not null default now(),
  actualizado_at    timestamptz not null default now(),
  constraint planes_nombre_check check (nombre in ('basico', 'intermedio', 'empresarial'))
);

-- DA-12 (PENDIENTE DE CONFIRMACIÃ“N DEL PO): semilla configurable, nunca hardcodeada en backend.
insert into public.planes (nombre, cupo_sms_mes, cupo_correo_mes) values
  ('basico', 200, 1000),
  ('intermedio', 600, 3000),
  ('empresarial', 2000, 10000)
on conflict (nombre) do nothing;

alter table public.planes enable row level security;

-- PolÃ­tica creada solo si no existe. Si ya existe, se verifica cmd/permissive/qual;
-- cualquier diferencia aborta la migraciÃ³n en lugar de borrar la polÃ­tica.
do $$
declare
  v_qual       text;
  v_cmd        text;
  v_permissive text;
  v_norm       text;
begin
  select qual, cmd, permissive
    into v_qual, v_cmd, v_permissive
  from pg_policies
  where schemaname = 'public'
    and tablename = 'planes'
    and policyname = 'ver planes';

  if not found then
    create policy "ver planes" on public.planes for select using (true);
  else
    v_norm := regexp_replace(coalesce(v_qual, ''), '\s+', '', 'g');
    if v_cmd <> 'SELECT' or v_permissive <> 'PERMISSIVE' or v_norm <> 'true' then
      raise exception
        'HU-39: la polÃ­tica "ver planes" ya existe con otra definiciÃ³n (cmd=%, permissive=%, qual=%); no se reemplaza',
        v_cmd, v_permissive, v_qual;
    end if;
  end if;
end $$;

-- Alcance HU-39: anon nunca obtiene privilegios de tabla; solo authenticated y service_role.
revoke all on public.planes from anon;
grant select on public.planes to authenticated, service_role;
grant insert, update on public.planes to service_role;
