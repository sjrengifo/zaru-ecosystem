-- Índices sobre todas las llaves foráneas (recomendación del asesor de rendimiento de Supabase).
create index on historial_estados (orden_id);
create index on historial_estados (usuario_id);
create index on orden_servicios (servicio_id);
create index on ordenes (creada_por);
create index on ordenes (vehiculo_id);
create index on perfiles (establecimiento_id);
create index on promocion_servicios (servicio_id);
create index on promociones (establecimiento_id);
create index on servicios (establecimiento_id);
create index on vehiculos (cliente_id);
