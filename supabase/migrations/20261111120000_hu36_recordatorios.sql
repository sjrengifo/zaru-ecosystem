-- HU-36 — Recordatorio del próximo lavado.
--
-- La frecuencia se calcula con los servicios ya entregados del vehículo. El recordatorio se guarda
-- aparte de la cola para poder cancelarlo cuando el cliente vuelve antes de la fecha estimada y para
-- recordar que la baja aplica solo a ese vehículo, no a los avisos del servicio ni a las promociones.

alter table public.vehiculos
  add column recordatorios_activos boolean not null default true;

create table public.recordatorios (
  id uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos(id) on delete cascade,
  cliente_id uuid not null,
  vehiculo_id uuid not null,
  fecha_estimada date not null,
  fecha_programada timestamptz not null,
  promedio_dias integer not null check (promedio_dias >= 1),
  servicios_base integer not null check (servicios_base >= 3),
  estado text not null default 'programado'
    check (estado in ('programado', 'enviado', 'cancelado')),
  motivo_cancelacion text,
  notificacion_id uuid references public.notificaciones(id) on delete set null,
  enviado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recordatorios_cliente_mismo_establecimiento_fkey
    foreign key (cliente_id, establecimiento_id)
    references public.clientes(id, establecimiento_id) on delete cascade,
  constraint recordatorios_vehiculo_mismo_establecimiento_fkey
    foreign key (vehiculo_id, establecimiento_id)
    references public.vehiculos(id, establecimiento_id) on delete cascade
);

comment on table public.recordatorios is
  'HU-36: próximo lavado estimado por vehículo. Solo puede existir uno programado por vehículo.';
comment on column public.vehiculos.recordatorios_activos is
  'HU-36 CA3: falso cuando el cliente pidió no volver a recibir recordatorios de este vehículo.';

create unique index recordatorios_uno_programado_por_vehiculo
  on public.recordatorios (vehiculo_id)
  where estado = 'programado';

create index recordatorios_por_establecimiento
  on public.recordatorios (establecimiento_id, estado, fecha_programada);

alter table public.recordatorios enable row level security;

create policy "ver recordatorios" on public.recordatorios
  for select using (establecimiento_id = privado.mi_establecimiento());
