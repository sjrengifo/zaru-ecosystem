-- HU-44: pruebas de seguridad en la base de datos.
-- CA2: la auditoría solo admite inserciones.
-- CA4: ninguna tabla propia guarda contraseñas; Supabase Auth las guarda con bcrypt.
-- CA1: el hook de Supabase Auth agrega rol y establecimiento al token.
-- Uso: psql -d zaru_prueba -f database/pruebas/04_seguridad.sql
\set QUIET on
\o /dev/null
create temp table resultados (n serial, prueba text, ok boolean, detalle text);

create or replace function pg_temp.debe_fallar(prueba text, sentencia text) returns void language plpgsql as $$
begin
  begin
    execute sentencia;
    insert into resultados (prueba, ok, detalle) values (prueba, false, 'la base aceptó la operación');
  exception when others then
    insert into resultados (prueba, ok, detalle) values (prueba, true, sqlstate || ': ' || left(sqlerrm, 70));
  end;
end $$;

create or replace function pg_temp.verificar(prueba text, condicion boolean, detalle text) returns void language sql as $$
  insert into resultados (prueba, ok, detalle) values (prueba, coalesce(condicion, false), detalle);
$$;

insert into auditoria (accion, recurso, resultado, motivo) values ('POST /api/servicios', 'servicios', 'denegado', 'prueba');

select pg_temp.debe_fallar('CA2: no se puede modificar un registro de auditoría',
  $q$update auditoria set resultado = 'permitido'$q$);
select pg_temp.debe_fallar('CA2: no se puede borrar un registro de auditoría',
  $q$delete from auditoria$q$);
select pg_temp.debe_fallar('CA2: no se puede vaciar la tabla de auditoría',
  $q$truncate auditoria$q$);
select pg_temp.verificar('CA2: la auditoría tiene RLS habilitado',
  (select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'auditoria'), 'rowsecurity = true');

select pg_temp.verificar('CA4: ninguna columna de public o privado guarda contraseñas',
  not exists (select 1 from information_schema.columns
              where table_schema in ('public', 'privado') and (column_name ~* '(passw|pwd|contrase)' or column_name in ('clave', 'clave_acceso', 'clave_hash'))),
  'sin columnas password, pwd, contraseña ni clave de acceso');

select pg_temp.verificar('CA1: el token de un usuario activo incluye rol y establecimiento',
  (select (r->'claims') ?& array['app_rol', 'establecimiento_id']
   from (select custom_access_token_hook(jsonb_build_object('user_id', p.id, 'claims', '{}'::jsonb)) r
         from perfiles p where activo limit 1) t),
  'claims app_rol y establecimiento_id');

select pg_temp.verificar('CA1: el token de un usuario sin perfil activo no trae rol',
  not ((custom_access_token_hook(jsonb_build_object('user_id', gen_random_uuid(),
        'claims', '{"app_rol":"admin"}'::jsonb))->'claims') ? 'app_rol'),
  'claim app_rol eliminado');

select pg_temp.verificar('CA1: el hook no es ejecutable por anon ni authenticated',
  not has_function_privilege('anon', 'public.custom_access_token_hook(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.custom_access_token_hook(jsonb)', 'execute'),
  'sin permiso de ejecución');

\o
\set QUIET off
\pset footer off
select n as "#", case when ok then 'PASA' else 'FALLA' end as resultado, prueba, detalle from resultados order by n;
select count(*) filter (where ok) || ' de ' || count(*) || ' pruebas aprobadas' as resumen from resultados;
