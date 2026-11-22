-- ===========================================================================
-- HU-39 (ZARU-28) - FK RESTRICT y guardia anti-sobrescritura
-- Ejecutar las partes en orden (01 -> 08). Contenido extraido de:
-- supabase/migrations/20261119100000_hu39_consumo_por_plan.sql
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- NormalizaciÃ³n de FK histÃ³ricas: si alguna de estas tres tablas se creÃ³ con una
-- versiÃ³n anterior del FK sin nombre y ON DELETE CASCADE, se sustituye por el
-- constraint con nombre y ON DELETE RESTRICT. Solo afecta a tablas de HU-39;
-- no se eliminan filas ni se tocan FK de otros mÃ³dulos.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabla      text;
  v_nombre_fk  text;
  v_ok         boolean;
  r            record;
begin
  for v_tabla in
    select unnest(array['consumo_mensual', 'consumo_reservas', 'consumo_alertas'])
  loop
    v_nombre_fk := v_tabla || '_establecimiento_fkey';
    v_ok := false;

    for r in
      select c.conname, pg_get_constraintdef(c.oid) as def
      from pg_constraint c
      where c.conrelid = format('public.%I', v_tabla)::regclass
        and c.contype = 'f'
        and c.confrelid = 'public.establecimientos'::regclass
        and exists (
          select 1
          from unnest(c.conkey) k
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
          where a.attname = 'establecimiento_id'
        )
    loop
      if r.conname = v_nombre_fk and r.def like '%ON DELETE RESTRICT%' then
        v_ok := true;
      else
        execute format('alter table public.%I drop constraint %I', v_tabla, r.conname);
      end if;
    end loop;

    if not v_ok then
      execute format(
        'alter table public.%I add constraint %I foreign key (establecimiento_id) references public.establecimientos(id) on delete restrict',
        v_tabla, v_nombre_fk
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Guardia anti-sobrescritura: las RPCs llevan prefijo hu39_ y COMMENT con HU-39.
-- Si existiera una funciÃ³n homÃ³nima de otro mÃ³dulo, se aborta en vez de
-- reemplazarla con CREATE OR REPLACE.
-- ---------------------------------------------------------------------------
do $$
declare
  v_nombre       text;
  v_descripcion  text;
begin
  foreach v_nombre in array array[
    'hu39_reservar_consumo', 'hu39_confirmar_consumo', 'hu39_liberar_consumo'
  ] loop
    select obj_description(p.oid, 'pg_proc')
      into v_descripcion
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = v_nombre
      and p.pronargs = 5;

    if found and (v_descripcion is null or v_descripcion not like 'HU-39%') then
      raise exception
        'HU-39: la funciÃ³n public.% ya existe y no estÃ¡ identificada como HU-39; no se sobrescribe',
        v_nombre;
    end if;
  end loop;
end $$;
