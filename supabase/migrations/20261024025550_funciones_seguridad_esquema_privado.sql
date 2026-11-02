-- Mueve las funciones de seguridad a un esquema no expuesto por la API.
create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated, service_role;

alter function public.mi_establecimiento() set schema privado;
alter function public.soy_admin() set schema privado;

revoke execute on function privado.mi_establecimiento() from public, anon;
revoke execute on function privado.soy_admin() from public, anon;
grant execute on function privado.mi_establecimiento() to authenticated, service_role;
grant execute on function privado.soy_admin() to authenticated, service_role;
