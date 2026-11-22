-- HU-40 (ZARU-70) — Registrar el dispositivo del cliente final para recibir notificaciones push.
--
-- Cuando el cliente acepta el permiso en la web móvil, el navegador entrega una suscripción Web Push
-- (endpoint + llaves p256dh y auth). Se guarda asociada al cliente y a su sede; el motor de avisos la
-- usa para el canal push de HU-29. Si el servicio de push responde que la suscripción ya no existe
-- (404/410), se borra.
--
-- El endpoint identifica al navegador del dispositivo: es único. Si otro cliente se registra desde el
-- mismo navegador, la suscripción pasa a ese cliente.

create table if not exists suscripciones_push (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references establecimientos(id) on delete cascade,
  cliente_id         uuid not null,
  endpoint           text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh             text not null check (char_length(p256dh) between 20 and 200),
  auth               text not null check (char_length(auth) between 10 and 100),
  -- Navegador y sistema (User-Agent recortado), para que el cliente reconozca su dispositivo.
  dispositivo        text check (dispositivo is null or char_length(dispositivo) <= 200),
  created_at         timestamptz not null default now(),
  actualizada_at     timestamptz not null default now(),
  foreign key (cliente_id, establecimiento_id)
    references clientes (id, establecimiento_id) on delete cascade
);

alter table suscripciones_push enable row level security;
-- Sin políticas: solo el servidor (service_role) lee y escribe esta tabla.

create index if not exists suscripciones_push_cliente_idx
  on suscripciones_push (cliente_id, actualizada_at desc);

comment on table suscripciones_push is
  'HU-40: dispositivos del cliente final registrados para recibir avisos push (Web Push). Una fila por navegador.';
