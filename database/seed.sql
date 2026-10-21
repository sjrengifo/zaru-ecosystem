-- =====================================================================
--  Datos de prueba. Correr DESPUÉS de schema.sql.
-- =====================================================================

-- 1) Un car wash de ejemplo
insert into establecimientos (id, nombre)
values ('00000000-0000-0000-0000-000000000001', 'Car Wash Demo Cali');

-- 2) Catálogo de servicios
insert into servicios (establecimiento_id, nombre, precio, duracion_min) values
  ('00000000-0000-0000-0000-000000000001', 'Lavado básico',        25000, 30),
  ('00000000-0000-0000-0000-000000000001', 'Lavado premium',       45000, 60),
  ('00000000-0000-0000-0000-000000000001', 'Polichado',            80000, 120),
  ('00000000-0000-0000-0000-000000000001', 'Lavado de motor',      30000, 40);

-- 3) Cliente y vehículo de ejemplo
insert into clientes (id, establecimiento_id, nombre, telefono, correo, autorizacion_datos)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001',
        'Cliente Demo', '3001234567', 'demo@correo.com', true);

insert into vehiculos (establecimiento_id, cliente_id, placa, tipo, marca, color)
values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1',
        'ABC123', 'carro', 'Mazda', 'Rojo');

-- =====================================================================
--  4) Crear el usuario ADMIN para poder iniciar sesión
--  a) Supabase → Authentication → Users → "Add user"
--     correo: admin@zaru.com   contraseña: la que quieran
--     (marcar "Auto Confirm User")
--  b) Copiar el "User UID" que aparece y reemplazarlo abajo.
--  c) Correr solo este bloque.
-- =====================================================================
-- insert into perfiles (id, establecimiento_id, nombre, rol)
-- values ('PEGAR-AQUI-EL-USER-UID', '00000000-0000-0000-0000-000000000001', 'Admin Demo', 'admin');
