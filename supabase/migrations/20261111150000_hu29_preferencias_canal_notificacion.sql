-- HU-29 (ZARU-18): selección del canal de notificación preferido por el cliente final.
--
-- El cliente elige desde la app por cuáles canales quiere recibir los avisos de su servicio
-- (push, sms, correo). Esta migración agrega:
--   1. preferencias_notificacion: una fila por cliente con el estado de cada canal (CA1, CA3, CA4) y el
--      celular verificado para SMS (CA2).
--   2. verificaciones_sms: códigos de 6 dígitos de un solo uso, con vencimiento y límite de intentos
--      (CA2). Solo se guarda un hash del código, nunca el código.
--
-- Un cliente sin fila de preferencias conserva el comportamiento anterior: recibe por correo.
-- La migración es idempotente: se puede volver a aplicar sin duplicar objetos.

---------------------------------------------------------------------------
-- 1. Preferencias de canal por cliente
---------------------------------------------------------------------------
create table if not exists preferencias_notificacion (
  id                          uuid primary key default gen_random_uuid(),
  establecimiento_id          uuid not null references establecimientos(id) on delete cascade,
  cliente_id                  uuid not null,
  canal_push                  boolean not null default false,
  canal_sms                   boolean not null default false,
  canal_correo                boolean not null default true,
  -- Celular al que llegan los SMS y momento en que se validó con el código. Se guarda en texto
  -- plano igual que clientes.telefono (10 dígitos); la API solo lo devuelve enmascarado.
  telefono_sms                text check (telefono_sms is null or telefono_sms ~ '^3[0-9]{9}$'),
  telefono_sms_verificado_at  timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (cliente_id),
  foreign key (cliente_id, establecimiento_id)
    references clientes (id, establecimiento_id) on delete cascade,
  -- El canal SMS solo puede quedar activo con un celular validado (CA2).
  constraint preferencias_sms_requiere_celular
    check (not canal_sms or (telefono_sms is not null and telefono_sms_verificado_at is not null))
);

alter table preferencias_notificacion enable row level security;
drop policy if exists "ver preferencias de notificacion" on preferencias_notificacion;
create policy "ver preferencias de notificacion" on preferencias_notificacion
  for select using (establecimiento_id = privado.mi_establecimiento());

create index if not exists preferencias_notificacion_establecimiento_idx
  on preferencias_notificacion (establecimiento_id);

---------------------------------------------------------------------------
-- 2. Verificación del celular con código de 6 dígitos
---------------------------------------------------------------------------
create table if not exists verificaciones_sms (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references establecimientos(id) on delete cascade,
  cliente_id         uuid not null,
  telefono           text not null check (telefono ~ '^3[0-9]{9}$'),
  -- HMAC del código con una clave del servidor: un 6 dígitos en claro sería trivial de invertir.
  codigo_hash        text not null,
  intentos           smallint not null default 0 check (intentos >= 0),
  expira_at          timestamptz not null,
  usado_at           timestamptz,
  created_at         timestamptz not null default now(),
  foreign key (cliente_id, establecimiento_id)
    references clientes (id, establecimiento_id) on delete cascade
);

alter table verificaciones_sms enable row level security;
-- Sin políticas de lectura: solo el servidor (service_role) consulta esta tabla.

create index if not exists verificaciones_sms_cliente_idx
  on verificaciones_sms (cliente_id, created_at desc);

comment on table preferencias_notificacion is
  'HU-29: canales (push, sms, correo) por los que el cliente quiere recibir los avisos de su servicio. Sin fila = solo correo.';
comment on table verificaciones_sms is
  'HU-29 CA2: códigos de 6 dígitos para validar el celular antes de activar el canal SMS. Guarda el hash, el vencimiento y los intentos.';
