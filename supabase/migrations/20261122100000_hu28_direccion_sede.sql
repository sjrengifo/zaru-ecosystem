-- HU-28 CA2 (ZARU-17) — Dirección de la sede en el aviso de "listo para entrega".
-- El administrador la escribe en Branding; los avisos la incluyen para que el cliente sepa a dónde ir.
alter table establecimientos
  add column if not exists direccion text
    check (direccion is null or char_length(direccion) between 1 and 160);

comment on column establecimientos.direccion is
  'HU-28 CA2: dirección de la sede que se muestra en el aviso de vehículo listo. Opcional.';
