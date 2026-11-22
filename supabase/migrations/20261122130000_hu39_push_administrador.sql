-- HU-39/HU-40 — Dispositivo push del administrador para la prueba real de envío.
--
-- HU-40 registra dispositivos de clientes finales (suscripciones_push), pero la prueba
-- POST /notificaciones/prueba envía al correo/celular del administrador autenticado. Para que el
-- canal push también sea verificable desde el panel, el administrador registra su propio navegador.
--
-- El usuario y la sede los toma el backend de la sesión (req.ctx / req.tenant); el frontend nunca
-- puede elegir a quién pertenece el dispositivo. RLS queda activo sin políticas para authenticated:
-- solo el servicio con service_role (req.tenant) puede leer y escribir esta tabla.

create table if not exists notificaciones_push_admin (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references establecimientos(id) on delete cascade,
  usuario_id         uuid not null,
  endpoint           text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh             text not null check (char_length(p256dh) between 20 and 200),
  auth               text not null check (char_length(auth) between 10 and 100),
  dispositivo        text not null default 'Navegador',
  actualizada_at     timestamptz not null default now(),
  unique (establecimiento_id, usuario_id)
);

create index if not exists notificaciones_push_admin_endpoint_idx
  on notificaciones_push_admin (endpoint);

alter table notificaciones_push_admin enable row level security;

grant select, insert, update, delete on notificaciones_push_admin to service_role;
