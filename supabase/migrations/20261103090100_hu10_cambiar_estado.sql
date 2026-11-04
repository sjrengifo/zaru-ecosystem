-- HU-10 (ZARU-10): avanzar y revertir el estado de una orden con trazabilidad.
-- RF-F3-05 a RF-F3-09:
-- - flujo recibido -> en_lavado -> (secado) -> listo -> entregado;
-- - historial con estado anterior, nuevo, usuario y hora;
-- - entrega con entregada_at;
-- - evento de dominio en la misma transacción para que F6/HU-46 notifique.

alter table ordenes
  add column version integer not null default 1 check (version > 0);

alter table historial_estados
  add column estado_anterior estado_orden,
  add column revertido boolean not null default false;

create index historial_estados_ultimo_idx
  on historial_estados (orden_id, created_at desc, id desc);

---------------------------------------------------------------------------
-- Outbox de dominio (RF-F3-08). F6 lo consume para generar notificaciones.
---------------------------------------------------------------------------
create table eventos (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references establecimientos(id) on delete cascade,
  tipo               text not null
                       check (tipo in ('orden.creada', 'orden.estado_cambiado', 'orden.estado_revertido', 'orden.entregada')),
  orden_id           uuid not null,
  payload            jsonb not null default '{}'::jsonb,
  procesado_at       timestamptz,
  created_at         timestamptz not null default now(),
  foreign key (orden_id, establecimiento_id) references ordenes (id, establecimiento_id) on delete cascade
);

alter table eventos enable row level security;

create index eventos_pendientes_idx on eventos (created_at)
  where procesado_at is null;
create index eventos_establecimiento_fecha_idx on eventos (establecimiento_id, created_at desc);

revoke all on table eventos from public, anon, authenticated;
grant select, insert, update, delete on table eventos to service_role;

---------------------------------------------------------------------------
-- Cambio y reversión de estado.
-- La función es la fuente de verdad: bloquea la orden, valida la transición,
-- registra el historial y crea el evento en la misma transacción.
---------------------------------------------------------------------------
create or replace function public.cambiar_estado_orden(
  p_establecimiento_id uuid,
  p_orden_id uuid,
  p_nuevo_estado estado_orden,
  p_usuario_id uuid,
  p_revertir boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_orden record;
  v_historial record;
  v_estado_anterior estado_orden;
  v_estado_nuevo estado_orden;
  v_historial_id bigint;
  v_evento text := 'orden.estado_cambiado';
begin
  if p_usuario_id is null or not exists (
    select 1 from perfiles
    where id = p_usuario_id
      and establecimiento_id = p_establecimiento_id
      and activo
  ) then
    raise exception 'El usuario no está activo en el establecimiento de la orden'
      using errcode = '23514', hint = 'usuario';
  end if;

  select o.*, v.placa
    into v_orden
  from ordenes o
  join vehiculos v on v.id = o.vehiculo_id and v.establecimiento_id = o.establecimiento_id
  where o.id = p_orden_id
    and o.establecimiento_id = p_establecimiento_id
  for update of o;

  if not found then
    raise exception 'Orden no encontrada'
      using errcode = 'P0001', hint = 'NO_ENCONTRADO';
  end if;

  v_estado_anterior := v_orden.estado;

  if p_revertir then
    if v_estado_anterior = 'entregado' then
      raise exception 'Una orden entregada no se puede revertir'
        using errcode = 'P0001', hint = 'CONFLICTO';
    end if;

    select h.id, h.estado, h.estado_anterior, h.created_at
      into v_historial
    from historial_estados h
    where h.orden_id = p_orden_id
      and not h.revertido
    order by h.created_at desc, h.id desc
    limit 1;

    if not found or v_historial.estado_anterior is null then
      raise exception 'No hay un cambio de estado reciente para revertir'
        using errcode = 'P0001', hint = 'CONFLICTO';
    end if;
    if v_historial.estado <> v_estado_anterior then
      raise exception 'El último cambio ya no corresponde al estado actual de la orden'
        using errcode = 'P0001', hint = 'CONFLICTO';
    end if;
    if now() - v_historial.created_at > interval '60 seconds' then
      raise exception 'Solo se puede revertir dentro de los 60 segundos siguientes al cambio'
        using errcode = 'P0001', hint = 'CONFLICTO';
    end if;

    v_estado_nuevo := v_historial.estado_anterior;
    v_historial_id := v_historial.id;
    v_evento := 'orden.estado_revertido';

    update historial_estados set revertido = true where id = v_historial_id;
  else
    if p_nuevo_estado is null then
      raise exception 'Indica el estado al que quieres avanzar'
        using errcode = '23514', hint = 'estado';
    end if;

    if not (
      (v_estado_anterior = 'recibido'  and p_nuevo_estado = 'en_lavado') or
      (v_estado_anterior = 'en_lavado' and p_nuevo_estado = 'secado')    or
      (v_estado_anterior = 'en_lavado' and p_nuevo_estado = 'listo')     or
      (v_estado_anterior = 'secado'    and p_nuevo_estado = 'listo')     or
      (v_estado_anterior = 'listo'     and p_nuevo_estado = 'entregado')
    ) then
      raise exception 'No se puede pasar una orden de % a %', v_estado_anterior, p_nuevo_estado
        using errcode = 'P0001', hint = 'CONFLICTO';
    end if;

    v_estado_nuevo := p_nuevo_estado;

    insert into historial_estados (orden_id, estado_anterior, estado, usuario_id)
    values (p_orden_id, v_estado_anterior, v_estado_nuevo, p_usuario_id)
    returning id into v_historial_id;
  end if;

  update ordenes
  set estado = v_estado_nuevo,
      estado_desde = now(),
      version = version + 1,
      entregada_at = case
        when v_estado_nuevo = 'entregado' then coalesce(entregada_at, now())
        else entregada_at
      end
  where id = p_orden_id;

  insert into eventos (establecimiento_id, tipo, orden_id, payload)
  values (
    p_establecimiento_id,
    v_evento,
    p_orden_id,
    jsonb_build_object(
      'ordenId', p_orden_id,
      'vehiculoId', v_orden.vehiculo_id,
      'historialId', v_historial_id,
      'placa', v_orden.placa,
      'codigoSeguimiento', v_orden.codigo_seguimiento,
      'total', v_orden.total,
      'estadoAnterior', v_estado_anterior,
      'estado', v_estado_nuevo,
      'estadoNuevo', v_estado_nuevo,
      'usuarioId', p_usuario_id,
      'cambiadoAt', now()
    )
  );

  return p_orden_id;
end $$;

revoke execute on function public.cambiar_estado_orden(uuid, uuid, estado_orden, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.cambiar_estado_orden(uuid, uuid, estado_orden, uuid, boolean)
  to service_role;
