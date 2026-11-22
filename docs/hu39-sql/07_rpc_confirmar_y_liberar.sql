-- ===========================================================================
-- HU-39 (ZARU-28) - RPC hu39_confirmar_consumo (CA1) y hu39_liberar_consumo
-- Ejecutar las partes en orden (01 -> 08). Contenido extraido de:
-- supabase/migrations/20261119100000_hu39_consumo_por_plan.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- CA1 / contabilizaciÃ³n: confirma solo lo que el proveedor aceptÃ³. Devuelve el
-- aviso del 80 % una Ãºnica vez por mes, con la fila bloqueada.
-- ---------------------------------------------------------------------------
create or replace function public.hu39_confirmar_consumo(
  p_establecimiento_id uuid,
  p_canal              text,
  p_referencia         text,
  p_mes                date,
  p_ahora              timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_reserva    record;
  v_consumo    record;
  v_plan       record;
  v_cupo       integer;
  v_cantidad   integer;
  v_porcentaje numeric;
  v_alerta     jsonb;
begin
  -- Se bloquea la reserva y despuÃ©s el contador. Distintas referencias pueden
  -- esperar en la reserva, pero todas convergen en la misma fila del contador.
  select * into v_reserva
  from public.consumo_reservas
  where establecimiento_id = p_establecimiento_id
    and mes = p_mes and canal = p_canal and referencia = p_referencia
  for update;
  if not found then
    return jsonb_build_object('estado', 'sin_reserva');
  end if;

  select p.nombre, p.cupo_sms_mes, p.cupo_correo_mes into v_plan
  from public.planes p
  join public.establecimientos e on e.plan = p.nombre
  where e.id = p_establecimiento_id;

  select * into v_consumo
  from public.consumo_mensual
  where establecimiento_id = p_establecimiento_id and mes = p_mes and canal = p_canal
  for update;

  if v_reserva.estado = 'confirmada' then
    -- Doble conteo imposible: la reserva ya fue contabilizada.
    v_cantidad := v_consumo.cantidad;
  elsif v_reserva.estado = 'liberada' then
    -- Un intento liberado nunca cuenta como envÃ­o.
    return jsonb_build_object('estado', 'liberada');
  else
    update public.consumo_reservas
       set estado = 'confirmada', confirmada_at = p_ahora
     where establecimiento_id = p_establecimiento_id
       and mes = p_mes and canal = p_canal and referencia = p_referencia;

    update public.consumo_mensual
       set cantidad = cantidad + 1,
           reservada = greatest(reservada - 1, 0),
           actualizado_at = p_ahora
     where establecimiento_id = p_establecimiento_id and mes = p_mes and canal = p_canal
     returning cantidad into v_cantidad;
  end if;

  v_cupo := case when p_canal = 'sms' then v_plan.cupo_sms_mes else v_plan.cupo_correo_mes end;
  if v_cupo is null or v_cupo = 0 then
    v_porcentaje := null;
  else
    v_porcentaje := round(v_cantidad::numeric * 100 / v_cupo, 2);
  end if;

  -- Solo SMS: el criterio CA1 pide la alerta al 80 % del cupo de SMS.
  if p_canal = 'sms' and v_cupo is not null and v_cupo > 0
     and v_cantidad >= ceil(v_cupo * 0.80)::integer
     and not v_consumo.alerta_80_enviada then

    update public.consumo_mensual
       set alerta_80_enviada = true, alerta_80_enviada_at = p_ahora
     where establecimiento_id = p_establecimiento_id and mes = p_mes and canal = p_canal;

    v_alerta := jsonb_build_object(
      'establecimientoId', p_establecimiento_id::text,
      'mes', to_char(p_mes, 'YYYY-MM'),
      'plan', v_plan.nombre,
      'cupo', v_cupo,
      'consumo', v_cantidad,
      'porcentaje', v_porcentaje,
      'restantes', greatest(v_cupo - v_cantidad, 0)
    );
  end if;

  return jsonb_build_object(
    'estado', 'ok',
    'cantidad', v_cantidad,
    'cupo', v_cupo,
    'porcentaje', v_porcentaje,
    'restantes', case when v_cupo is null then null else greatest(v_cupo - v_cantidad, 0) end,
    'alerta_80', v_alerta
  );
end $$;

-- ---------------------------------------------------------------------------
-- Libera una reserva cuando el proveedor fallÃ³: no cuenta como envÃ­o y deja
-- el sitio libre para el siguiente intento o para el canal alterno.
-- ---------------------------------------------------------------------------
create or replace function public.hu39_liberar_consumo(
  p_establecimiento_id uuid,
  p_canal              text,
  p_referencia         text,
  p_mes                date,
  p_ahora              timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_reserva record;
begin
  select * into v_reserva
  from public.consumo_reservas
  where establecimiento_id = p_establecimiento_id
    and mes = p_mes and canal = p_canal and referencia = p_referencia
  for update;

  if not found then
    return jsonb_build_object('estado', 'sin_reserva');
  end if;
  if v_reserva.estado <> 'reservada' then
    return jsonb_build_object('estado', v_reserva.estado);
  end if;

  update public.consumo_reservas
     set estado = 'liberada', liberada_at = p_ahora
   where establecimiento_id = p_establecimiento_id
     and mes = p_mes and canal = p_canal and referencia = p_referencia;

  update public.consumo_mensual
     set reservada = greatest(reservada - 1, 0), actualizado_at = p_ahora
   where establecimiento_id = p_establecimiento_id and mes = p_mes and canal = p_canal;

  return jsonb_build_object('estado', 'ok');
end $$;

-- Alcance HU-39: estas tres RPCs solo son ejecutables por service_role (backend).
-- No se otorgan a public/anon/authenticated; el frontend nunca las invoca.
