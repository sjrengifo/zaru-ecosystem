-- HU-08 (ZARU-9): registrar el ingreso de un vehículo y crear su orden de servicio.
-- RF-F3-01, RF-F3-02, RF-F3-03 y RF-F3-04:
-- - una orden activa por vehículo;
-- - servicios activos del establecimiento, con precio y duración copiados;
-- - subtotal, descuento y total calculados en la base;
-- - código de seguimiento y hora estimada de entrega;
-- - cliente, consentimiento, vehículo y orden se crean juntos o no se crea nada.

------------------------------------------------------------
-- Datos que necesita la orden y que el modelo inicial no tenía.
------------------------------------------------------------
alter table ordenes
  add column codigo_seguimiento text,
  add column entrega_estimada_at timestamptz,
  add column observaciones text check (observaciones is null or char_length(observaciones) <= 500),
  add column promocion_id uuid references promociones(id) on delete set null;

alter table orden_servicios
  add column descuento numeric(12,2) not null default 0 check (descuento >= 0),
  add column promocion_id uuid references promociones(id) on delete set null;

------------------------------------------------------------
-- Código de seguimiento: 10 caracteres de un alfabeto sin ambigüedades (~50 bits).
-- Se genera fuera de la orden para poder completar órdenes históricas.
------------------------------------------------------------
create or replace function privado.nuevo_codigo_seguimiento()
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  alfabeto constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  codigo text;
  i integer;
begin
  for intento in 1..20 loop
    codigo := '';
    for i in 1..10 loop
      codigo := codigo || substr(alfabeto, 1 + floor(random() * length(alfabeto))::integer, 1);
    end loop;
    exit when not exists (select 1 from ordenes where codigo_seguimiento = codigo);
  end loop;

  if exists (select 1 from ordenes where codigo_seguimiento = codigo) then
    raise exception 'No se pudo generar un código de seguimiento único';
  end if;

  return codigo;
end $$;

-- Órdenes creadas antes de esta migración: se completan una por una para no repetir códigos.
do $$
declare
  fila record;
begin
  for fila in select id from ordenes where codigo_seguimiento is null loop
    update ordenes set codigo_seguimiento = privado.nuevo_codigo_seguimiento() where id = fila.id;
  end loop;
end $$;

alter table ordenes alter column codigo_seguimiento set not null;
create unique index ordenes_codigo_seguimiento_idx on ordenes (codigo_seguimiento);

-- RF-F3-03: un vehículo no puede estar dos veces en el car wash.
-- El índice parcial también protege ante dos peticiones simultáneas.
create unique index ordenes_una_activa_por_vehiculo_idx
  on ordenes (vehiculo_id)
  where estado <> 'entregado';

revoke execute on function privado.nuevo_codigo_seguimiento() from public, anon, authenticated;

------------------------------------------------------------
-- RF-F3-01, RF-F3-02 y RF-F3-04: crear la orden completa.
-- p_vehiculo_id: vehículo ya registrado.
-- p_cliente + p_vehiculo: alta atómica de cliente, consentimiento y vehículo (HU-08 CA2).
-- Devuelve el id de la orden creada.
------------------------------------------------------------
create or replace function public.crear_orden(
  p_establecimiento_id uuid,
  p_vehiculo_id uuid,
  p_servicio_ids uuid[],
  p_observaciones text,
  p_creada_por uuid,
  p_cliente jsonb default null,
  p_vehiculo jsonb default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_orden_id uuid;
  v_vehiculo_id uuid := p_vehiculo_id;
  v_cliente_id uuid;
  v_subtotal numeric(12,2) := 0;
  v_descuento_total numeric(12,2) := 0;
  v_duracion integer := 0;
  v_promocion_orden uuid;
  v_promocion_servicio uuid;
  v_descuento_servicio numeric(12,2) := 0;
  v_mayor_descuento numeric(12,2) := -1;
  v_servicio record;
  v_codigo text;
begin
  if coalesce(cardinality(p_servicio_ids), 0) = 0 then
    raise exception 'Elige al menos un servicio del catálogo' using errcode = '23514', hint = 'servicioIds';
  end if;
  if cardinality(p_servicio_ids) <> (select count(distinct s) from unnest(p_servicio_ids) as s) then
    raise exception 'No repitas un servicio en la misma orden' using errcode = '23514', hint = 'servicioIds';
  end if;
  if exists (
    select 1 from unnest(p_servicio_ids) as elegido(id)
    where not exists (
      select 1 from servicios s
      where s.id = elegido.id and s.establecimiento_id = p_establecimiento_id and s.activo
    )
  ) then
    raise exception 'Uno o más servicios no están disponibles en el catálogo del establecimiento'
      using errcode = '23514', hint = 'servicioIds';
  end if;

  if v_vehiculo_id is null then
    if p_cliente is null or p_vehiculo is null then
      raise exception 'Indica el vehículo registrado o los datos del cliente y del vehículo'
        using errcode = '23514', hint = 'vehiculoId';
    end if;

    -- El alta del cliente y su consentimiento ya existe (HU-51) y se reutiliza aquí.
    -- Si algo falla después, la transacción completa se revierte.
    begin
      select id into v_cliente_id
      from public.crear_cliente_con_consentimiento(
        p_establecimiento_id,
        p_cliente->>'nombre',
        p_cliente->>'telefono',
        nullif(p_cliente->>'correo', ''),
        coalesce((p_cliente->>'autorizacionDatos')::boolean, false),
        p_cliente->>'politicaVersion',
        coalesce(p_cliente->>'canal', 'panel'),
        nullif(p_cliente->>'ip', '')::inet,
        p_creada_por
      );
    exception when unique_violation then
      raise exception 'Ya existe un cliente con ese teléfono' using errcode = '23514', hint = 'telefono';
    end;

    begin
      insert into vehiculos (establecimiento_id, cliente_id, placa, tipo, marca, color)
      values (
        p_establecimiento_id,
        v_cliente_id,
        p_vehiculo->>'placa',
        p_vehiculo->>'tipo',
        nullif(p_vehiculo->>'marca', ''),
        nullif(p_vehiculo->>'color', '')
      )
      returning id into v_vehiculo_id;
    exception when unique_violation then
      raise exception 'Ya existe un vehículo con esa placa' using errcode = '23514', hint = 'placa';
    end;
  else
    if not exists (
      select 1 from vehiculos v
      where v.id = v_vehiculo_id and v.establecimiento_id = p_establecimiento_id
    ) then
      raise exception 'Vehículo no encontrado' using errcode = '23514', hint = 'vehiculoId';
    end if;
  end if;

  if exists (
    select 1 from ordenes o
    where o.vehiculo_id = v_vehiculo_id and o.estado <> 'entregado'
  ) then
    raise exception 'Este vehículo ya tiene un servicio en curso'
      using errcode = '23514', hint = 'vehiculoId';
  end if;

  -- Precios y duración se copian del catálogo en este momento (HU-07 CA2).
  select coalesce(sum(s.precio), 0), coalesce(sum(s.duracion_min), 0)
    into v_subtotal, v_duracion
  from servicios s
  where s.id = any (p_servicio_ids)
    and s.establecimiento_id = p_establecimiento_id
    and s.activo;

  v_codigo := privado.nuevo_codigo_seguimiento();

  begin
    insert into ordenes (
      establecimiento_id, vehiculo_id, estado, subtotal, descuento, total,
      creada_por, estado_desde, codigo_seguimiento, entrega_estimada_at, observaciones
    ) values (
      p_establecimiento_id, v_vehiculo_id, 'recibido', 0, 0, 0,
      p_creada_por, now(), v_codigo, now() + make_interval(mins => v_duracion),
      nullif(trim(p_observaciones), '')
    )
    returning id into v_orden_id;
  exception when unique_violation then
    if exists (
      select 1 from ordenes o
      where o.vehiculo_id = v_vehiculo_id and o.estado <> 'entregado'
    ) then
      raise exception 'Este veh��culo ya tiene un servicio en curso'
        using errcode = '23514', hint = 'vehiculoId';
    end if;
    raise;
  end;

  for v_servicio in
    select s.id, s.precio, s.duracion_min
    from servicios s
    where s.id = any (p_servicio_ids)
      and s.establecimiento_id = p_establecimiento_id
      and s.activo
    order by s.nombre
  loop
    v_promocion_servicio := null;
    v_descuento_servicio := 0;

    -- HU-12 CA3 / RF-F4-04: la mejor promoción vigente del servicio se aplica sola.
    select m.promocion_id, m.descuento
      into v_promocion_servicio, v_descuento_servicio
    from public.mejor_promocion(
      p_establecimiento_id, v_servicio.id, privado.hoy_bogota(), v_servicio.precio
    ) m;

    insert into orden_servicios (orden_id, servicio_id, precio, duracion_min, descuento, promocion_id)
    values (
      v_orden_id, v_servicio.id, v_servicio.precio, v_servicio.duracion_min,
      coalesce(v_descuento_servicio, 0), v_promocion_servicio
    );

    v_descuento_total := v_descuento_total + coalesce(v_descuento_servicio, 0);

    if v_promocion_servicio is not null and coalesce(v_descuento_servicio, 0) > v_mayor_descuento then
      v_mayor_descuento := coalesce(v_descuento_servicio, 0);
      v_promocion_orden := v_promocion_servicio;
    end if;
  end loop;

  update ordenes
  set subtotal = v_subtotal,
      descuento = v_descuento_total,
      total = v_subtotal - v_descuento_total,
      promocion_id = v_promocion_orden
  where id = v_orden_id;

  insert into historial_estados (orden_id, estado, usuario_id)
  values (v_orden_id, 'recibido', p_creada_por);

  return v_orden_id;
end $$;

-- Solo el backend (service_role) puede crear órdenes; no se expone al panel ni al público.
revoke execute on function public.crear_orden(uuid, uuid, uuid[], text, uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.crear_orden(uuid, uuid, uuid[], text, uuid, jsonb, jsonb)
  to service_role;
