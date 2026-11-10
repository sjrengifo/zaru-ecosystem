create table novedades (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references establecimientos(id) on delete cascade,
  orden_id           uuid not null,
  tipo               text not null
                       check (tipo in ('demora', 'dano_preexistente', 'objeto_encontrado', 'otro')),
  mensaje            text check (mensaje is null or char_length(mensaje) between 1 and 300),
  minutos_extra      integer check (minutos_extra is null or minutos_extra > 0),
  fotos              text[] not null default '{}'::text[],
  creada_por         uuid not null,
  created_at         timestamptz not null default now(),
  constraint novedades_minutos_check check (
    (tipo = 'demora' and minutos_extra is not null)
    or (tipo <> 'demora' and minutos_extra is null)
  ),
  constraint novedades_fotos_check check (
    cardinality(fotos) <= 3
    and (cardinality(fotos) = 0 or tipo = 'dano_preexistente')
  ),
  foreign key (orden_id, establecimiento_id) references ordenes (id, establecimiento_id) on delete cascade,
  foreign key (creada_por, establecimiento_id) references perfiles (id, establecimiento_id)
);

alter table novedades enable row level security;

create index novedades_orden_fecha_idx on novedades (orden_id, created_at desc);
create index novedades_establecimiento_fecha_idx on novedades (establecimiento_id, created_at desc);

revoke all on table novedades from public, anon, authenticated;
grant select, insert, update, delete on table novedades to service_role;

create or replace function public.registrar_novedad(
  p_establecimiento_id uuid,
  p_orden_id uuid,
  p_tipo text,
  p_mensaje text default null,
  p_minutos_extra integer default null,
  p_creada_por uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_orden record;
  v_mensaje text := nullif(btrim(coalesce(p_mensaje, '')), '');
  v_novedad_id uuid;
  v_creado_at timestamptz;
  v_entrega_estimada_at timestamptz;
  v_version integer;
begin
  if p_tipo not in ('demora', 'dano_preexistente', 'objeto_encontrado', 'otro') then
    raise exception 'El tipo de novedad no es válido'
      using errcode = '23514', hint = 'tipo';
  end if;

  if v_mensaje is not null and char_length(v_mensaje) > 300 then
    raise exception 'El mensaje admite máximo 300 caracteres'
      using errcode = '23514', hint = 'mensaje';
  end if;

  if p_tipo = 'demora' and (p_minutos_extra is null or p_minutos_extra <= 0) then
    raise exception 'Indica cuántos minutos adicionales dura la demora'
      using errcode = '23514', hint = 'minutosExtra';
  end if;

  if p_tipo <> 'demora' and p_minutos_extra is not null then
    raise exception 'Solo una demora indica minutos adicionales'
      using errcode = '23514', hint = 'minutosExtra';
  end if;

  if p_creada_por is null or not exists (
    select 1 from perfiles
    where id = p_creada_por
      and establecimiento_id = p_establecimiento_id
      and activo
  ) then
    raise exception 'El usuario no está activo en el establecimiento de la orden'
      using errcode = '23514', hint = 'usuario';
  end if;

  select o.*
    into v_orden
  from ordenes o
  where o.id = p_orden_id
    and o.establecimiento_id = p_establecimiento_id
  for update;

  if not found then
    raise exception 'Orden no encontrada'
      using errcode = 'P0001', hint = 'NO_ENCONTRADO';
  end if;

  if v_orden.estado = 'entregado' then
    raise exception 'Una orden entregada ya no admite novedades'
      using errcode = 'P0001', hint = 'CONFLICTO';
  end if;

  insert into novedades (establecimiento_id, orden_id, tipo, mensaje, minutos_extra, creada_por)
  values (p_establecimiento_id, p_orden_id, p_tipo, v_mensaje, p_minutos_extra, p_creada_por)
  returning id, created_at into v_novedad_id, v_creado_at;

  if p_tipo = 'demora' then
    update ordenes
    set entrega_estimada_at = coalesce(entrega_estimada_at, now())
          + make_interval(mins => p_minutos_extra),
        version = version + 1
    where id = p_orden_id
    returning entrega_estimada_at, version into v_entrega_estimada_at, v_version;
  else
    v_entrega_estimada_at := v_orden.entrega_estimada_at;
    v_version := v_orden.version;
  end if;

  return jsonb_build_object(
    'id', v_novedad_id,
    'ordenId', p_orden_id,
    'tipo', p_tipo,
    'mensaje', v_mensaje,
    'minutosExtra', p_minutos_extra,
    'fotos', '[]'::jsonb,
    'createdAt', v_creado_at,
    'entregaEstimadaAt', v_entrega_estimada_at,
    'version', v_version
  );
end $$;

revoke execute on function public.registrar_novedad(uuid, uuid, text, text, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.registrar_novedad(uuid, uuid, text, text, integer, uuid)
  to service_role;
