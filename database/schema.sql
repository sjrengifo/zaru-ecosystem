-- Esquema de referencia de ZARU Ecosystem (solo lectura).
-- Se genera a partir de supabase/migrations; NO se edita a mano (ADR-02).
-- Para regenerarlo: aplicar las migraciones con database/pruebas/aplicar-migraciones.sh y
-- ejecutar: pg_dump --schema-only --no-owner --no-privileges --schema=public --schema=privado <base>



\restrict NW43L4oxMQJ4yzY7lyuHZpJ3mx3deR1fJc9vs2wkAwhcE4VPj1hLSGKE04wuM1f

-- Name: privado; Type: SCHEMA; Schema: -; Owner: -

CREATE SCHEMA privado;

-- Name: public; Type: SCHEMA; Schema: -; Owner: -

CREATE SCHEMA public;

-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -

COMMENT ON SCHEMA public IS 'standard public schema';

-- Name: estado_orden; Type: TYPE; Schema: public; Owner: -

CREATE TYPE public.estado_orden AS ENUM (
    'recibido',
    'en_lavado',
    'secado',
    'listo',
    'entregado'
);

-- Name: rol_usuario; Type: TYPE; Schema: public; Owner: -

CREATE TYPE public.rol_usuario AS ENUM (
    'admin',
    'operario',
    'superadmin'
);

-- Name: asignar_slug_establecimiento(); Type: FUNCTION; Schema: privado; Owner: -

CREATE FUNCTION privado.asignar_slug_establecimiento() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := privado.slug_disponible(new.nombre, new.id);
  end if;
  return new;
end
$$;

-- Name: estado_promocion(boolean, date, date, date); Type: FUNCTION; Schema: privado; Owner: -

CREATE FUNCTION privado.estado_promocion(p_activa boolean, p_inicio date, p_fin date, p_hoy date DEFAULT NULL::date) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select case
    when not p_activa then 'desactivada'
    when coalesce(p_hoy, privado.hoy_bogota()) < p_inicio then 'programada'
    when coalesce(p_hoy, privado.hoy_bogota()) > p_fin then 'vencida'
    else 'vigente'
  end
$$;

-- Name: hoy_bogota(); Type: FUNCTION; Schema: privado; Owner: -

CREATE FUNCTION privado.hoy_bogota() RETURNS date
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select (now() at time zone 'America/Bogota')::date
$$;

-- Name: impedir_modificacion_auditoria(); Type: FUNCTION; Schema: privado; Owner: -

CREATE FUNCTION privado.impedir_modificacion_auditoria() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  raise exception 'La auditoría no se puede modificar ni eliminar' using errcode = '42501';
end $$;

-- Name: impedir_modificacion_consentimiento(); Type: FUNCTION; Schema: privado; Owner: -

CREATE FUNCTION privado.impedir_modificacion_consentimiento() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old; -- borrado en cascada desde clientes
  end if;
  raise exception 'La evidencia de autorización no se puede modificar ni eliminar' using errcode = '42501';
end $$;

-- Name: impedir_modificacion_politica(); Type: FUNCTION; Schema: privado; Owner: -

CREATE FUNCTION privado.impedir_modificacion_politica() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  raise exception 'Una versión publicada de la política no se puede modificar ni eliminar; publique una versión nueva'
    using errcode = '42501';
end $$;

-- Name: mi_establecimiento(); Type: FUNCTION; Schema: privado; Owner: -

CREATE FUNCTION privado.mi_establecimiento() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p.establecimiento_id
  from public.perfiles p
  join public.establecimientos e on e.id = p.establecimiento_id
  where p.id = auth.uid()
    and p.activo
    and p.rol in ('admin', 'operario')
    and e.estado in ('activo', 'prueba')
    and (e.estado <> 'prueba' or e.prueba_finaliza_at > now())
$$;

-- Name: nuevo_codigo_seguimiento(); Type: FUNCTION; Schema: privado; Owner: -

CREATE FUNCTION privado.nuevo_codigo_seguimiento() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

-- Name: patron_contiene(text); Type: FUNCTION; Schema: privado; Owner: -

CREATE FUNCTION privado.patron_contiene(texto text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select '%' || replace(replace(replace(texto, '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

-- Name: politica_vigente(); Type: FUNCTION; Schema: privado; Owner: -

CREATE FUNCTION privado.politica_vigente() RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select version from public.politicas_datos where vigente_desde <= now() order by vigente_desde desc limit 1
$$;

-- Name: sin_tildes(text); Type: FUNCTION; Schema: privado; Owner: -

CREATE FUNCTION privado.sin_tildes(texto text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, texto))
$$;

-- Name: slug_base(text); Type: FUNCTION; Schema: privado; Owner: -

CREATE FUNCTION privado.slug_base(texto text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select coalesce(
    nullif(left(trim(both '-' from regexp_replace(privado.sin_tildes(coalesce(texto, '')), '[^a-z0-9]+', '-', 'g')), 50), ''),
    'sede'
  )
$$;

-- Name: slug_disponible(text, uuid); Type: FUNCTION; Schema: privado; Owner: -

CREATE FUNCTION privado.slug_disponible(texto text, p_excluir uuid DEFAULT NULL::uuid) RETURNS text
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare
  base text := trim(both '-' from privado.slug_base(texto));
  candidato text := base;
  n int := 1;
begin
  while exists (
    select 1 from public.establecimientos e
    where e.slug = candidato and (p_excluir is null or e.id <> p_excluir)
  ) loop
    n := n + 1;
    candidato := base || '-' || n;
  end loop;
  return candidato;
end
$$;

-- Name: soy_admin(); Type: FUNCTION; Schema: privado; Owner: -

CREATE FUNCTION privado.soy_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from perfiles where id = auth.uid() and rol = 'admin' and activo)
$$;

-- Name: validar_historial_estado(); Type: FUNCTION; Schema: privado; Owner: -

CREATE FUNCTION privado.validar_historial_estado() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

-- Name: validar_orden_servicio(); Type: FUNCTION; Schema: privado; Owner: -

CREATE FUNCTION privado.validar_orden_servicio() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

-- Name: validar_promocion_servicio(); Type: FUNCTION; Schema: privado; Owner: -

CREATE FUNCTION privado.validar_promocion_servicio() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

-- Name: clientes; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.clientes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establecimiento_id uuid NOT NULL,
    nombre text NOT NULL,
    telefono text NOT NULL,
    correo text,
    autorizacion_datos boolean NOT NULL,
    fecha_autorizacion timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT clientes_autorizacion_datos_check CHECK ((autorizacion_datos = true))
);

-- Name: buscar_clientes(uuid, text); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.buscar_clientes(p_establecimiento_id uuid, p_texto text) RETURNS SETOF public.clientes
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with texto as (
    -- Teléfonos y placas se guardan sin espacios ni guiones. Si no queda nada, esos filtros no aplican.
    select
      privado.patron_contiene(privado.sin_tildes(trim(p_texto))) as nombre,
      privado.patron_contiene(nullif(regexp_replace(p_texto, '[\s-]', '', 'g'), '')) as compacto
  )
  select c.*
  from clientes c, texto t
  where c.establecimiento_id = p_establecimiento_id
    and (
      privado.sin_tildes(c.nombre) like t.nombre
      or c.telefono like t.compacto
      or exists (
        select 1 from vehiculos v
        where v.cliente_id = c.id
          and v.establecimiento_id = p_establecimiento_id
          and v.placa ilike t.compacto
      )
    )
$$;

-- Name: cambiar_estado_orden(uuid, uuid, public.estado_orden, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.cambiar_estado_orden(p_establecimiento_id uuid, p_orden_id uuid, p_nuevo_estado public.estado_orden, p_usuario_id uuid, p_revertir boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

-- Name: crear_cliente_con_consentimiento(uuid, text, text, text, boolean, text, text, inet, uuid); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.crear_cliente_con_consentimiento(p_establecimiento_id uuid, p_nombre text, p_telefono text, p_correo text, p_autoriza boolean, p_politica_version text, p_canal text, p_ip inet, p_registrado_por uuid) RETURNS SETOF public.clientes
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select * from public.crear_cliente_con_consentimiento(
    p_establecimiento_id, p_nombre, p_telefono, p_correo, p_autoriza, p_politica_version, p_canal, p_ip, p_registrado_por, false, false);
$$;

-- Name: crear_cliente_con_consentimiento(uuid, text, text, text, boolean, text, text, inet, uuid, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.crear_cliente_con_consentimiento(p_establecimiento_id uuid, p_nombre text, p_telefono text, p_correo text, p_autoriza boolean, p_politica_version text, p_canal text, p_ip inet, p_registrado_por uuid, p_autoriza_notificaciones boolean, p_autoriza_comerciales boolean) RETURNS SETOF public.clientes
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_vigente text := privado.politica_vigente();
  v_cliente clientes;
begin
  if p_autoriza is distinct from true then
    raise exception 'La autorización de tratamiento de datos es obligatoria para registrar al cliente'
      using errcode = '23514', hint = 'autorizacionDatos';
  end if;
  if p_politica_version is distinct from v_vigente then
    raise exception 'La versión de la política aceptada (%) no es la vigente (%)', p_politica_version, v_vigente
      using errcode = '23514', hint = 'politica';
  end if;

  insert into clientes (establecimiento_id, nombre, telefono, correo, autorizacion_datos, fecha_autorizacion)
  values (p_establecimiento_id, p_nombre, p_telefono, p_correo, true, now())
  returning * into v_cliente;

  -- Las dos casillas de HU-30 son independientes y opcionales: se guarda lo que el titular eligió,
  -- también cuando no autoriza, para tener evidencia de la decisión (CA4).
  insert into consentimientos (establecimiento_id, cliente_id, tipo, otorgado, canal, politica_version, ip, registrado_por)
  values
    (p_establecimiento_id, v_cliente.id, 'tratamiento_datos', true, p_canal, p_politica_version, p_ip, p_registrado_por),
    (p_establecimiento_id, v_cliente.id, 'notificaciones_servicio', coalesce(p_autoriza_notificaciones, false), p_canal, p_politica_version, p_ip, p_registrado_por),
    (p_establecimiento_id, v_cliente.id, 'comerciales', coalesce(p_autoriza_comerciales, false), p_canal, p_politica_version, p_ip, p_registrado_por);

  return next v_cliente;
end $$;

-- Name: crear_orden(uuid, uuid, uuid[], text, uuid, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.crear_orden(p_establecimiento_id uuid, p_vehiculo_id uuid, p_servicio_ids uuid[], p_observaciones text, p_creada_por uuid, p_cliente jsonb DEFAULT NULL::jsonb, p_vehiculo jsonb DEFAULT NULL::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
        p_creada_por,
        coalesce((p_cliente->>'autorizaNotificaciones')::boolean, false),
        coalesce((p_cliente->>'autorizaComerciales')::boolean, false)
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
      raise exception 'Este vehículo ya tiene un servicio en curso'
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

-- Name: custom_access_token_hook(jsonb); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.custom_access_token_hook(event jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  perfil record;
  claims jsonb := coalesce(event->'claims', '{}'::jsonb);
begin
  select rol, establecimiento_id into perfil
  from perfiles where id = (event->>'user_id')::uuid and activo;

  if found then
    claims := claims || jsonb_build_object('app_rol', perfil.rol, 'establecimiento_id', perfil.establecimiento_id);
  else
    claims := claims - 'app_rol' - 'establecimiento_id';
  end if;

  return jsonb_set(event, '{claims}', claims);
end $$;

-- Name: eliminar_cliente(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.eliminar_cliente(p_establecimiento_id uuid, p_cliente_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_vehiculos uuid[];
  v_ordenes integer;
begin
  perform 1 from clientes where id = p_cliente_id and establecimiento_id = p_establecimiento_id for update;
  if not found then
    return jsonb_build_object('resultado', 'no_encontrado');
  end if;

  select coalesce(array_agg(id), '{}') into v_vehiculos
  from vehiculos where cliente_id = p_cliente_id and establecimiento_id = p_establecimiento_id;

  if exists (
    select 1 from ordenes
    where establecimiento_id = p_establecimiento_id and vehiculo_id = any (v_vehiculos) and estado <> 'entregado'
  ) then
    return jsonb_build_object('resultado', 'servicios_en_curso');
  end if;

  update ordenes set vehiculo_id = null
  where establecimiento_id = p_establecimiento_id and vehiculo_id = any (v_vehiculos);
  get diagnostics v_ordenes = row_count;

  delete from clientes where id = p_cliente_id and establecimiento_id = p_establecimiento_id;

  return jsonb_build_object('resultado', 'eliminado', 'vehiculos', cardinality(v_vehiculos), 'ordenes', v_ordenes);
end $$;

-- Name: guardar_promocion(uuid, uuid, text, text, text, numeric, date, date, boolean, uuid[]); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.guardar_promocion(p_establecimiento_id uuid, p_promocion_id uuid, p_nombre text, p_descripcion text, p_condiciones text, p_descuento_pct numeric, p_fecha_inicio date, p_fecha_fin date, p_activa boolean, p_servicio_ids uuid[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_id uuid;
begin
  if coalesce(cardinality(p_servicio_ids), 0) = 0 then
    raise exception 'Elige al menos un servicio del catálogo' using errcode = '23514', hint = 'servicioIds';
  end if;
  if exists (
    select 1 from unnest(p_servicio_ids) as elegido(id)
    where not exists (select 1 from servicios s where s.id = elegido.id and s.establecimiento_id = p_establecimiento_id)
  ) then
    raise exception 'Uno o más servicios no existen en el catálogo del establecimiento' using errcode = '23514', hint = 'servicioIds';
  end if;
  if p_fecha_fin < p_fecha_inicio then
    raise exception 'La fecha de fin no puede ser anterior a la de inicio' using errcode = '23514', hint = 'fechaFin';
  end if;

  if p_promocion_id is null then
    insert into promociones (establecimiento_id, nombre, descripcion, condiciones, descuento_pct, fecha_inicio, fecha_fin, activa)
    values (p_establecimiento_id, p_nombre, p_descripcion, p_condiciones, p_descuento_pct, p_fecha_inicio, p_fecha_fin, coalesce(p_activa, true))
    returning id into v_id;
  else
    update promociones set
      nombre = p_nombre, descripcion = p_descripcion, condiciones = p_condiciones, descuento_pct = p_descuento_pct,
      fecha_inicio = p_fecha_inicio, fecha_fin = p_fecha_fin, activa = coalesce(p_activa, activa)
    where id = p_promocion_id and establecimiento_id = p_establecimiento_id
    returning id into v_id;
    if v_id is null then
      return null;
    end if;
    delete from promocion_servicios where promocion_id = v_id and servicio_id <> all (p_servicio_ids);
  end if;

  insert into promocion_servicios (promocion_id, servicio_id)
  select distinct v_id, unnest(p_servicio_ids)
  on conflict do nothing;

  return v_id;
end $$;

-- Name: mejor_promocion(uuid, uuid, date, numeric); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.mejor_promocion(p_establecimiento_id uuid, p_servicio_id uuid, p_fecha date DEFAULT NULL::date, p_precio numeric DEFAULT NULL::numeric) RETURNS TABLE(promocion_id uuid, nombre text, descuento_pct numeric, descuento numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p.id, p.nombre, p.descuento_pct, round(p_precio * p.descuento_pct / 100, 0)
  from promociones p
  join promocion_servicios ps on ps.promocion_id = p.id
  where p.establecimiento_id = p_establecimiento_id
    and ps.servicio_id = p_servicio_id
    and privado.estado_promocion(p.activa, p.fecha_inicio, p.fecha_fin, coalesce(p_fecha, privado.hoy_bogota())) = 'vigente'
  order by p.descuento_pct desc, p.created_at asc, p.id asc
  limit 1
$$;

-- Name: auditoria; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.auditoria (
    id bigint NOT NULL,
    establecimiento_id uuid,
    usuario_id uuid,
    actor_tipo text DEFAULT 'usuario'::text NOT NULL,
    rol text,
    accion text NOT NULL,
    recurso text,
    recurso_id text,
    resultado text NOT NULL,
    motivo text,
    detalle jsonb DEFAULT '{}'::jsonb NOT NULL,
    ip inet,
    request_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auditoria_actor_tipo_check CHECK ((actor_tipo = ANY (ARRAY['usuario'::text, 'cliente'::text, 'sistema'::text]))),
    CONSTRAINT auditoria_resultado_check CHECK ((resultado = ANY (ARRAY['permitido'::text, 'denegado'::text])))
);

-- Name: auditoria_id_seq; Type: SEQUENCE; Schema: public; Owner: -

ALTER TABLE public.auditoria ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.auditoria_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- Name: consentimientos; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.consentimientos (
    id bigint NOT NULL,
    establecimiento_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    tipo text DEFAULT 'tratamiento_datos'::text NOT NULL,
    otorgado boolean NOT NULL,
    canal text NOT NULL,
    politica_version text,
    ip inet,
    registrado_por uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT consentimientos_canal_check CHECK ((canal = ANY (ARRAY['panel'::text, 'app'::text, 'enlace_baja'::text, 'migracion'::text]))),
    CONSTRAINT consentimientos_check CHECK (((politica_version IS NOT NULL) OR (canal = 'migracion'::text))),
    CONSTRAINT consentimientos_tipo_check CHECK ((tipo = ANY (ARRAY['tratamiento_datos'::text, 'notificaciones_servicio'::text, 'comerciales'::text])))
);

-- Name: autorizaciones_vigentes; Type: VIEW; Schema: public; Owner: -

CREATE VIEW public.autorizaciones_vigentes WITH (security_invoker='true') AS
 SELECT DISTINCT ON (cliente_id, tipo) establecimiento_id,
    cliente_id,
    tipo,
    otorgado,
    canal,
    politica_version,
    created_at
   FROM public.consentimientos k
  ORDER BY cliente_id, tipo, created_at DESC, id DESC;

-- Name: VIEW autorizaciones_vigentes; Type: COMMENT; Schema: public; Owner: -

COMMENT ON VIEW public.autorizaciones_vigentes IS 'HU-30: autorización vigente (la más reciente) de cada cliente por tipo. Las campañas comerciales solo van a quienes tienen comerciales = otorgado (CA2).';

-- Name: consentimientos_id_seq; Type: SEQUENCE; Schema: public; Owner: -

ALTER TABLE public.consentimientos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.consentimientos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- Name: establecimientos; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.establecimientos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    logo_url text,
    color_primario text DEFAULT '#2563EB'::text,
    color_secundario text DEFAULT '#0EA5E9'::text,
    created_at timestamp with time zone DEFAULT now(),
    plan text DEFAULT 'intermedio'::text NOT NULL,
    estado text DEFAULT 'activo'::text NOT NULL,
    prueba_inicia_at timestamp with time zone,
    prueba_finaliza_at timestamp with time zone,
    activado_at timestamp with time zone,
    slug text NOT NULL,
    CONSTRAINT establecimientos_color_primario_hex CHECK ((color_primario ~ '^#[0-9A-Fa-f]{6}$'::text)),
    CONSTRAINT establecimientos_color_secundario_hex CHECK ((color_secundario ~ '^#[0-9A-Fa-f]{6}$'::text)),
    CONSTRAINT establecimientos_estado_check CHECK ((estado = ANY (ARRAY['prueba'::text, 'activo'::text, 'pendiente_activacion'::text, 'suspendido'::text]))),
    CONSTRAINT establecimientos_plan_check CHECK ((plan = ANY (ARRAY['basico'::text, 'intermedio'::text, 'empresarial'::text]))),
    CONSTRAINT establecimientos_prueba_duracion_check CHECK (((estado <> 'prueba'::text) OR ((prueba_inicia_at IS NOT NULL) AND (prueba_finaliza_at >= (prueba_inicia_at + '14 days'::interval)) AND (prueba_finaliza_at <= (prueba_inicia_at + '30 days'::interval))))),
    CONSTRAINT establecimientos_slug_formato CHECK (((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text) AND (length(slug) <= 60)))
);

-- Name: COLUMN establecimientos.slug; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.establecimientos.slug IS 'HU-17: identificador público de la sede en el enlace del cliente final (/s/{slug}). Único y en minúsculas.';

-- Name: eventos; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.eventos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establecimiento_id uuid NOT NULL,
    tipo text NOT NULL,
    orden_id uuid NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    procesado_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT eventos_tipo_check CHECK ((tipo = ANY (ARRAY['orden.creada'::text, 'orden.estado_cambiado'::text, 'orden.estado_revertido'::text, 'orden.entregada'::text])))
);

-- Name: historial_estados; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.historial_estados (
    id bigint NOT NULL,
    orden_id uuid NOT NULL,
    estado public.estado_orden NOT NULL,
    usuario_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    estado_anterior public.estado_orden,
    revertido boolean DEFAULT false NOT NULL
);

-- Name: historial_estados_id_seq; Type: SEQUENCE; Schema: public; Owner: -

ALTER TABLE public.historial_estados ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.historial_estados_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- Name: notificacion_intentos; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.notificacion_intentos (
    id bigint NOT NULL,
    notificacion_id uuid NOT NULL,
    establecimiento_id uuid NOT NULL,
    intento smallint NOT NULL,
    canal text NOT NULL,
    resultado text NOT NULL,
    proveedor text,
    id_proveedor text,
    entregado boolean DEFAULT false NOT NULL,
    recuperable boolean,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notificacion_intentos_canal_check CHECK ((canal = ANY (ARRAY['push'::text, 'sms'::text, 'correo'::text]))),
    CONSTRAINT notificacion_intentos_intento_check CHECK ((intento >= 1)),
    CONSTRAINT notificacion_intentos_resultado_check CHECK ((resultado = ANY (ARRAY['enviado'::text, 'fallido'::text])))
);

-- Name: notificacion_intentos_id_seq; Type: SEQUENCE; Schema: public; Owner: -

ALTER TABLE public.notificacion_intentos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.notificacion_intentos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

-- Name: notificaciones; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.notificaciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establecimiento_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    orden_id uuid,
    tipo text NOT NULL,
    evento text NOT NULL,
    canal text NOT NULL,
    destino text NOT NULL,
    contenido jsonb DEFAULT '{}'::jsonb NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    intentos smallint DEFAULT 0 NOT NULL,
    programada_para timestamp with time zone DEFAULT now() NOT NULL,
    proximo_intento_at timestamp with time zone,
    error text,
    clave_dedupe text,
    notificacion_origen_id uuid,
    leida_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    fallo_definitivo_at timestamp with time zone,
    alerta_atendida_at timestamp with time zone,
    alerta_atendida_por uuid,
    CONSTRAINT notificaciones_alerta_coherente CHECK (((alerta_atendida_at IS NULL) OR (fallo_definitivo_at IS NOT NULL))),
    CONSTRAINT notificaciones_canal_check CHECK ((canal = ANY (ARRAY['push'::text, 'sms'::text, 'correo'::text]))),
    CONSTRAINT notificaciones_estado_check CHECK ((estado = ANY (ARRAY['programada'::text, 'pendiente'::text, 'enviando'::text, 'enviada'::text, 'entregada'::text, 'fallida'::text, 'cancelada'::text]))),
    CONSTRAINT notificaciones_intentos_check CHECK ((intentos >= 0)),
    CONSTRAINT notificaciones_tipo_check CHECK ((tipo = ANY (ARRAY['operativa'::text, 'comercial'::text, 'recordatorio'::text, 'novedad'::text, 'correccion'::text, 'sistema'::text])))
);

-- Name: COLUMN notificaciones.fallo_definitivo_at; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.notificaciones.fallo_definitivo_at IS 'HU-33 CA3: el aviso falló en todos los canales disponibles; aparece como alerta en el dashboard.';

-- Name: COLUMN notificaciones.alerta_atendida_at; Type: COMMENT; Schema: public; Owner: -

COMMENT ON COLUMN public.notificaciones.alerta_atendida_at IS 'HU-33 CA3: el administrador contactó al cliente (o el proveedor confirmó la entrega después).';

-- Name: orden_servicios; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.orden_servicios (
    orden_id uuid NOT NULL,
    servicio_id uuid NOT NULL,
    precio numeric(12,2) NOT NULL,
    duracion_min integer NOT NULL,
    descuento numeric(12,2) DEFAULT 0 NOT NULL,
    promocion_id uuid,
    CONSTRAINT orden_servicios_descuento_check CHECK ((descuento >= (0)::numeric))
);

-- Name: ordenes; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.ordenes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establecimiento_id uuid NOT NULL,
    vehiculo_id uuid,
    estado public.estado_orden DEFAULT 'recibido'::public.estado_orden NOT NULL,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    descuento numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    creada_por uuid,
    estado_desde timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    entregada_at timestamp with time zone,
    codigo_seguimiento text NOT NULL,
    entrega_estimada_at timestamp with time zone,
    observaciones text,
    promocion_id uuid,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT ordenes_observaciones_check CHECK (((observaciones IS NULL) OR (char_length(observaciones) <= 500))),
    CONSTRAINT ordenes_version_check CHECK ((version > 0))
);

-- Name: perfiles; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.perfiles (
    id uuid NOT NULL,
    establecimiento_id uuid,
    nombre text NOT NULL,
    rol public.rol_usuario DEFAULT 'operario'::public.rol_usuario NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT perfiles_rol_valido CHECK ((rol = ANY (ARRAY['admin'::public.rol_usuario, 'operario'::public.rol_usuario, 'superadmin'::public.rol_usuario]))),
    CONSTRAINT perfiles_tenant_por_rol CHECK ((((rol = 'superadmin'::public.rol_usuario) AND (establecimiento_id IS NULL)) OR ((rol = ANY (ARRAY['admin'::public.rol_usuario, 'operario'::public.rol_usuario])) AND (establecimiento_id IS NOT NULL))))
);

-- Name: politicas_datos; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.politicas_datos (
    version text NOT NULL,
    titulo text NOT NULL,
    contenido text NOT NULL,
    vigente_desde timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT politicas_datos_version_check CHECK ((version ~ '^\d+\.\d+$'::text))
);

-- Name: promocion_servicios; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.promocion_servicios (
    promocion_id uuid NOT NULL,
    servicio_id uuid NOT NULL
);

-- Name: promociones; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.promociones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establecimiento_id uuid NOT NULL,
    nombre text NOT NULL,
    descuento_pct numeric(5,2) NOT NULL,
    fecha_inicio date NOT NULL,
    fecha_fin date NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    descripcion text,
    condiciones text,
    activa boolean DEFAULT true NOT NULL,
    CONSTRAINT promociones_check CHECK ((fecha_fin >= fecha_inicio)),
    CONSTRAINT promociones_descuento_pct_check CHECK (((descuento_pct > (0)::numeric) AND (descuento_pct <= (100)::numeric)))
);

-- Name: servicios; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.servicios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establecimiento_id uuid NOT NULL,
    nombre text NOT NULL,
    precio numeric(12,2) NOT NULL,
    duracion_min integer NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT servicios_duracion_min_check CHECK ((duracion_min > 0)),
    CONSTRAINT servicios_precio_check CHECK ((precio >= (0)::numeric))
);

-- Name: promociones_con_estado; Type: VIEW; Schema: public; Owner: -

CREATE VIEW public.promociones_con_estado WITH (security_invoker='true') AS
 SELECT id,
    establecimiento_id,
    nombre,
    descripcion,
    condiciones,
    descuento_pct,
    fecha_inicio,
    fecha_fin,
    activa,
    created_at,
    privado.estado_promocion(activa, fecha_inicio, fecha_fin) AS estado,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.nombre) ORDER BY s.nombre) AS jsonb_agg
           FROM (public.promocion_servicios ps
             JOIN public.servicios s ON ((s.id = ps.servicio_id)))
          WHERE (ps.promocion_id = p.id)), '[]'::jsonb) AS servicios
   FROM public.promociones p;

-- Name: promociones_vigentes; Type: VIEW; Schema: public; Owner: -

CREATE VIEW public.promociones_vigentes WITH (security_invoker='true') AS
 SELECT id,
    establecimiento_id,
    nombre,
    descripcion,
    condiciones,
    descuento_pct,
    fecha_inicio,
    fecha_fin,
    activa,
    created_at,
    estado,
    servicios
   FROM public.promociones_con_estado
  WHERE (estado = 'vigente'::text);

-- Name: vehiculos; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.vehiculos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establecimiento_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    placa text NOT NULL,
    tipo text NOT NULL,
    marca text,
    color text,
    created_at timestamp with time zone DEFAULT now()
);

-- Name: auditoria auditoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.auditoria
    ADD CONSTRAINT auditoria_pkey PRIMARY KEY (id);

-- Name: clientes clientes_establecimiento_id_telefono_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_establecimiento_id_telefono_key UNIQUE (establecimiento_id, telefono);

-- Name: clientes clientes_id_establecimiento_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_id_establecimiento_key UNIQUE (id, establecimiento_id);

-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);

-- Name: consentimientos consentimientos_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.consentimientos
    ADD CONSTRAINT consentimientos_pkey PRIMARY KEY (id);

-- Name: establecimientos establecimientos_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.establecimientos
    ADD CONSTRAINT establecimientos_pkey PRIMARY KEY (id);

-- Name: eventos eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_pkey PRIMARY KEY (id);

-- Name: historial_estados historial_estados_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.historial_estados
    ADD CONSTRAINT historial_estados_pkey PRIMARY KEY (id);

-- Name: notificacion_intentos notificacion_intentos_notificacion_id_canal_intento_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notificacion_intentos
    ADD CONSTRAINT notificacion_intentos_notificacion_id_canal_intento_key UNIQUE (notificacion_id, canal, intento);

-- Name: notificacion_intentos notificacion_intentos_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notificacion_intentos
    ADD CONSTRAINT notificacion_intentos_pkey PRIMARY KEY (id);

-- Name: notificaciones notificaciones_clave_dedupe_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_clave_dedupe_key UNIQUE (clave_dedupe);

-- Name: notificaciones notificaciones_id_establecimiento_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_id_establecimiento_key UNIQUE (id, establecimiento_id);

-- Name: notificaciones notificaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_pkey PRIMARY KEY (id);

-- Name: orden_servicios orden_servicios_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.orden_servicios
    ADD CONSTRAINT orden_servicios_pkey PRIMARY KEY (orden_id, servicio_id);

-- Name: ordenes ordenes_id_establecimiento_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ordenes
    ADD CONSTRAINT ordenes_id_establecimiento_key UNIQUE (id, establecimiento_id);

-- Name: ordenes ordenes_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ordenes
    ADD CONSTRAINT ordenes_pkey PRIMARY KEY (id);

-- Name: perfiles perfiles_id_establecimiento_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.perfiles
    ADD CONSTRAINT perfiles_id_establecimiento_key UNIQUE (id, establecimiento_id);

-- Name: perfiles perfiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.perfiles
    ADD CONSTRAINT perfiles_pkey PRIMARY KEY (id);

-- Name: politicas_datos politicas_datos_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.politicas_datos
    ADD CONSTRAINT politicas_datos_pkey PRIMARY KEY (version);

-- Name: promocion_servicios promocion_servicios_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.promocion_servicios
    ADD CONSTRAINT promocion_servicios_pkey PRIMARY KEY (promocion_id, servicio_id);

-- Name: promociones promociones_id_establecimiento_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.promociones
    ADD CONSTRAINT promociones_id_establecimiento_key UNIQUE (id, establecimiento_id);

-- Name: promociones promociones_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.promociones
    ADD CONSTRAINT promociones_pkey PRIMARY KEY (id);

-- Name: servicios servicios_id_establecimiento_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.servicios
    ADD CONSTRAINT servicios_id_establecimiento_key UNIQUE (id, establecimiento_id);

-- Name: servicios servicios_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.servicios
    ADD CONSTRAINT servicios_pkey PRIMARY KEY (id);

-- Name: vehiculos vehiculos_establecimiento_id_placa_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.vehiculos
    ADD CONSTRAINT vehiculos_establecimiento_id_placa_key UNIQUE (establecimiento_id, placa);

-- Name: vehiculos vehiculos_id_establecimiento_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.vehiculos
    ADD CONSTRAINT vehiculos_id_establecimiento_key UNIQUE (id, establecimiento_id);

-- Name: vehiculos vehiculos_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.vehiculos
    ADD CONSTRAINT vehiculos_pkey PRIMARY KEY (id);

-- Name: auditoria_establecimiento_fecha_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX auditoria_establecimiento_fecha_idx ON public.auditoria USING btree (establecimiento_id, created_at DESC);

-- Name: auditoria_usuario_fecha_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX auditoria_usuario_fecha_idx ON public.auditoria USING btree (usuario_id, created_at DESC);

-- Name: clientes_establecimiento_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX clientes_establecimiento_id_idx ON public.clientes USING btree (establecimiento_id);

-- Name: clientes_establecimiento_telefono_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX clientes_establecimiento_telefono_idx ON public.clientes USING btree (establecimiento_id, telefono);

-- Name: consentimientos_cliente_tipo_fecha_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX consentimientos_cliente_tipo_fecha_idx ON public.consentimientos USING btree (cliente_id, tipo, created_at DESC);

-- Name: consentimientos_establecimiento_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX consentimientos_establecimiento_idx ON public.consentimientos USING btree (establecimiento_id, cliente_id);

-- Name: consentimientos_politica_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX consentimientos_politica_idx ON public.consentimientos USING btree (politica_version);

-- Name: establecimientos_estado_prueba_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX establecimientos_estado_prueba_idx ON public.establecimientos USING btree (estado, prueba_finaliza_at);

-- Name: establecimientos_slug_key; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX establecimientos_slug_key ON public.establecimientos USING btree (slug);

-- Name: eventos_establecimiento_fecha_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX eventos_establecimiento_fecha_idx ON public.eventos USING btree (establecimiento_id, created_at DESC);

-- Name: eventos_pendientes_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX eventos_pendientes_idx ON public.eventos USING btree (created_at) WHERE (procesado_at IS NULL);

-- Name: historial_estados_orden_fecha_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX historial_estados_orden_fecha_idx ON public.historial_estados USING btree (orden_id, created_at);

-- Name: historial_estados_ultimo_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX historial_estados_ultimo_idx ON public.historial_estados USING btree (orden_id, created_at DESC, id DESC);

-- Name: historial_estados_usuario_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX historial_estados_usuario_id_idx ON public.historial_estados USING btree (usuario_id);

-- Name: notificacion_intentos_establecimiento_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX notificacion_intentos_establecimiento_idx ON public.notificacion_intentos USING btree (establecimiento_id, created_at DESC);

-- Name: notificacion_intentos_notificacion_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX notificacion_intentos_notificacion_idx ON public.notificacion_intentos USING btree (notificacion_id, created_at);

-- Name: notificaciones_alertas_abiertas_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX notificaciones_alertas_abiertas_idx ON public.notificaciones USING btree (establecimiento_id, fallo_definitivo_at DESC) WHERE ((fallo_definitivo_at IS NOT NULL) AND (alerta_atendida_at IS NULL));

-- Name: notificaciones_bitacora_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX notificaciones_bitacora_idx ON public.notificaciones USING btree (establecimiento_id, estado, canal, created_at DESC);

-- Name: notificaciones_cliente_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX notificaciones_cliente_idx ON public.notificaciones USING btree (cliente_id, establecimiento_id);

-- Name: notificaciones_cola_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX notificaciones_cola_idx ON public.notificaciones USING btree (proximo_intento_at NULLS FIRST, programada_para) WHERE (estado = ANY (ARRAY['pendiente'::text, 'programada'::text]));

-- Name: notificaciones_establecimiento_fecha_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX notificaciones_establecimiento_fecha_idx ON public.notificaciones USING btree (establecimiento_id, created_at DESC);

-- Name: notificaciones_orden_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX notificaciones_orden_idx ON public.notificaciones USING btree (orden_id, establecimiento_id);

-- Name: notificaciones_origen_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX notificaciones_origen_idx ON public.notificaciones USING btree (notificacion_origen_id);

-- Name: orden_servicios_servicio_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX orden_servicios_servicio_id_idx ON public.orden_servicios USING btree (servicio_id);

-- Name: ordenes_activas_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ordenes_activas_idx ON public.ordenes USING btree (establecimiento_id, estado, estado_desde) WHERE (estado <> 'entregado'::public.estado_orden);

-- Name: ordenes_cliente_entrega_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ordenes_cliente_entrega_idx ON public.ordenes USING btree (vehiculo_id, entregada_at DESC) WHERE (estado = 'entregado'::public.estado_orden);

-- Name: ordenes_codigo_seguimiento_idx; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX ordenes_codigo_seguimiento_idx ON public.ordenes USING btree (codigo_seguimiento);

-- Name: ordenes_creada_por_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ordenes_creada_por_idx ON public.ordenes USING btree (creada_por);

-- Name: ordenes_establecimiento_fecha_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ordenes_establecimiento_fecha_idx ON public.ordenes USING btree (establecimiento_id, created_at DESC);

-- Name: ordenes_establecimiento_id_estado_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ordenes_establecimiento_id_estado_idx ON public.ordenes USING btree (establecimiento_id, estado);

-- Name: ordenes_una_activa_por_vehiculo_idx; Type: INDEX; Schema: public; Owner: -

CREATE UNIQUE INDEX ordenes_una_activa_por_vehiculo_idx ON public.ordenes USING btree (vehiculo_id) WHERE (estado <> 'entregado'::public.estado_orden);

-- Name: ordenes_vehiculo_fecha_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ordenes_vehiculo_fecha_idx ON public.ordenes USING btree (vehiculo_id, created_at DESC);

-- Name: perfiles_establecimiento_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX perfiles_establecimiento_id_idx ON public.perfiles USING btree (establecimiento_id);

-- Name: promocion_servicios_servicio_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX promocion_servicios_servicio_id_idx ON public.promocion_servicios USING btree (servicio_id);

-- Name: promociones_establecimiento_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX promociones_establecimiento_id_idx ON public.promociones USING btree (establecimiento_id);

-- Name: servicios_establecimiento_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX servicios_establecimiento_id_idx ON public.servicios USING btree (establecimiento_id);

-- Name: vehiculos_cliente_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX vehiculos_cliente_id_idx ON public.vehiculos USING btree (cliente_id);

-- Name: vehiculos_cliente_placa_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX vehiculos_cliente_placa_idx ON public.vehiculos USING btree (cliente_id, placa);

-- Name: vehiculos_establecimiento_id_cliente_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX vehiculos_establecimiento_id_cliente_id_idx ON public.vehiculos USING btree (establecimiento_id, cliente_id);

-- Name: vehiculos_placa_trgm_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX vehiculos_placa_trgm_idx ON public.vehiculos USING gin (placa extensions.gin_trgm_ops);

-- Name: auditoria auditoria_inmutable; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER auditoria_inmutable BEFORE DELETE OR UPDATE ON public.auditoria FOR EACH ROW EXECUTE FUNCTION privado.impedir_modificacion_auditoria();

-- Name: auditoria auditoria_sin_truncate; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER auditoria_sin_truncate BEFORE TRUNCATE ON public.auditoria FOR EACH STATEMENT EXECUTE FUNCTION privado.impedir_modificacion_auditoria();

-- Name: consentimientos consentimientos_inmutables; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER consentimientos_inmutables BEFORE DELETE OR UPDATE ON public.consentimientos FOR EACH ROW EXECUTE FUNCTION privado.impedir_modificacion_consentimiento();

-- Name: establecimientos establecimientos_asignar_slug; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER establecimientos_asignar_slug BEFORE INSERT ON public.establecimientos FOR EACH ROW EXECUTE FUNCTION privado.asignar_slug_establecimiento();

-- Name: historial_estados historial_estados_mismo_establecimiento; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER historial_estados_mismo_establecimiento BEFORE INSERT OR UPDATE ON public.historial_estados FOR EACH ROW EXECUTE FUNCTION privado.validar_historial_estado();

-- Name: orden_servicios orden_servicios_mismo_establecimiento; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER orden_servicios_mismo_establecimiento BEFORE INSERT OR UPDATE ON public.orden_servicios FOR EACH ROW EXECUTE FUNCTION privado.validar_orden_servicio();

-- Name: politicas_datos politicas_datos_inmutables; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER politicas_datos_inmutables BEFORE DELETE OR UPDATE ON public.politicas_datos FOR EACH ROW EXECUTE FUNCTION privado.impedir_modificacion_politica();

-- Name: promocion_servicios promocion_servicios_mismo_establecimiento; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER promocion_servicios_mismo_establecimiento BEFORE INSERT OR UPDATE ON public.promocion_servicios FOR EACH ROW EXECUTE FUNCTION privado.validar_promocion_servicio();

-- Name: clientes clientes_establecimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.clientes
    ADD CONSTRAINT clientes_establecimiento_id_fkey FOREIGN KEY (establecimiento_id) REFERENCES public.establecimientos(id) ON DELETE CASCADE;

-- Name: consentimientos consentimientos_cliente_id_establecimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.consentimientos
    ADD CONSTRAINT consentimientos_cliente_id_establecimiento_id_fkey FOREIGN KEY (cliente_id, establecimiento_id) REFERENCES public.clientes(id, establecimiento_id) ON DELETE CASCADE;

-- Name: consentimientos consentimientos_politica_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.consentimientos
    ADD CONSTRAINT consentimientos_politica_version_fkey FOREIGN KEY (politica_version) REFERENCES public.politicas_datos(version);

-- Name: eventos eventos_establecimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_establecimiento_id_fkey FOREIGN KEY (establecimiento_id) REFERENCES public.establecimientos(id) ON DELETE CASCADE;

-- Name: eventos eventos_orden_id_establecimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.eventos
    ADD CONSTRAINT eventos_orden_id_establecimiento_id_fkey FOREIGN KEY (orden_id, establecimiento_id) REFERENCES public.ordenes(id, establecimiento_id) ON DELETE CASCADE;

-- Name: historial_estados historial_estados_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.historial_estados
    ADD CONSTRAINT historial_estados_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES public.ordenes(id) ON DELETE CASCADE;

-- Name: historial_estados historial_estados_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.historial_estados
    ADD CONSTRAINT historial_estados_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.perfiles(id);

-- Name: notificacion_intentos notificacion_intentos_establecimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notificacion_intentos
    ADD CONSTRAINT notificacion_intentos_establecimiento_id_fkey FOREIGN KEY (establecimiento_id) REFERENCES public.establecimientos(id) ON DELETE CASCADE;

-- Name: notificacion_intentos notificacion_intentos_notificacion_id_establecimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notificacion_intentos
    ADD CONSTRAINT notificacion_intentos_notificacion_id_establecimiento_id_fkey FOREIGN KEY (notificacion_id, establecimiento_id) REFERENCES public.notificaciones(id, establecimiento_id) ON DELETE CASCADE;

-- Name: notificaciones notificaciones_alerta_atendida_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_alerta_atendida_por_fkey FOREIGN KEY (alerta_atendida_por) REFERENCES public.perfiles(id) ON DELETE SET NULL;

-- Name: notificaciones notificaciones_cliente_id_establecimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_cliente_id_establecimiento_id_fkey FOREIGN KEY (cliente_id, establecimiento_id) REFERENCES public.clientes(id, establecimiento_id) ON DELETE CASCADE;

-- Name: notificaciones notificaciones_establecimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_establecimiento_id_fkey FOREIGN KEY (establecimiento_id) REFERENCES public.establecimientos(id) ON DELETE CASCADE;

-- Name: notificaciones notificaciones_notificacion_origen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_notificacion_origen_id_fkey FOREIGN KEY (notificacion_origen_id) REFERENCES public.notificaciones(id);

-- Name: notificaciones notificaciones_orden_id_establecimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_orden_id_establecimiento_id_fkey FOREIGN KEY (orden_id, establecimiento_id) REFERENCES public.ordenes(id, establecimiento_id) ON DELETE CASCADE;

-- Name: orden_servicios orden_servicios_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.orden_servicios
    ADD CONSTRAINT orden_servicios_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES public.ordenes(id) ON DELETE CASCADE;

-- Name: orden_servicios orden_servicios_promocion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.orden_servicios
    ADD CONSTRAINT orden_servicios_promocion_id_fkey FOREIGN KEY (promocion_id) REFERENCES public.promociones(id) ON DELETE SET NULL;

-- Name: orden_servicios orden_servicios_servicio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.orden_servicios
    ADD CONSTRAINT orden_servicios_servicio_id_fkey FOREIGN KEY (servicio_id) REFERENCES public.servicios(id);

-- Name: ordenes ordenes_creador_mismo_establecimiento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ordenes
    ADD CONSTRAINT ordenes_creador_mismo_establecimiento_fkey FOREIGN KEY (creada_por, establecimiento_id) REFERENCES public.perfiles(id, establecimiento_id);

-- Name: ordenes ordenes_establecimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ordenes
    ADD CONSTRAINT ordenes_establecimiento_id_fkey FOREIGN KEY (establecimiento_id) REFERENCES public.establecimientos(id) ON DELETE CASCADE;

-- Name: ordenes ordenes_promocion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ordenes
    ADD CONSTRAINT ordenes_promocion_id_fkey FOREIGN KEY (promocion_id) REFERENCES public.promociones(id) ON DELETE SET NULL;

-- Name: ordenes ordenes_vehiculo_mismo_establecimiento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ordenes
    ADD CONSTRAINT ordenes_vehiculo_mismo_establecimiento_fkey FOREIGN KEY (vehiculo_id, establecimiento_id) REFERENCES public.vehiculos(id, establecimiento_id);

-- Name: perfiles perfiles_establecimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.perfiles
    ADD CONSTRAINT perfiles_establecimiento_id_fkey FOREIGN KEY (establecimiento_id) REFERENCES public.establecimientos(id) ON DELETE CASCADE;

-- Name: perfiles perfiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.perfiles
    ADD CONSTRAINT perfiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Name: promocion_servicios promocion_servicios_promocion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.promocion_servicios
    ADD CONSTRAINT promocion_servicios_promocion_id_fkey FOREIGN KEY (promocion_id) REFERENCES public.promociones(id) ON DELETE CASCADE;

-- Name: promocion_servicios promocion_servicios_servicio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.promocion_servicios
    ADD CONSTRAINT promocion_servicios_servicio_id_fkey FOREIGN KEY (servicio_id) REFERENCES public.servicios(id) ON DELETE CASCADE;

-- Name: promociones promociones_establecimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.promociones
    ADD CONSTRAINT promociones_establecimiento_id_fkey FOREIGN KEY (establecimiento_id) REFERENCES public.establecimientos(id) ON DELETE CASCADE;

-- Name: servicios servicios_establecimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.servicios
    ADD CONSTRAINT servicios_establecimiento_id_fkey FOREIGN KEY (establecimiento_id) REFERENCES public.establecimientos(id) ON DELETE CASCADE;

-- Name: vehiculos vehiculos_cliente_mismo_establecimiento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.vehiculos
    ADD CONSTRAINT vehiculos_cliente_mismo_establecimiento_fkey FOREIGN KEY (cliente_id, establecimiento_id) REFERENCES public.clientes(id, establecimiento_id) ON DELETE CASCADE;

-- Name: vehiculos vehiculos_establecimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.vehiculos
    ADD CONSTRAINT vehiculos_establecimiento_id_fkey FOREIGN KEY (establecimiento_id) REFERENCES public.establecimientos(id) ON DELETE CASCADE;

-- Name: auditoria admin ve auditoria de su establecimiento; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "admin ve auditoria de su establecimiento" ON public.auditoria FOR SELECT USING (((establecimiento_id = privado.mi_establecimiento()) AND privado.soy_admin()));

-- Name: auditoria; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.auditoria ENABLE ROW LEVEL SECURITY;

-- Name: clientes; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

-- Name: consentimientos; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.consentimientos ENABLE ROW LEVEL SECURITY;

-- Name: establecimientos; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.establecimientos ENABLE ROW LEVEL SECURITY;

-- Name: eventos; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;

-- Name: historial_estados; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.historial_estados ENABLE ROW LEVEL SECURITY;

-- Name: notificacion_intentos; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.notificacion_intentos ENABLE ROW LEVEL SECURITY;

-- Name: notificaciones; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

-- Name: orden_servicios; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.orden_servicios ENABLE ROW LEVEL SECURITY;

-- Name: ordenes; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.ordenes ENABLE ROW LEVEL SECURITY;

-- Name: perfiles; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

-- Name: politicas_datos politicas visibles para todos; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "politicas visibles para todos" ON public.politicas_datos FOR SELECT USING (true);

-- Name: politicas_datos; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.politicas_datos ENABLE ROW LEVEL SECURITY;

-- Name: promocion_servicios; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.promocion_servicios ENABLE ROW LEVEL SECURITY;

-- Name: promociones; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.promociones ENABLE ROW LEVEL SECURITY;

-- Name: servicios; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;

-- Name: vehiculos; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.vehiculos ENABLE ROW LEVEL SECURITY;

-- Name: clientes ver clientes; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "ver clientes" ON public.clientes FOR SELECT USING ((establecimiento_id = privado.mi_establecimiento()));

-- Name: consentimientos ver consentimientos; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "ver consentimientos" ON public.consentimientos FOR SELECT USING ((establecimiento_id = privado.mi_establecimiento()));

-- Name: historial_estados ver historial; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "ver historial" ON public.historial_estados FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.ordenes o
  WHERE ((o.id = historial_estados.orden_id) AND (o.establecimiento_id = privado.mi_establecimiento())))));

-- Name: notificacion_intentos ver intentos de notificacion; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "ver intentos de notificacion" ON public.notificacion_intentos FOR SELECT USING ((establecimiento_id = privado.mi_establecimiento()));

-- Name: establecimientos ver mi establecimiento; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "ver mi establecimiento" ON public.establecimientos FOR SELECT USING ((id = privado.mi_establecimiento()));

-- Name: notificaciones ver notificaciones; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "ver notificaciones" ON public.notificaciones FOR SELECT USING ((establecimiento_id = privado.mi_establecimiento()));

-- Name: orden_servicios ver orden-servicios; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "ver orden-servicios" ON public.orden_servicios FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.ordenes o
  WHERE ((o.id = orden_servicios.orden_id) AND (o.establecimiento_id = privado.mi_establecimiento())))));

-- Name: ordenes ver ordenes; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "ver ordenes" ON public.ordenes FOR SELECT USING ((establecimiento_id = privado.mi_establecimiento()));

-- Name: perfiles ver perfiles; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "ver perfiles" ON public.perfiles FOR SELECT USING ((establecimiento_id = privado.mi_establecimiento()));

-- Name: promocion_servicios ver promo-servicios; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "ver promo-servicios" ON public.promocion_servicios FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.promociones p
  WHERE ((p.id = promocion_servicios.promocion_id) AND (p.establecimiento_id = privado.mi_establecimiento())))));

-- Name: promociones ver promociones; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "ver promociones" ON public.promociones FOR SELECT USING ((establecimiento_id = privado.mi_establecimiento()));

-- Name: servicios ver servicios; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "ver servicios" ON public.servicios FOR SELECT USING ((establecimiento_id = privado.mi_establecimiento()));

-- Name: vehiculos ver vehiculos; Type: POLICY; Schema: public; Owner: -

CREATE POLICY "ver vehiculos" ON public.vehiculos FOR SELECT USING ((establecimiento_id = privado.mi_establecimiento()));

\unrestrict NW43L4oxMQJ4yzY7lyuHZpJ3mx3deR1fJc9vs2wkAwhcE4VPj1hLSGKE04wuM1f
