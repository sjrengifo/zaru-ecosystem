-- HU-10 (ZARU-10): valor opcional de secado en el flujo operativo.
-- Va en una migración separada porque el nuevo valor del enum se usa en la
-- migración siguiente y PostgreSQL no permite ambos cambios en la misma
-- transacción.
alter type public.estado_orden add value if not exists 'secado' before 'listo';
