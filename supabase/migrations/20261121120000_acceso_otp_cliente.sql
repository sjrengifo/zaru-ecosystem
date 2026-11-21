-- RF-F5-11 / RF-F5-12 — Acceso del cliente final con un código de un solo uso por SMS.
--
-- El cliente escribe su celular en /s/{slug}/historial (o notificaciones, preferencias), recibe un
-- código de 6 dígitos y, al validarlo, la API le entrega un pase firmado de 30 días. Reemplaza el
-- acceso con placa + celular de HU-23, que no exigía ningún secreto.
--
-- Solo se guarda el HMAC del código (RNF-F5-03), nunca el código ni el celular: el cliente ya
-- identifica el número. 5 intentos, 5 minutos de vigencia y un solo uso.

create table if not exists otp_codigos (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references establecimientos(id) on delete cascade,
  cliente_id         uuid not null,
  codigo_hash        text not null,
  intentos           smallint not null default 0 check (intentos >= 0),
  expira_at          timestamptz not null,
  usado_at           timestamptz,
  created_at         timestamptz not null default now(),
  foreign key (cliente_id, establecimiento_id)
    references clientes (id, establecimiento_id) on delete cascade
);

alter table otp_codigos enable row level security;
-- Sin políticas: solo el servidor (service_role) lee y escribe esta tabla.

create index if not exists otp_codigos_cliente_idx
  on otp_codigos (cliente_id, created_at desc);

comment on table otp_codigos is
  'RF-F5-11/12: códigos de un solo uso para que el cliente final entre a su historial, notificaciones y preferencias. Guarda solo el hash.';
