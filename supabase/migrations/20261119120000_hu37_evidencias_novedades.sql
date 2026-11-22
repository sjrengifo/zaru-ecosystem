-- HU-37 CA2: evidencia fotográfica en un bucket privado, con acceso limitado a la sede.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidencias', 'evidencias', false, 5242880, array['image/png', 'image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "personal ve evidencias de su sede" on storage.objects for select to authenticated
  using (bucket_id = 'evidencias' and (storage.foldername(name))[1] = privado.mi_establecimiento()::text);

create policy "personal sube evidencias de su sede" on storage.objects for insert to authenticated
  with check (bucket_id = 'evidencias' and (storage.foldername(name))[1] = privado.mi_establecimiento()::text);

create policy "personal borra evidencias de su sede" on storage.objects for delete to authenticated
  using (bucket_id = 'evidencias' and (storage.foldername(name))[1] = privado.mi_establecimiento()::text);
