-- HU-41 (ZARU-47): elimina las llaves foráneas simples que quedaron duplicadas por las
-- llaves compuestas (id, establecimiento_id) de HU-42.
--
-- Con dos relaciones entre las mismas tablas, la API de Supabase (PostgREST) no puede
-- decidir cuál usar al anidar recursos, por ejemplo GET clientes?select=*,vehiculos(*),
-- y responde PGRST201. Las llaves compuestas ya garantizan lo mismo y además exigen que
-- ambos registros sean del mismo establecimiento.

alter table vehiculos drop constraint if exists vehiculos_cliente_id_fkey;   -- la cubre vehiculos_cliente_mismo_establecimiento_fkey (on delete cascade)
alter table ordenes   drop constraint if exists ordenes_vehiculo_id_fkey;    -- la cubre ordenes_vehiculo_mismo_establecimiento_fkey
alter table ordenes   drop constraint if exists ordenes_creada_por_fkey;     -- la cubre ordenes_creador_mismo_establecimiento_fkey
