-- HU-57: administración global de establecimientos y periodo de prueba.
-- Los perfiles superadmin no pertenecen a un tenant; los demás roles sí.
alter table public.perfiles alter column establecimiento_id drop not null;

alter table public.perfiles
  add constraint perfiles_rol_valido check (rol in ('admin'::public.rol_usuario, 'operario'::public.rol_usuario, 'superadmin'::public.rol_usuario)),
  add constraint perfiles_tenant_por_rol check (
    (rol = 'superadmin'::public.rol_usuario and establecimiento_id is null)
    or (rol in ('admin'::public.rol_usuario, 'operario'::public.rol_usuario) and establecimiento_id is not null)
  );

alter table public.establecimientos
  add column plan text not null default 'intermedio'
    check (plan in ('basico', 'intermedio', 'empresarial')),
  add column estado text not null default 'activo'
    check (estado in ('prueba', 'activo', 'pendiente_activacion', 'suspendido')),
  add column prueba_inicia_at timestamptz,
  add column prueba_finaliza_at timestamptz,
  add column activado_at timestamptz,
  add constraint establecimientos_prueba_duracion_check check (
    estado <> 'prueba'
    or (
      prueba_inicia_at is not null
      and prueba_finaliza_at >= prueba_inicia_at + interval '14 days'
      and prueba_finaliza_at <= prueba_inicia_at + interval '30 days'
    )
  );

create index establecimientos_estado_prueba_idx
  on public.establecimientos (estado, prueba_finaliza_at);

-- Los registros existentes conservan acceso y se consideran activos.
update public.establecimientos
set estado = 'activo',
    plan = coalesce(plan, 'intermedio')
where estado is null;

-- RLS también bloquea el acceso directo a Supabase de usuarios con sesión antigua
-- cuando su establecimiento está suspendido o su prueba ya venció.
create or replace function privado.mi_establecimiento()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.establecimiento_id
  from public.perfiles p
  join public.establecimientos e on e.id = p.establecimiento_id
  where p.id = auth.uid()
    and p.activo
    and p.rol in ('admin', 'operario')
    and e.estado in ('activo', 'prueba')
    and (e.estado <> 'prueba' or e.prueba_finaliza_at > now())
$$;

-- Marca los periodos vencidos aunque nadie esté usando el panel.
create extension if not exists pg_cron with schema pg_catalog;
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'zaru-hu57-vencer-pruebas';

    perform cron.schedule(
      'zaru-hu57-vencer-pruebas',
      '*/5 * * * *',
      $job$update public.establecimientos
           set estado = 'pendiente_activacion'
           where estado = 'prueba'
             and prueba_finaliza_at <= now();$job$
    );
  end if;
end $$;
