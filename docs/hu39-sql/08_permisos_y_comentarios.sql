-- ===========================================================================
-- HU-39 (ZARU-28) - permisos de ejecucion y comentarios
-- Ejecutar las partes en orden (01 -> 08). Contenido extraido de:
-- supabase/migrations/20261119100000_hu39_consumo_por_plan.sql
-- ===========================================================================

revoke execute on function public.hu39_reservar_consumo(uuid, text, text, date, timestamptz) from public, anon, authenticated;
revoke execute on function public.hu39_confirmar_consumo(uuid, text, text, date, timestamptz) from public, anon, authenticated;
revoke execute on function public.hu39_liberar_consumo(uuid, text, text, date, timestamptz) from public, anon, authenticated;
grant execute on function public.hu39_reservar_consumo(uuid, text, text, date, timestamptz) to service_role;
grant execute on function public.hu39_confirmar_consumo(uuid, text, text, date, timestamptz) to service_role;
grant execute on function public.hu39_liberar_consumo(uuid, text, text, date, timestamptz) to service_role;

comment on table public.consumo_mensual is
  'HU-39: consumo mensual real por establecimiento y canal en America/Bogota. El historial se conserva.';
comment on column public.consumo_mensual.cantidad is
  'HU-39: envÃ­os aceptados por el proveedor. No incluye intentos fallidos ni reservas en curso.';
comment on column public.consumo_mensual.alerta_80_enviada is
  'HU-39 CA1: el aviso del 80 % de SMS ya se generÃ³ en este periodo; evita duplicados concurrentes.';
comment on function public.hu39_reservar_consumo(uuid, text, text, date, timestamptz) is
  'HU-39 CA2: aparta el cupo antes de enviar; con SMS agotado devuelve sin_cupo sin bloquear otros canales.';
comment on function public.hu39_confirmar_consumo(uuid, text, text, date, timestamptz) is
  'HU-39 CA1: contabiliza el envÃ­o aceptado y devuelve una sola vez la alerta del 80 % del mes.';
