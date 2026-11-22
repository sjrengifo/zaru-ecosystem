-- ===========================================================================
-- HU-39 (ZARU-28) - RPC hu39_reservar_consumo (CA2)
-- Ejecutar las partes en orden (01 -> 08). Contenido extraido de:
-- supabase/migrations/20261119100000_hu39_consumo_por_plan.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- CA2: aparta una unidad del cupo antes de enviar. Solo el SMS estÃ¡ limitado;
-- correo y push se contabilizan pero nunca bloquean una notificaciÃ³n operativa.
-- SECURITY DEFINER con search_path explÃ­cito (public, pg_temp) y todas las
-- referencias schema-qualificadas: no se expone datos de otros establecimientos.
-- ---------------------------------------------------------------------------
create or replace function public.hu39_reservar_consumo(
  p_establecimiento_id uuid,
  p_canal              text,
  p_referencia         text,
  p_mes                date,
  p_ahora              timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_plan      record;
  v_consumo   record;
  v_reserva   record;
  v_cupo      integer;
  v_usados    integer;
begin
  if p_canal not in ('sms', 'correo', 'push') or p_referencia is null or p_referencia = '' then
    return jsonb_build_object('estado', 'datos_invalidos');
  end if;

  select p.nombre, p.cupo_sms_mes, p.cupo_correo_mes into v_plan
  from public.planes p
  join public.establecimientos e on e.plan = p.nombre
  where e.id = p_establecimiento_id;
  if not found then
    return jsonb_build_object('estado', 'sin_plan');
  end if;

  v_cupo := case when p_canal = 'sms' then v_plan.cupo_sms_mes else v_plan.cupo_correo_mes end;

  insert into public.consumo_mensual (establecimiento_id, mes, canal)
  values (p_establecimiento_id, p_mes, p_canal)
  on conflict do nothing;

  -- Se bloquea primero la fila del contador: todas las reservas del mismo
  -- establecimiento/mes/canal se serializan aquÃ­, evitando sobrepasar el cupo.
  select * into v_consumo
  from public.consumo_mensual
  where establecimiento_id = p_establecimiento_id and mes = p_mes and canal = p_canal
  for update;

  select * into v_reserva
  from public.consumo_reservas
  where establecimiento_id = p_establecimiento_id
    and mes = p_mes and canal = p_canal and referencia = p_referencia;

  if found then
    if v_reserva.estado = 'confirmada' then
      -- Idempotencia: un reintento del worker no vuelve a contabilizar.
      return jsonb_build_object('estado', 'ok', 'ya_contabilizada', true,
        'cantidad', v_consumo.cantidad, 'cupo', v_cupo);
    end if;
    if v_reserva.estado = 'reservada' then
      return jsonb_build_object('estado', 'ok', 'ya_reservada', true,
        'cantidad', v_consumo.cantidad, 'cupo', v_cupo);
    end if;
    -- El intento anterior fallÃ³ y liberÃ³ la reserva: puede volver a intentarse.
    update public.consumo_reservas
       set estado = 'reservada', liberada_at = null, created_at = p_ahora
     where establecimiento_id = p_establecimiento_id
       and mes = p_mes and canal = p_canal and referencia = p_referencia;
    update public.consumo_mensual
       set reservada = reservada + 1, actualizado_at = p_ahora
     where establecimiento_id = p_establecimiento_id and mes = p_mes and canal = p_canal;
    return jsonb_build_object('estado', 'ok', 'cantidad', v_consumo.cantidad,
      'cupo', v_cupo, 'reservada', v_consumo.reservada + 1);
  end if;

  v_usados := v_consumo.cantidad + v_consumo.reservada;
  if p_canal = 'sms' and v_cupo is not null and v_usados >= v_cupo then
    -- Sin cupo: la cola busca canal alterno. No se contabiliza el intento fallido.
    return jsonb_build_object('estado', 'sin_cupo', 'cantidad', v_consumo.cantidad,
      'cupo', v_cupo, 'restantes', 0, 'mes', to_char(p_mes, 'YYYY-MM'));
  end if;

  insert into public.consumo_reservas (establecimiento_id, mes, canal, referencia)
  values (p_establecimiento_id, p_mes, p_canal, p_referencia);

  update public.consumo_mensual
     set reservada = reservada + 1, actualizado_at = p_ahora
   where establecimiento_id = p_establecimiento_id and mes = p_mes and canal = p_canal;

  return jsonb_build_object('estado', 'ok', 'cantidad', v_consumo.cantidad,
    'cupo', v_cupo, 'reservada', v_consumo.reservada + 1);
end $$;
