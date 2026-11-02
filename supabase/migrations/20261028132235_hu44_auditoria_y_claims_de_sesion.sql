-- HU-44 (ZARU-51): auditoría de accesos y claims de rol y establecimiento en el token.

---------------------------------------------------------------------------
-- CA2. Auditoría (solo inserción)
---------------------------------------------------------------------------
-- No usa llaves foráneas a propósito: el registro debe conservarse aunque luego se
-- elimine el usuario o el establecimiento.
create table auditoria (
  id                 bigint generated always as identity primary key,
  establecimiento_id uuid,
  usuario_id         uuid,
  actor_tipo         text not null default 'usuario' check (actor_tipo in ('usuario', 'cliente', 'sistema')),
  rol                text,
  accion             text not null,
  recurso            text,
  recurso_id         text,
  resultado          text not null check (resultado in ('permitido', 'denegado')),
  motivo             text,
  detalle            jsonb not null default '{}'::jsonb,
  ip                 inet,
  request_id         text,
  created_at         timestamptz not null default now()
);

create index auditoria_establecimiento_fecha_idx on auditoria (establecimiento_id, created_at desc);
create index auditoria_usuario_fecha_idx on auditoria (usuario_id, created_at desc);

-- Inmutable: nadie, ni siquiera el backend con service_role, puede modificar o borrar registros.
create or replace function privado.impedir_modificacion_auditoria()
returns trigger language plpgsql as $$
begin
  raise exception 'La auditoría no se puede modificar ni eliminar' using errcode = '42501';
end $$;

create trigger auditoria_inmutable
  before update or delete on auditoria
  for each row execute function privado.impedir_modificacion_auditoria();

create trigger auditoria_sin_truncate
  before truncate on auditoria
  for each statement execute function privado.impedir_modificacion_auditoria();

revoke execute on function privado.impedir_modificacion_auditoria() from public, anon, authenticated;

-- Solo el administrador del establecimiento puede leer su auditoría (desde el panel).
alter table auditoria enable row level security;
create policy "admin ve auditoria de su establecimiento" on auditoria
  for select using (establecimiento_id = privado.mi_establecimiento() and privado.soy_admin());

---------------------------------------------------------------------------
-- CA1. Rol y establecimiento dentro del token de acceso
---------------------------------------------------------------------------
-- Supabase Auth llama a esta función cada vez que emite un token (Custom Access Token Hook).
-- Agrega los claims `app_rol` y `establecimiento_id`. El backend NO confía en ellos para
-- autorizar: los vuelve a leer de `perfiles` en cada petición (RF-F1-02). Sirven al panel
-- para mostrar el menú según el rol sin otra consulta.
-- Se activa en el panel de Supabase: Authentication → Hooks → Customize Access Token (JWT) Claims.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  perfil record;
  claims jsonb := coalesce(event->'claims', '{}'::jsonb);
begin
  select rol, establecimiento_id into perfil
  from perfiles where id = (event->>'user_id')::uuid and activo;

  if found then
    claims := claims || jsonb_build_object('app_rol', perfil.rol, 'establecimiento_id', perfil.establecimiento_id);
  else
    claims := claims - 'app_rol' - 'establecimiento_id';
  end if;

  return jsonb_set(event, '{claims}', claims);
end $$;

revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
-- Es security definer: lee `perfiles` sin dar permisos sobre la tabla al rol de Auth.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin';
  end if;
end $$;
