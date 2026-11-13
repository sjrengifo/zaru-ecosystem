-- HU-33 (ZARU-22): reintento y canal alterno ante fallas de envío.
--
-- La cola `notificaciones` (HU-42) y los reintentos con espera exponencial (HU-34) ya existen.
-- Esta migración agrega lo que falta para:
--   CA3: marcar el fallo definitivo de un aviso "listo" (falló en todos los canales) y que el
--        administrador lo vea como alerta en el dashboard hasta que contacte al cliente.
--   CA4: encontrar rápido la cadena de un aviso (original y alternos) cuando el proveedor confirma
--        una entrega tardía, para cancelar lo pendiente y no enviar duplicados.
--
-- Requiere la migración de HU-34 (notificacion_intentos). Es idempotente.

alter table notificaciones
  add column if not exists fallo_definitivo_at timestamptz,
  add column if not exists alerta_atendida_at  timestamptz,
  add column if not exists alerta_atendida_por uuid references perfiles(id) on delete set null;

comment on column notificaciones.fallo_definitivo_at is
  'HU-33 CA3: el aviso falló en todos los canales disponibles; aparece como alerta en el dashboard.';
comment on column notificaciones.alerta_atendida_at is
  'HU-33 CA3: el administrador contactó al cliente (o el proveedor confirmó la entrega después).';

-- Una alerta atendida tiene que haber sido un fallo definitivo.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'notificaciones_alerta_coherente') then
    alter table notificaciones add constraint notificaciones_alerta_coherente
      check (alerta_atendida_at is null or fallo_definitivo_at is not null);
  end if;
end $$;

-- Alertas abiertas del dashboard: pocas filas, se consultan cada 30 segundos.
create index if not exists notificaciones_alertas_abiertas_idx
  on notificaciones (establecimiento_id, fallo_definitivo_at desc)
  where fallo_definitivo_at is not null and alerta_atendida_at is null;

-- Cadena de un aviso: el original y sus alternos (CA2 y CA4).
create index if not exists notificaciones_origen_idx
  on notificaciones (notificacion_origen_id)
  where notificacion_origen_id is not null;
