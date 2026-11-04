-- HU-08: el mensaje "Este vehículo ya tiene un servicio en curso" quedó con caracteres dañados
-- (veh��culo) al aplicarse la migración 20261102120000. Se reescribe la función con el texto
-- correcto sin cambiar su lógica ni sus permisos (create or replace los conserva).
do $$
declare
  v_oid oid;
  v_def text;
begin
  for v_oid in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'crear_orden'
  loop
    v_def := pg_get_functiondef(v_oid);
    if position(U&'\FFFD' in v_def) > 0 then
      v_def := replace(v_def, U&'veh\FFFD\FFFDculo', 'vehículo');
      v_def := replace(v_def, U&'veh\FFFDculo', 'vehículo');
      execute v_def;
    end if;
  end loop;
end
$$;
