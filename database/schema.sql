-- =====================================================================
--  ZARU ECOSYSTEM — Esquema de base de datos (Supabase / PostgreSQL)
--  Cómo usarlo: Supabase → SQL Editor → pegar todo → Run.
-- =====================================================================
--  Idea clave (multi-tenant): TODAS las tablas tienen "establecimiento_id".
--  Las reglas RLS del final hacen que cada usuario solo vea los datos
--  de SU car wash (HU-01, criterio 3).
-- =====================================================================

-- ---------- Tipos ----------
create type rol_usuario  as enum ('admin', 'operario');
create type estado_orden as enum ('recibido', 'en_lavado', 'listo', 'entregado');

-- ---------- Establecimientos (cada car wash afiliado) — HU-13 ----------
create table establecimientos (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  logo_url         text,
  color_primario   text default '#2563EB',
  color_secundario text default '#0EA5E9',
  created_at       timestamptz default now()
);

-- ---------- Perfiles de usuario (admin u operario) — HU-01, HU-02 ----------
-- "id" es el mismo id del usuario en Supabase Auth.
create table perfiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  establecimiento_id uuid not null references establecimientos(id) on delete cascade,
  nombre             text not null,
  rol                rol_usuario not null default 'operario',
  activo             boolean not null default true,
  created_at         timestamptz default now()
);

-- ---------- Clientes — HU-03, HU-04 ----------
create table clientes (
  id                   uuid primary key default gen_random_uuid(),
  establecimiento_id   uuid not null references establecimientos(id) on delete cascade,
  nombre               text not null,
  telefono             text not null,
  correo               text,
  autorizacion_datos   boolean not null check (autorizacion_datos = true), -- Ley 1581
  fecha_autorizacion   timestamptz not null default now(),
  created_at           timestamptz default now(),
  unique (establecimiento_id, telefono)
);

-- ---------- Vehículos — HU-05 ----------
create table vehiculos (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references establecimientos(id) on delete cascade,
  cliente_id         uuid not null references clientes(id) on delete cascade,
  placa              text not null,
  tipo               text not null,          -- carro, moto, camioneta…
  marca              text,
  color              text,
  created_at         timestamptz default now(),
  unique (establecimiento_id, placa)
);

-- ---------- Catálogo de servicios — HU-07 ----------
create table servicios (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references establecimientos(id) on delete cascade,
  nombre             text not null,
  precio             numeric(12,2) not null check (precio >= 0),
  duracion_min       integer not null check (duracion_min > 0),
  activo             boolean not null default true,
  created_at         timestamptz default now()
);

-- ---------- Promociones — HU-12 ----------
create table promociones (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references establecimientos(id) on delete cascade,
  nombre             text not null,
  descuento_pct      numeric(5,2) not null check (descuento_pct > 0 and descuento_pct <= 100),
  fecha_inicio       date not null,
  fecha_fin          date not null check (fecha_fin >= fecha_inicio),
  created_at         timestamptz default now()
);

create table promocion_servicios (
  promocion_id uuid references promociones(id) on delete cascade,
  servicio_id  uuid references servicios(id)  on delete cascade,
  primary key (promocion_id, servicio_id)
);

-- ---------- Órdenes de servicio (cada lavado) — HU-08, HU-09, HU-10 ----------
create table ordenes (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references establecimientos(id) on delete cascade,
  vehiculo_id        uuid not null references vehiculos(id),
  estado             estado_orden not null default 'recibido',
  subtotal           numeric(12,2) not null default 0,
  descuento          numeric(12,2) not null default 0,
  total              numeric(12,2) not null default 0,
  creada_por         uuid references perfiles(id),
  estado_desde       timestamptz not null default now(),  -- HU-11: desde cuándo está en ese estado
  created_at         timestamptz default now(),
  entregada_at       timestamptz
);

-- Servicios de cada orden. Se guarda el precio del momento (HU-07, criterio 2).
create table orden_servicios (
  orden_id     uuid references ordenes(id) on delete cascade,
  servicio_id  uuid references servicios(id),
  precio       numeric(12,2) not null,
  duracion_min integer not null,
  primary key (orden_id, servicio_id)
);

-- Registro de cada cambio de estado: quién y cuándo (HU-10, criterio 1).
create table historial_estados (
  id          bigint generated always as identity primary key,
  orden_id    uuid not null references ordenes(id) on delete cascade,
  estado      estado_orden not null,
  usuario_id  uuid references perfiles(id),
  created_at  timestamptz default now()
);

-- ---------- Índices ----------
create index on clientes  (establecimiento_id);
create index on vehiculos (establecimiento_id, cliente_id);
create index on ordenes   (establecimiento_id, estado);

-- =====================================================================
--  SEGURIDAD MULTI-TENANT (Row Level Security)
-- =====================================================================

-- Devuelve el establecimiento del usuario que hace la consulta.
create or replace function mi_establecimiento()
returns uuid language sql stable security definer set search_path = public as $$
  select establecimiento_id from perfiles where id = auth.uid() and activo
$$;

create or replace function soy_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'admin' and activo)
$$;

alter table establecimientos    enable row level security;
alter table perfiles            enable row level security;
alter table clientes            enable row level security;
alter table vehiculos           enable row level security;
alter table servicios           enable row level security;
alter table promociones         enable row level security;
alter table promocion_servicios enable row level security;
alter table ordenes             enable row level security;
alter table orden_servicios     enable row level security;
alter table historial_estados   enable row level security;

-- Lectura: cada usuario solo ve lo de su establecimiento.
create policy "ver mi establecimiento" on establecimientos for select using (id = mi_establecimiento());
create policy "ver perfiles"           on perfiles     for select using (establecimiento_id = mi_establecimiento());
create policy "ver clientes"           on clientes     for select using (establecimiento_id = mi_establecimiento());
create policy "ver vehiculos"          on vehiculos    for select using (establecimiento_id = mi_establecimiento());
create policy "ver servicios"          on servicios    for select using (establecimiento_id = mi_establecimiento());
create policy "ver promociones"        on promociones  for select using (establecimiento_id = mi_establecimiento());
create policy "ver ordenes"            on ordenes      for select using (establecimiento_id = mi_establecimiento());
create policy "ver promo-servicios"    on promocion_servicios for select
  using (exists (select 1 from promociones p where p.id = promocion_id and p.establecimiento_id = mi_establecimiento()));
create policy "ver orden-servicios"    on orden_servicios for select
  using (exists (select 1 from ordenes o where o.id = orden_id and o.establecimiento_id = mi_establecimiento()));
create policy "ver historial"          on historial_estados for select
  using (exists (select 1 from ordenes o where o.id = orden_id and o.establecimiento_id = mi_establecimiento()));

-- Escritura: la hace el BACKEND con la "service_role key", que salta RLS.
-- El backend es quien valida roles (admin/operario) y el establecimiento.

-- =====================================================================
--  TIEMPO REAL — el dashboard escucha cambios en "ordenes" (HU-09)
-- =====================================================================
alter publication supabase_realtime add table ordenes;
