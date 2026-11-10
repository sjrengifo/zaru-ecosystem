-- HU-17 (ZARU-33): enlace público de cada sede para el cliente final.
--
-- El cliente abre /s/{slug} (enlace o código QR del car wash) y escribe su placa o su celular.
-- El slug identifica la sede en la URL sin exponer su id. Se genera solo a partir del nombre al
-- crear el establecimiento (HU-57 no cambia) y es único en la plataforma.

-- "Car Wash Demo Cali" -> "car-wash-demo-cali". Sin tildes, minúsculas, solo letras, números y guiones.
create or replace function privado.slug_base(texto text)
returns text language sql immutable set search_path = '' as $$
  select coalesce(
    nullif(left(trim(both '-' from regexp_replace(privado.sin_tildes(coalesce(texto, '')), '[^a-z0-9]+', '-', 'g')), 50), ''),
    'sede'
  )
$$;

-- Primer slug libre: base, base-2, base-3…
create or replace function privado.slug_disponible(texto text, p_excluir uuid default null)
returns text language plpgsql stable set search_path = '' as $$
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

alter table public.establecimientos add column if not exists slug text;

-- Fila por fila (de la más antigua a la más reciente): un UPDATE masivo no ve los slugs que ya
-- asignó en la misma sentencia y dos sedes con el mismo nombre quedarían con el mismo slug.
do $$
declare
  fila record;
begin
  for fila in select id, nombre from public.establecimientos where slug is null order by created_at nulls first, id loop
    update public.establecimientos set slug = privado.slug_disponible(fila.nombre, fila.id) where id = fila.id;
  end loop;
end
$$;

alter table public.establecimientos
  alter column slug set not null,
  add constraint establecimientos_slug_formato check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60);

create unique index if not exists establecimientos_slug_key on public.establecimientos (slug);

-- Al crear una sede sin slug, se genera del nombre.
create or replace function privado.asignar_slug_establecimiento()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := privado.slug_disponible(new.nombre, new.id);
  end if;
  return new;
end
$$;

drop trigger if exists establecimientos_asignar_slug on public.establecimientos;
create trigger establecimientos_asignar_slug
  before insert on public.establecimientos
  for each row execute function privado.asignar_slug_establecimiento();

-- Búsqueda de la orden activa por placa o celular dentro de una sede (HU-17 CA1 y CA4).
-- "Activa" = todo lo que no se ha entregado. El índice parcial ya garantiza una sola por vehículo.
create index if not exists clientes_establecimiento_telefono_idx on public.clientes (establecimiento_id, telefono);

comment on column public.establecimientos.slug is
  'HU-17: identificador público de la sede en el enlace del cliente final (/s/{slug}). Único y en minúsculas.';
