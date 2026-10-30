-- Esquema de referencia de ZARU Ecosystem (solo lectura).
-- Se genera a partir de supabase/migrations; NO se edita a mano (ADR-02).
-- Para regenerarlo: aplicar las migraciones con database/pruebas/aplicar-migraciones.sh y
-- ejecutar: pg_dump --schema-only --no-owner --no-privileges --schema=public --schema=privado <base>



\restrict hLKh1JC2xMXqPQGcx528nWceu3Iqhq4uFSMCwbsvlkjA5H0xoPatBxbYrKE0xpU

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
    'listo',
    'entregado'
);

-- Name: rol_usuario; Type: TYPE; Schema: public; Owner: -

CREATE TYPE public.rol_usuario AS ENUM (
    'admin',
    'operario'
);

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
  select establecimiento_id from perfiles where id = auth.uid() and activo
$$;

-- Name: politica_vigente(); Type: FUNCTION; Schema: privado; Owner: -

CREATE FUNCTION privado.politica_vigente() RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select version from public.politicas_datos where vigente_desde <= now() order by vigente_desde desc limit 1
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

-- Name: crear_cliente_con_consentimiento(uuid, text, text, text, boolean, text, text, inet, uuid); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.crear_cliente_con_consentimiento(p_establecimiento_id uuid, p_nombre text, p_telefono text, p_correo text, p_autoriza boolean, p_politica_version text, p_canal text, p_ip inet, p_registrado_por uuid) RETURNS SETOF public.clientes
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

  insert into consentimientos (establecimiento_id, cliente_id, tipo, otorgado, canal, politica_version, ip, registrado_por)
  values (p_establecimiento_id, v_cliente.id, 'tratamiento_datos', true, p_canal, p_politica_version, p_ip, p_registrado_por);

  return next v_cliente;
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
    created_at timestamp with time zone DEFAULT now()
);

-- Name: historial_estados; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.historial_estados (
    id bigint NOT NULL,
    orden_id uuid NOT NULL,
    estado public.estado_orden NOT NULL,
    usuario_id uuid,
    created_at timestamp with time zone DEFAULT now()
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
    CONSTRAINT notificaciones_canal_check CHECK ((canal = ANY (ARRAY['push'::text, 'sms'::text, 'correo'::text]))),
    CONSTRAINT notificaciones_estado_check CHECK ((estado = ANY (ARRAY['programada'::text, 'pendiente'::text, 'enviando'::text, 'enviada'::text, 'entregada'::text, 'fallida'::text, 'cancelada'::text]))),
    CONSTRAINT notificaciones_intentos_check CHECK ((intentos >= 0)),
    CONSTRAINT notificaciones_tipo_check CHECK ((tipo = ANY (ARRAY['operativa'::text, 'comercial'::text, 'recordatorio'::text, 'novedad'::text, 'correccion'::text, 'sistema'::text])))
);

-- Name: orden_servicios; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.orden_servicios (
    orden_id uuid NOT NULL,
    servicio_id uuid NOT NULL,
    precio numeric(12,2) NOT NULL,
    duracion_min integer NOT NULL
);

-- Name: ordenes; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.ordenes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    establecimiento_id uuid NOT NULL,
    vehiculo_id uuid NOT NULL,
    estado public.estado_orden DEFAULT 'recibido'::public.estado_orden NOT NULL,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    descuento numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    creada_por uuid,
    estado_desde timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    entregada_at timestamp with time zone
);

-- Name: perfiles; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.perfiles (
    id uuid NOT NULL,
    establecimiento_id uuid NOT NULL,
    nombre text NOT NULL,
    rol public.rol_usuario DEFAULT 'operario'::public.rol_usuario NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now()
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

-- Name: historial_estados historial_estados_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.historial_estados
    ADD CONSTRAINT historial_estados_pkey PRIMARY KEY (id);

-- Name: notificaciones notificaciones_clave_dedupe_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_clave_dedupe_key UNIQUE (clave_dedupe);

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

-- Name: consentimientos_cliente_tipo_fecha_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX consentimientos_cliente_tipo_fecha_idx ON public.consentimientos USING btree (cliente_id, tipo, created_at DESC);

-- Name: consentimientos_establecimiento_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX consentimientos_establecimiento_idx ON public.consentimientos USING btree (establecimiento_id, cliente_id);

-- Name: consentimientos_politica_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX consentimientos_politica_idx ON public.consentimientos USING btree (politica_version);

-- Name: historial_estados_orden_fecha_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX historial_estados_orden_fecha_idx ON public.historial_estados USING btree (orden_id, created_at);

-- Name: historial_estados_usuario_id_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX historial_estados_usuario_id_idx ON public.historial_estados USING btree (usuario_id);

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

-- Name: ordenes_creada_por_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ordenes_creada_por_idx ON public.ordenes USING btree (creada_por);

-- Name: ordenes_establecimiento_fecha_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ordenes_establecimiento_fecha_idx ON public.ordenes USING btree (establecimiento_id, created_at DESC);

-- Name: ordenes_establecimiento_id_estado_idx; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ordenes_establecimiento_id_estado_idx ON public.ordenes USING btree (establecimiento_id, estado);

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

-- Name: historial_estados historial_estados_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.historial_estados
    ADD CONSTRAINT historial_estados_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES public.ordenes(id) ON DELETE CASCADE;

-- Name: historial_estados historial_estados_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.historial_estados
    ADD CONSTRAINT historial_estados_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.perfiles(id);

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

-- Name: orden_servicios orden_servicios_servicio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.orden_servicios
    ADD CONSTRAINT orden_servicios_servicio_id_fkey FOREIGN KEY (servicio_id) REFERENCES public.servicios(id);

-- Name: ordenes ordenes_creador_mismo_establecimiento_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ordenes
    ADD CONSTRAINT ordenes_creador_mismo_establecimiento_fkey FOREIGN KEY (creada_por, establecimiento_id) REFERENCES public.perfiles(id, establecimiento_id);

-- Name: ordenes ordenes_establecimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.ordenes
    ADD CONSTRAINT ordenes_establecimiento_id_fkey FOREIGN KEY (establecimiento_id) REFERENCES public.establecimientos(id) ON DELETE CASCADE;

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

-- Name: historial_estados; Type: ROW SECURITY; Schema: public; Owner: -

ALTER TABLE public.historial_estados ENABLE ROW LEVEL SECURITY;

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

-- HU-04: funciones de búsqueda de clientes (requieren la extensión unaccent en el esquema extensions).

create or replace function privado.sin_tildes(texto text)
returns text language sql immutable set search_path = '' as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, texto))
$$;

-- Patrón "contiene" para LIKE: el texto del usuario se trata literalmente, sin comodines.
create or replace function privado.patron_contiene(texto text)
returns text language sql immutable set search_path = '' as $$
  select '%' || replace(replace(replace(texto, '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

create or replace function public.buscar_clientes(p_establecimiento_id uuid, p_texto text)
returns setof clientes
language sql stable security definer set search_path = public as $$
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

\unrestrict hLKh1JC2xMXqPQGcx528nWceu3Iqhq4uFSMCwbsvlkjA5H0xoPatBxbYrKE0xpU

