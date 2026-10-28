-- HU-42 (ZARU-49): integridad por establecimiento, entidad de notificaciones
-- e índices para las consultas frecuentes con 81 establecimientos.

---------------------------------------------------------------------------
-- CA1. Integridad referencial dentro del mismo establecimiento
---------------------------------------------------------------------------
-- Las llaves compuestas (id, establecimiento_id) permiten que la base rechace
-- relaciones entre datos de establecimientos distintos (por ejemplo, una orden
-- de A con un vehículo de B), aunque el error venga del backend.

alter table clientes    add constraint clientes_id_establecimiento_key    unique (id, establecimiento_id);
alter table vehiculos   add constraint vehiculos_id_establecimiento_key   unique (id, establecimiento_id);
alter table servicios   add constraint servicios_id_establecimiento_key   unique (id, establecimiento_id);
alter table promociones add constraint promociones_id_establecimiento_key unique (id, establecimiento_id);
alter table ordenes     add constraint ordenes_id_establecimiento_key     unique (id, establecimiento_id);
alter table perfiles    add constraint perfiles_id_establecimiento_key    unique (id, establecimiento_id);

alter table vehiculos
  add constraint vehiculos_cliente_mismo_establecimiento_fkey
  foreign key (cliente_id, establecimiento_id) references clientes (id, establecimiento_id) on delete cascade;

alter table ordenes
  add constraint ordenes_vehiculo_mismo_establecimiento_fkey
  foreign key (vehiculo_id, establecimiento_id) references vehiculos (id, establecimiento_id);

alter table ordenes
  add constraint ordenes_creador_mismo_establecimiento_fkey
  foreign key (creada_por, establecimiento_id) references perfiles (id, establecimiento_id);

-- Las tablas puente no guardan establecimiento_id: lo heredan de su padre.
-- Un trigger verifica que ambos extremos pertenezcan al mismo establecimiento.
create or replace function privado.validar_orden_servicio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from ordenes o join servicios s on s.establecimiento_id = o.establecimiento_id
    where o.id = new.orden_id and s.id = new.servicio_id
  ) then
    raise exception 'El servicio % no pertenece al establecimiento de la orden %', new.servicio_id, new.orden_id
      using errcode = '23503';
  end if;
  return new;
end $$;

create trigger orden_servicios_mismo_establecimiento
  before insert or update on orden_servicios
  for each row execute function privado.validar_orden_servicio();

create or replace function privado.validar_promocion_servicio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from promociones p join servicios s on s.establecimiento_id = p.establecimiento_id
    where p.id = new.promocion_id and s.id = new.servicio_id
  ) then
    raise exception 'El servicio % no pertenece al establecimiento de la promoción %', new.servicio_id, new.promocion_id
      using errcode = '23503';
  end if;
  return new;
end $$;

create trigger promocion_servicios_mismo_establecimiento
  before insert or update on promocion_servicios
  for each row execute function privado.validar_promocion_servicio();

create or replace function privado.validar_historial_estado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.usuario_id is not null and not exists (
    select 1 from ordenes o join perfiles p on p.establecimiento_id = o.establecimiento_id
    where o.id = new.orden_id and p.id = new.usuario_id
  ) then
    raise exception 'El usuario % no pertenece al establecimiento de la orden %', new.usuario_id, new.orden_id
      using errcode = '23503';
  end if;
  return new;
end $$;

create trigger historial_estados_mismo_establecimiento
  before insert or update on historial_estados
  for each row execute function privado.validar_historial_estado();

revoke execute on function privado.validar_orden_servicio()     from public, anon, authenticated;
revoke execute on function privado.validar_promocion_servicio() from public, anon, authenticated;
revoke execute on function privado.validar_historial_estado()   from public, anon, authenticated;

---------------------------------------------------------------------------
-- CA1. Entidad de notificaciones (cola tipo outbox, ADR-03)
---------------------------------------------------------------------------
-- La lógica de envío, reintentos y canal alterno se implementa en HU-46.

create table notificaciones (
  id                     uuid primary key default gen_random_uuid(),
  establecimiento_id     uuid not null references establecimientos(id) on delete cascade,
  cliente_id             uuid not null,
  orden_id               uuid,
  tipo                   text not null check (tipo in ('operativa', 'comercial', 'recordatorio', 'novedad', 'correccion', 'sistema')),
  evento                 text not null,
  canal                  text not null check (canal in ('push', 'sms', 'correo')),
  destino                text not null,
  contenido              jsonb not null default '{}'::jsonb,
  estado                 text not null default 'pendiente'
                           check (estado in ('programada', 'pendiente', 'enviando', 'enviada', 'entregada', 'fallida', 'cancelada')),
  intentos               smallint not null default 0 check (intentos >= 0),
  programada_para        timestamptz not null default now(),
  proximo_intento_at     timestamptz,
  error                  text,
  clave_dedupe           text unique,
  notificacion_origen_id uuid references notificaciones(id),
  leida_at               timestamptz,
  created_at             timestamptz not null default now(),
  foreign key (cliente_id, establecimiento_id) references clientes (id, establecimiento_id) on delete cascade,
  foreign key (orden_id, establecimiento_id)   references ordenes  (id, establecimiento_id) on delete cascade
);

alter table notificaciones enable row level security;
create policy "ver notificaciones" on notificaciones
  for select using (establecimiento_id = privado.mi_establecimiento());

---------------------------------------------------------------------------
-- CA3. Índices para las consultas frecuentes
---------------------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;

-- Dashboard: órdenes activas por establecimiento, ordenadas por antigüedad en el estado.
create index ordenes_activas_idx on ordenes (establecimiento_id, estado, estado_desde)
  where estado <> 'entregado';

-- Listado y reportes de órdenes por fecha.
create index ordenes_establecimiento_fecha_idx on ordenes (establecimiento_id, created_at desc);

-- Historial de servicios de un vehículo (reemplaza el índice simple por vehiculo_id).
drop index if exists ordenes_vehiculo_id_idx;
create index ordenes_vehiculo_fecha_idx on ordenes (vehiculo_id, created_at desc);

-- Línea de tiempo de una orden (reemplaza el índice simple por orden_id).
drop index if exists historial_estados_orden_id_idx;
create index historial_estados_orden_fecha_idx on historial_estados (orden_id, created_at);

-- Nota: la búsqueda de clientes por nombre parcial no necesita índice trigram: con unos
-- 1.500 clientes por establecimiento, el índice por establecimiento_id basta (0,7 ms medidos).

-- Búsqueda de vehículos por placa parcial.
create index vehiculos_placa_trgm_idx on vehiculos using gin (placa extensions.gin_trgm_ops);

-- Notificaciones: cola del worker, bitácora y llaves foráneas.
create index notificaciones_cola_idx on notificaciones (proximo_intento_at nulls first, programada_para)
  where estado in ('pendiente', 'programada');
create index notificaciones_establecimiento_fecha_idx on notificaciones (establecimiento_id, created_at desc);
create index notificaciones_cliente_idx on notificaciones (cliente_id, establecimiento_id);
create index notificaciones_orden_idx on notificaciones (orden_id, establecimiento_id);
create index notificaciones_origen_idx on notificaciones (notificacion_origen_id);
