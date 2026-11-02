-- HU-13: colores #RRGGBB y bucket de logos.
-- Uso: psql -d zaru_prueba -f database/pruebas/08_branding.sql
\set QUIET on
\o /dev/null
create temp table resultados (n serial, prueba text, ok boolean, detalle text);

create or replace function pg_temp.verificar(prueba text, condicion boolean, detalle text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (prueba, coalesce(condicion, false), detalle);
$$;

-- true si la base acepta el color como primario.
create or replace function pg_temp.acepta_color(color text) returns boolean language plpgsql as $$
begin
  insert into establecimientos (id, nombre, color_primario) values ('13000000-0000-0000-0000-0000000000e9', 'Lavadero HU-13', color);
  delete from establecimientos where id = '13000000-0000-0000-0000-0000000000e9';
  return true;
exception when check_violation then
  return false;
end $$;

select pg_temp.verificar('Acepta #RRGGBB en mayúsculas o minúsculas', pg_temp.acepta_color('#1A2b3C'), '#1A2b3C');
select pg_temp.verificar('Rechaza un color de 5 dígitos', not pg_temp.acepta_color('#12345'), '#12345');
select pg_temp.verificar('Rechaza un nombre de color', not pg_temp.acepta_color('azul'), 'azul');
select pg_temp.verificar('Rechaza dígitos no hexadecimales', not pg_temp.acepta_color('#GGGGGG'), '#GGGGGG');
select pg_temp.verificar('Rechaza el formato corto #RGB', not pg_temp.acepta_color('#FFF'), '#FFF');
select pg_temp.verificar('El secundario también se valida',
  (select count(*) = 1 from pg_constraint where conname = 'establecimientos_color_secundario_hex'), 'check presente');
select pg_temp.verificar('Bucket logos público, 2 MB, solo PNG y JPG',
  (select public and file_size_limit = 2097152 and allowed_mime_types = array['image/png', 'image/jpeg'] from storage.buckets where id = 'logos'),
  (select row(public, file_size_limit, allowed_mime_types)::text from storage.buckets where id = 'logos'));
select pg_temp.verificar('Políticas de escritura por carpeta de la sede',
  (select count(*) = 3 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like '%logo de su sede'), '3 políticas');
select pg_temp.verificar('La carpeta se toma del primer segmento de la ruta',
  (storage.foldername('13000000-0000-0000-0000-0000000000e1/logo-1.png'))[1] = '13000000-0000-0000-0000-0000000000e1', 'foldername');

\o
\set QUIET off
\pset footer off
select n as "#", case when ok then 'PASA' else 'FALLA' end as resultado, prueba, detalle from resultados order by n;
select count(*) filter (where ok) || ' de ' || count(*) || ' pruebas aprobadas' as resumen from resultados;
