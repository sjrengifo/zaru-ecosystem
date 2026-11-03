-- HU-57: rol de plataforma separado de los roles de cada establecimiento.
-- Se mantiene el enum existente para no romper seeds ni convenciones actuales.
alter type public.rol_usuario add value if not exists 'superadmin';
