-- HU-04 (ZARU-4): búsqueda de clientes por nombre, teléfono o placa, sin distinguir tildes ni mayúsculas.

create extension if not exists unaccent with schema extensions;

-- unaccent no es immutable porque depende de su diccionario; aquí se fija el diccionario de forma explícita.
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

-- Solo el backend (service_role) puede llamarla; no se expone a usuarios del panel ni al público.
revoke execute on function privado.sin_tildes(text) from public, anon, authenticated;
revoke execute on function privado.patron_contiene(text) from public, anon, authenticated;
revoke execute on function public.buscar_clientes(uuid, text) from public, anon, authenticated;
grant execute on function public.buscar_clientes(uuid, text) to service_role;
