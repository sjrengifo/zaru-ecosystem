-- HU-17 (ZARU-33): el slug se genera al crear una sede sin importar el rol que inserta.
--
-- privado.sin_tildes no es ejecutable por los roles de la API (HU-04). El trigger corría con el rol
-- de quien inserta (service_role en HU-57), así que fallaba con "permission denied for function
-- sin_tildes". Igual que los demás triggers del proyecto, la función del trigger corre como su dueño
-- y nadie puede llamar directamente a las funciones del slug.

alter function privado.asignar_slug_establecimiento() security definer;

revoke execute on function privado.asignar_slug_establecimiento() from public, anon, authenticated, service_role;
revoke execute on function privado.slug_disponible(text, uuid) from public, anon, authenticated, service_role;
revoke execute on function privado.slug_base(text) from public, anon, authenticated, service_role;
