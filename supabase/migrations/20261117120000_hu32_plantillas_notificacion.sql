-- HU-32 (ZARU-21): plantillas de notificación con la marca de la sede (RF-F7-01 a RF-F7-05).
--
-- Una plantilla es el texto de un estado de la orden (recibido, en_lavado, secado, listo, entregado)
-- en un canal (push, sms, correo). Las filas con establecimiento_id null son las de la plataforma
-- (RF-F7-05): se usan mientras la sede no personalice la suya.
--
-- La migración solo crea objetos nuevos y siembra las 15 plantillas de la plataforma: no modifica
-- filas existentes. Consulta de revisión previa (debe responder "null"; si responde
-- "plantillas_notificacion", la tabla ya existe y hay que revisar antes de seguir):
--   select to_regclass('public.plantillas_notificacion');
--
-- Variables permitidas (las valida el backend, shared/plantillasNotificacion.js):
--   {nombre_cliente} {placa} {estado} {sede} {hora}

create table if not exists plantillas_notificacion (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid references establecimientos (id) on delete cascade,
  estado             estado_orden not null,
  canal              text not null,
  asunto             text,
  cuerpo             text not null,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references perfiles (id) on delete set null,
  constraint plantillas_notificacion_canal_check check (canal in ('push', 'sms', 'correo')),
  -- Push 240, SMS 640 (hasta 5 partes GSM-7), correo 2 000 caracteres. El SMS no lleva asunto.
  constraint plantillas_notificacion_cuerpo_check check (
    length(btrim(cuerpo)) > 0
    and length(cuerpo) <= case canal when 'push' then 240 when 'sms' then 640 else 2000 end
  ),
  constraint plantillas_notificacion_asunto_check check (
    (canal = 'sms' and asunto is null) or (canal <> 'sms' and (asunto is null or length(asunto) <= 120))
  ),
  -- Una sola plantilla por sede, estado y canal; y una sola de la plataforma (null no se repite).
  constraint plantillas_notificacion_unica unique nulls not distinct (establecimiento_id, estado, canal)
);

comment on table plantillas_notificacion is
  'HU-32: texto de cada estado y canal. establecimiento_id null = plantilla de la plataforma (RF-F7-05).';

-- Aislamiento multi-tenant: cada sede lee las suyas y las de la plataforma. Nadie escribe desde el
-- panel ni desde el público: solo el backend con service_role, que filtra por la sede de la sesión.
alter table plantillas_notificacion enable row level security;

drop policy if exists "ver plantillas de notificacion" on plantillas_notificacion;
create policy "ver plantillas de notificacion" on plantillas_notificacion
  for select using (establecimiento_id is null or establecimiento_id = privado.mi_establecimiento());

revoke all on plantillas_notificacion from anon;
revoke insert, update, delete, truncate on plantillas_notificacion from authenticated;
grant select on plantillas_notificacion to authenticated;
grant all on plantillas_notificacion to service_role;

create index if not exists plantillas_notificacion_establecimiento_idx
  on plantillas_notificacion (establecimiento_id) where establecimiento_id is not null;

---------------------------------------------------------------------------
-- RF-F7-05: para cada estado y canal, la plantilla de la sede o, si no la personalizó, la de la
-- plataforma. Trae también el texto de la plataforma para "restaurar" desde el panel.
---------------------------------------------------------------------------
create or replace function public.plantillas_notificacion_de(p_establecimiento_id uuid)
returns table (
  estado            estado_orden,
  canal             text,
  asunto            text,
  cuerpo            text,
  personalizada     boolean,
  updated_at        timestamptz,
  asunto_plataforma text,
  cuerpo_plataforma text
)
language sql stable set search_path = public as $$
  select pl.estado,
         pl.canal,
         coalesce(se.asunto, case when se.id is null then pl.asunto end),
         coalesce(se.cuerpo, pl.cuerpo),
         se.id is not null,
         coalesce(se.updated_at, pl.updated_at),
         pl.asunto,
         pl.cuerpo
  from plantillas_notificacion pl
  left join plantillas_notificacion se
    on se.establecimiento_id = p_establecimiento_id
   and se.estado = pl.estado
   and se.canal = pl.canal
  where pl.establecimiento_id is null
  order by pl.estado, array_position(array['push', 'sms', 'correo'], pl.canal)
$$;

-- Guarda (crea o reemplaza) la plantilla de la sede. Las variables ya las validó el backend.
create or replace function public.guardar_plantilla_notificacion(
  p_establecimiento_id uuid,
  p_estado estado_orden,
  p_canal text,
  p_asunto text,
  p_cuerpo text,
  p_usuario_id uuid
)
returns plantillas_notificacion
language plpgsql set search_path = public as $$
declare
  v_fila plantillas_notificacion;
begin
  if p_establecimiento_id is null then
    raise exception 'La plantilla debe pertenecer a un establecimiento' using errcode = '23514';
  end if;
  insert into plantillas_notificacion (establecimiento_id, estado, canal, asunto, cuerpo, updated_by)
  values (p_establecimiento_id, p_estado, p_canal, case when p_canal = 'sms' then null else p_asunto end, p_cuerpo, p_usuario_id)
  on conflict on constraint plantillas_notificacion_unica do update
    set asunto = excluded.asunto, cuerpo = excluded.cuerpo, updated_at = now(), updated_by = excluded.updated_by
  returning * into v_fila;
  return v_fila;
end $$;

-- Solo el backend (service_role) las llama.
revoke execute on function public.plantillas_notificacion_de(uuid) from public, anon, authenticated;
revoke execute on function public.guardar_plantilla_notificacion(uuid, estado_orden, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.plantillas_notificacion_de(uuid) to service_role;
grant execute on function public.guardar_plantilla_notificacion(uuid, estado_orden, text, text, text, uuid) to service_role;

---------------------------------------------------------------------------
-- Plantillas de la plataforma (RF-F7-05). El correo de "recibido" y "listo" toma el asunto y el
-- saludo de plantillasCorreo.js (HU-46); el SMS de "listo", el aviso de proveedorSms.js (HU-33).
-- Los SMS evitan á, í, ó, ú para no pasar al formato de 70 caracteres por parte (ver HU-32 CA2).
---------------------------------------------------------------------------
insert into plantillas_notificacion (establecimiento_id, estado, canal, asunto, cuerpo) values
  (null, 'recibido', 'push', 'Recibimos tu vehículo',
   'Hola {nombre_cliente}, tu vehículo {placa} ya está con nosotros en {sede} desde las {hora}.'),
  (null, 'recibido', 'sms', null,
   '{sede}: Hola {nombre_cliente}, recibimos tu carro {placa} a las {hora}. Te avisaremos cuando puedas recogerlo.'),
  (null, 'recibido', 'correo', 'Recibimos tu vehículo {placa} en {sede}',
   E'Hola {nombre_cliente}, recibimos tu vehículo {placa} a las {hora}.\n\nTe escribiremos de nuevo cuando esté listo para recoger. Mientras tanto, aprovecha tu tiempo.'),

  (null, 'en_lavado', 'push', 'Tu vehículo está en lavado',
   '{nombre_cliente}, tu vehículo {placa} está {estado} en {sede} desde las {hora}.'),
  (null, 'en_lavado', 'sms', null,
   '{sede}: tu carro {placa} ya se encuentra en lavado ({hora}). Te avisaremos cuando puedas recogerlo.'),
  (null, 'en_lavado', 'correo', 'Tu vehículo {placa} está en lavado',
   E'Hola {nombre_cliente}, tu vehículo {placa} está {estado} en {sede} desde las {hora}.\n\nTe avisaremos cuando esté listo para recoger.'),

  (null, 'secado', 'push', 'Tu vehículo está en secado',
   '{nombre_cliente}, tu vehículo {placa} está {estado}. ¡Ya casi está listo!'),
  (null, 'secado', 'sms', null,
   '{sede}: tu carro {placa} ya se encuentra en secado ({hora}). Muy pronto te avisaremos para que lo recojas.'),
  (null, 'secado', 'correo', 'Tu vehículo {placa} está en secado',
   E'Hola {nombre_cliente}, tu vehículo {placa} está {estado} desde las {hora}.\n\nYa casi está listo: te avisaremos para que lo recojas en {sede}.'),

  (null, 'listo', 'push', '¡Tu vehículo está listo!',
   '{nombre_cliente}, tu vehículo {placa} está listo para recoger en {sede}.'),
  (null, 'listo', 'sms', null,
   '{sede}: tu carro {placa} ya puede ser recogido. El pago se realiza en el establecimiento.'),
  (null, 'listo', 'correo', 'Tu vehículo {placa} está listo para recoger',
   E'Hola {nombre_cliente}, tu vehículo {placa} está listo para recoger en {sede}.\n\nEl pago se realiza en el punto. ¡Gracias por confiar en nosotros!'),

  (null, 'entregado', 'push', '¡Gracias por tu visita!',
   '{nombre_cliente}, entregamos tu vehículo {placa} a las {hora}. ¡Te esperamos pronto en {sede}!'),
  (null, 'entregado', 'sms', null,
   '{sede}: entregamos tu carro {placa} a las {hora}. Gracias por tu visita, {nombre_cliente}.'),
  (null, 'entregado', 'correo', 'Gracias por tu visita a {sede}',
   E'Hola {nombre_cliente}, entregamos tu vehículo {placa} a las {hora}.\n\n¡Gracias por confiar en {sede}! Te esperamos pronto.')
on conflict on constraint plantillas_notificacion_unica do nothing;
