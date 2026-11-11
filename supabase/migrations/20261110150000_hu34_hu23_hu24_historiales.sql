-- HU-34 (ZARU-23) · HU-23 (ZARU-35) · HU-24 (ZARU-43)
--
-- HU-34: bitácora de notificaciones y auditoría de cada intento de envío.
--   La tabla `notificaciones` ya existía (HU-42) como outbox. Aquí se agrega el detalle por intento
--   para poder mostrar en el panel cuándo se intentó, por qué canal, con qué proveedor, si el
--   proveedor aceptó el mensaje y si el error era recuperable. No se guarda el destino otra vez:
--   el destino vive cifrado en `notificaciones.destino` (HU-50).
--
-- HU-23 / HU-24: el historial del cliente final se calcula sobre `ordenes` (estado `entregado` y
--   `entregada_at`) y sus `orden_servicios`. No requiere tablas nuevas; se agregan índices para
--   que el listado por cliente/placa y el detalle respondan rápido.
--
-- La migración es idempotente: se puede volver a aplicar sin duplicar objetos.

---------------------------------------------------------------------------
-- HU-34 · Detalle de cada intento de envío
---------------------------------------------------------------------------
-- Llave compuesta para que la base también impida mezclar intentos de dos establecimientos.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'notificaciones_id_establecimiento_key'
      and conrelid = 'public.notificaciones'::regclass
  ) then
    alter table notificaciones
      add constraint notificaciones_id_establecimiento_key unique (id, establecimiento_id);
  end if;
end $$;

create table if not exists notificacion_intentos (
  id                 bigint generated always as identity primary key,
  notificacion_id    uuid not null,
  establecimiento_id uuid not null references establecimientos(id) on delete cascade,
  intento            smallint not null check (intento >= 1),
  canal              text not null check (canal in ('push', 'sms', 'correo')),
  resultado          text not null check (resultado in ('enviado', 'fallido')),
  proveedor          text,
  id_proveedor       text,
  -- El proveedor aceptó el mensaje. "Entregado" solo se marca si el proveedor confirma la entrega
  -- (acuse/webhook); así la bitácora distingue aceptado de realmente entregado.
  entregado          boolean not null default false,
  recuperable        boolean,
  error              text,
  created_at         timestamptz not null default now(),
  foreign key (notificacion_id, establecimiento_id)
    references notificaciones (id, establecimiento_id) on delete cascade,
  unique (notificacion_id, canal, intento)
);

alter table notificacion_intentos enable row level security;

drop policy if exists "ver intentos de notificacion" on notificacion_intentos;
create policy "ver intentos de notificacion" on notificacion_intentos
  for select using (establecimiento_id = privado.mi_establecimiento());

create index if not exists notificacion_intentos_notificacion_idx
  on notificacion_intentos (notificacion_id, created_at);
create index if not exists notificacion_intentos_establecimiento_idx
  on notificacion_intentos (establecimiento_id, created_at desc);

-- Bitácora combinable: establecimiento + estado/canal/tipo + fecha.
create index if not exists notificaciones_bitacora_idx
  on notificaciones (establecimiento_id, estado, canal, created_at desc);

---------------------------------------------------------------------------
-- HU-23 / HU-24 · Consultas del historial del cliente final
---------------------------------------------------------------------------
-- Listado: servicios entregados de un cliente (por sus vehículos), del más reciente al más antiguo.
create index if not exists ordenes_cliente_entrega_idx
  on ordenes (vehiculo_id, entregada_at desc)
  where estado = 'entregado';

-- Filtro por placa dentro del establecimiento (la unicidad ya es por sede).
create index if not exists vehiculos_cliente_placa_idx
  on vehiculos (cliente_id, placa);
