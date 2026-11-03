-- HU-13 (ZARU-14): branding de la sede. Colores en formato #RRGGBB y bucket público de logos.
--
-- Antes de aplicarla, revisar que no haya colores inválidos (si los hay, la migración falla y no cambia nada):
--   select id, nombre, color_primario, color_secundario from establecimientos
--   where color_primario !~ '^#[0-9A-Fa-f]{6}$' or color_secundario !~ '^#[0-9A-Fa-f]{6}$';

-- RF-F4-08: la base rechaza cualquier color que no sea #RRGGBB (null sigue permitido: usa el color por defecto).
alter table establecimientos
  add constraint establecimientos_color_primario_hex check (color_primario ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint establecimientos_color_secundario_hex check (color_secundario ~ '^#[0-9A-Fa-f]{6}$');

-- RF-F4-07, RNF-F4-02: bucket público (los logos se ven sin sesión, también en el canal del cliente final),
-- máximo 2 MB y solo PNG o JPG. Storage aplica estos límites aunque alguien suba sin pasar por la API.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- RNF-F4-03: un administrador solo escribe en la carpeta de su sede: logos/{establecimiento_id}/…
-- La API sube con service_role (que no pasa por estas políticas); son la segunda barrera si alguien
-- usa el token del panel directamente contra Storage. La lectura no necesita política: el bucket es público.
create policy "admin sube el logo de su sede" on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = privado.mi_establecimiento()::text and privado.soy_admin());

create policy "admin reemplaza el logo de su sede" on storage.objects for update to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = privado.mi_establecimiento()::text and privado.soy_admin())
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = privado.mi_establecimiento()::text and privado.soy_admin());

create policy "admin borra el logo de su sede" on storage.objects for delete to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = privado.mi_establecimiento()::text and privado.soy_admin());
