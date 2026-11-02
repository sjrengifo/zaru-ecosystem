-- HU-44 (ZARU-51): fija el search_path de la función que protege la auditoría
-- (asesor de seguridad de Supabase: function_search_path_mutable).
alter function privado.impedir_modificacion_auditoria() set search_path = '';
