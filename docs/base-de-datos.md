# Base de datos (HU-42)

| Campo | Valor |
|---|---|
| Historia | HU-42 · ZARU-49 (Épica 4) |
| Responsable | Samuel Rengifo |
| Motor | PostgreSQL 17 administrado por Supabase (`djutvsulfduzuylvaten`, `us-east-1`) |
| Fuente de verdad del esquema | `supabase/migrations/` |

## 1. Modelo de datos (CA1)

```
establecimientos ◀── perfiles (auth.users)
   │
   ├── clientes ──── vehiculos
   │      │              │
   ├── servicios ─┐      │
   ├── promociones ┴─ promocion_servicios
   │                     │
   ├── ordenes ◀─────────┘ (vehículo, usuario que la crea)
   │      ├── orden_servicios ── servicios
   │      └── historial_estados ── perfiles
   │
   ├── notificaciones ── clientes, ordenes, campanas
   ├── campanas ── promociones (segmento de clientes)
   ├── config_notificaciones (un interruptor por estado del flujo)
   ├── config_canales (preferencia de SMS, correo y push; no bloquea avisos)
   ├── suscripciones_push ── dispositivos de clientes finales (HU-40)
   ├── notificaciones_push_admin ── dispositivo del administrador para la prueba (HU-39/HU-40)
   ├── consumo_mensual ── establecimientos, por mes de Bogotá y canal
   │      ├── consumo_reservas (idempotencia por notificación)
   │      └── consumo_alertas (entrega del 80 % por destinatario)
   └── planes (cupos globales; no pertenece a un establecimiento)
```

| Entidad | Tabla | Pertenencia al establecimiento |
|---|---|---|
| Establecimientos | `establecimientos` | Es el tenant |
| Usuarios del panel | `perfiles` (vinculada a `auth.users`) | `establecimiento_id` |
| Clientes | `clientes` | `establecimiento_id` |
| Vehículos | `vehiculos` | `establecimiento_id` + cliente del mismo establecimiento |
| Servicios | `servicios` | `establecimiento_id` |
| Promociones | `promociones`, `promocion_servicios` | `establecimiento_id`; servicios del mismo establecimiento |
| Órdenes de servicio | `ordenes`, `orden_servicios`, `historial_estados` | `establecimiento_id`; vehículo, servicios y usuarios del mismo establecimiento |
| Notificaciones | `notificaciones` | `establecimiento_id`; cliente y orden del mismo establecimiento |
| Campañas de promociones | `campanas` | `establecimiento_id`; promoción del mismo establecimiento; cada campaña se materializa como notificaciones comerciales (`notificaciones.campana_id`) |
| Configuración de notificaciones | `config_notificaciones` | `establecimiento_id`; una fila por estado del flujo, con `listo` siempre activo |
| Preferencia de canales | `config_canales` | `establecimiento_id` + canal (`sms`, `correo`, `push`); una fila por canal y sede para la prueba de envío, sin bloquear avisos operativos |
| Suscripciones push del cliente | `suscripciones_push` | `establecimiento_id` + cliente del mismo establecimiento; un dispositivo por navegador (HU-40) |
| Dispositivo push del administrador | `notificaciones_push_admin` | `establecimiento_id` + `usuario_id` de la sesión; un dispositivo por administrador para la prueba (HU-39/HU-40) |
| Cupos de los planes | `planes` | Tabla global: no pertenece a un establecimiento; `establecimientos.plan` apunta a su `nombre` |
| Consumo mensual | `consumo_mensual` | `establecimiento_id` + mes (primer día, `America/Bogota`) + canal; el historial nunca se borra |
| Reservas de consumo | `consumo_reservas` | `establecimiento_id` + mes + canal + referencia de la notificación (idempotencia) |
| Alertas del 80 % | `consumo_alertas` | `establecimiento_id` + mes + destinatario (sede o plataforma); una entrega por periodo |
| Política de datos y autorizaciones | `politicas_datos` (versiones inmutables), `consentimientos` (solo inserción) | `consentimientos.establecimiento_id` + cliente del mismo establecimiento; la política es global |
| Auditoría | `auditoria` (solo inserción) | `establecimiento_id` sin llave foránea, para conservar el registro aunque se elimine el establecimiento |

### Integridad entre establecimientos

Además de las llaves foráneas simples, la base impide relacionar datos de establecimientos distintos, aunque el error venga del backend:

- **Llaves foráneas compuestas** `(id, establecimiento_id)`: vehículo → cliente, orden → vehículo, orden → usuario creador, notificación → cliente y notificación → orden.
- **Triggers** en las tablas puente (`orden_servicios`, `promocion_servicios`, `historial_estados`): verifican que ambos extremos sean del mismo establecimiento.
- **Reglas de negocio en la base**: teléfono y placa únicos por establecimiento, autorización de datos obligatoria, precios no negativos, estados válidos y borrado en cascada al eliminar un establecimiento.
- **RLS** habilitado en todas las tablas (ver HU-41).

La tabla `notificaciones` sigue el patrón *outbox* (ADR-03). La lógica de envío, reintentos y canal alterno se implementa en HU-46.

La tabla `config_notificaciones` guarda un interruptor por cada estado del flujo (`recibido`, `en_lavado`, `secado`, `listo`, `entregado`) y por establecimiento (HU-31). Un trigger siembra los cinco estados activos al crear una sede y una restricción `check` impide desactivar `listo`. La función `guardar_config_notificaciones` guarda varios interruptores en una sola transacción y vuelve a validar el estado obligatorio.

La tabla `config_canales` (migración `20261119110000_hu31_preferencias_canales.sql`) guarda una preferencia por sede y canal (`sms`, `correo`, `push`) para la prueba de envío y los avisos no críticos. Un canal sin fila se considera activo; la disponibilidad real del proveedor se consulta en el backend y se muestra junto a la preferencia. La RPC `guardar_preferencias_canales(uuid, jsonb)` es `SECURITY DEFINER`, valida canales y duplicados, guarda todos los cambios en una sola transacción y solo la ejecuta `service_role`: el tenant nunca se toma del cuerpo de la petición. La política RLS de lectura se crea solo si falta y se valida su definición si ya existe; no se deshabilita RLS ni se borran políticas ajenas. Estas preferencias **no** alteran el fallback push → SMS → correo de HU-33 ni la regla de HU-39 de que correo y push nunca bloquean un aviso operativo.

La tabla `campanas` (HU-35) guarda la promoción elegida (con una copia `promocion_snapshot` para que el mensaje no cambie si la promoción se edita), el `segmento` (días sin visita, servicios usados y tipos de vehículo), la hora pedida (`programada_solicitada`) y la ya ajustada al horario de Bogotá (`programada_para`), además de los conteos de destinatarios y exclusiones. La función `segmento_campana` calcula el segmento y devuelve un `motivo` por cliente (`sin_autorizacion`, `limite_semanal`, `sin_correo` o nulo); el backend solo envía a los de motivo nulo. Al materializar, cada destinatario entra en `notificaciones` con `tipo = 'comercial'`, `prioridad = 2` y `campana_id`, y la función `reclamar_comercial` vuelve a validar autorización y límite semanal antes de cada envío.

HU-39 agrega `planes` (catálogo global con los cupos propuestos por DA-12, pendientes de confirmación del PO), `consumo_mensual`, `consumo_reservas` y `consumo_alertas`. El periodo es el primer día del mes en `America/Bogota`. `hu39_reservar_consumo` aparta una unidad antes de llamar al proveedor y es idempotente por `(establecimiento, mes, canal, referencia)`; `hu39_confirmar_consumo` la convierte en envío aceptado y devuelve una sola vez el cruce del 80 % de SMS; `hu39_liberar_consumo` revierte la reserva si el proveedor falló. Las tres RPC bloquean la fila del contador para que varios workers no dupliquen el conteo ni la alerta. `consumo_alertas` guarda una fila por destinatario y mes: si el correo falla, el worker reintenta esa misma fila (máximo 3 intentos) sin crear una alerta nueva. Solo el SMS tiene cupo limitante; correo y push se contabilizan pero no bloquean avisos operativos. `planes` es la única tabla global: `establecimientos.plan` sigue siendo la columna que decide qué cupo aplica. Las FK de las tres tablas de consumo usan `ON DELETE RESTRICT` para conservar el historial si se elimina una sede; las políticas RLS se crean solo si no existen y se valida su definición antes de reemplazarlas, sin deshabilitar RLS ni borrar políticas ajenas. Las RPC son `SECURITY DEFINER` con `search_path = public, pg_temp` y solo las ejecuta `service_role`.

## 2. Migraciones versionadas (CA2)

| Versión | Migración | Contenido |
|---|---|---|
| `20261024025542` | `esquema_inicial` | Tablas, enums, RLS y publicación Realtime de `ordenes` |
| `20261024025550` | `funciones_seguridad_esquema_privado` | Funciones de seguridad en el esquema `privado` |
| `20261024025601` | `indices_llaves_foraneas` | Índices en todas las llaves foráneas |
| `20261028050419` | `hu42_integridad_notificaciones_indices` | Integridad entre establecimientos, `notificaciones` e índices de consultas frecuentes |
| `20261028052257` | `hu41_quitar_llaves_simples_redundantes` | Quita las llaves simples duplicadas por las compuestas (ambigüedad PGRST201 al anidar recursos) |
| `20261028132235` | `hu44_auditoria_y_claims_de_sesion` | Tabla `auditoria` inmutable y hook que agrega rol y establecimiento al token |
| `20261028132259` | `hu44_search_path_auditoria` | Fija el `search_path` de la función de la auditoría (asesor de seguridad) |
| `20261028135510` | `hu51_politica_y_consentimientos` | Política de datos versionada, evidencia inmutable de autorizaciones y registro atómico de cliente + autorización |
| `20261030210000` | `hu03_politica_v1_1_correo_obligatorio` | Publica la versión 1.1 de la política de datos: el correo electrónico pasa a ser obligatorio |
| `20261030220000` | `hu04_busqueda_clientes_sin_tildes` | Extensión `unaccent` y función `buscar_clientes`: búsqueda por nombre, teléfono o placa sin distinguir tildes |
| `20261030230000` | `hu52_eliminar_cliente` | Permite órdenes sin vehículo y agrega `eliminar_cliente`: borra al titular y sus vehículos, y conserva las órdenes entregadas sin datos personales |
| `20261101190000` | `hu13_branding_logos` | Colores de la sede en formato `#RRGGBB` y bucket público `logos` (PNG/JPG, 2 MB) con escritura limitada a la carpeta de cada sede |
| `20261101220000` | `hu12_promociones` | Descripción, condiciones y `activa` en promociones; estado por fecha de Bogotá, vistas `promociones_con_estado` y `promociones_vigentes`, y funciones `guardar_promocion` y `mejor_promocion` |
| `20261102120000` | `hu08_crear_orden` | Función `crear_orden`: registra la orden, sus servicios y el historial en una transacción |
| `20261103090000` | `hu10_estado_secado` | Agrega `secado` al enum `estado_orden` |
| `20261103090100` | `hu10_cambiar_estado` | Función `cambiar_estado`: avance y reversión con historial y evento de dominio |
| `20261103100000` | `hu57_rol_superadmin` | Rol de plataforma `superadmin` |
| `20261103100100` | `hu57_establecimientos_y_pruebas` | Registro de establecimientos, periodo de prueba e invitaciones |
| `20261104031936` | `hu08_corrige_tilde_mensaje` | Corrige el mensaje de una orden ya activa |
| `20261110124608` | `hu17_enlace_publico_sede` | Enlace público por `slug` para el acceso del cliente final |
| `20261110124759` | `hu17_slug_security_definer` | Genera el `slug` con una función `security definer` |
| `20261110230550` | `hu30_autorizacion_notificaciones` | Autorizaciones de avisos y promociones, revocación y enlaces de baja |
| `20261110231500` | `hu31_configuracion_notificaciones` | Tabla `config_notificaciones`, valores por defecto, RLS y función `guardar_config_notificaciones` |
| `20261117120000` | `hu32_plantillas_notificacion` | Tabla `plantillas_notificacion` por sede, estado de la orden y canal (push, SMS, correo) con RLS de lectura por sede; 15 plantillas de la plataforma (`establecimiento_id` nulo) y funciones `plantillas_notificacion_de` y `guardar_plantilla_notificacion` |
| `20261118090000` | `hu35_campanas` | Tabla `campanas` con RLS; `notificaciones.prioridad` y `campana_id`; segmentador `segmento_campana` (privado y público) y revalidación atómica `reclamar_comercial` |
| `20261119100000` | `hu39_consumo_por_plan` | Tablas `planes`, `consumo_mensual`, `consumo_reservas` y `consumo_alertas` con RLS; RPC atómicas e idempotentes `hu39_reservar_consumo`, `hu39_confirmar_consumo` y `hu39_liberar_consumo`; cupos sembrados desde DA-12 |
| `20261119110000` | `hu31_preferencias_canales` | Tabla `config_canales` con RLS de lectura por sede y RPC `guardar_preferencias_canales(uuid, jsonb)` para la prueba de envío; **aplicada en Supabase**, integración 4/4 |
| `20261122120000` | `hu40_suscripciones_push` | Tabla `suscripciones_push` para dispositivos de clientes finales (Web Push/VAPID); un endpoint por cliente |
| `20261122130000` | `hu39_push_administrador` | Tabla `notificaciones_push_admin` para que la prueba de envío verifique push desde el dispositivo del administrador; **pendiente de aplicar** en Supabase |

**Reglas:**

1. Todo cambio de esquema es un archivo nuevo en `supabase/migrations/` con el formato `AAAAMMDDHHMMSS_descripcion.sql`. Una migración aplicada nunca se edita.
2. Se aplica igual en cualquier ambiente:
   - Supabase: `supabase db push`, o la herramienta de migraciones del panel o del MCP.
   - Local o CI: `database/pruebas/aplicar-migraciones.sh`.
3. `database/schema.sql` se regenera desde las migraciones y solo sirve de referencia legible.
   > **Pendiente tras HU-40/HU-39:** las migraciones de planes, consumo, preferencias y dispositivos push del cliente están aplicadas en el proyecto Supabase de pruebas; `20261122130000_hu39_push_administrador.sql` **todavía no está aplicada**. El esquema de referencia `database/schema.sql` sigue desactualizado porque no hay `pg_dump`/`psql`/Docker ni `DATABASE_URL` en el entorno de desarrollo. Para regenerarlo con todas las migraciones aplicadas, ejecutar `DATABASE_URL=… database/pruebas/regenerar-esquema.sh` (o usar las variables `PG*`). El dump incluye los esquemas `public` y `privado` con `--schema-only --no-owner --no-privileges`; no se edita a mano (ADR-02).

**Verificación en un PostgreSQL vacío** (PostgreSQL 16, sin Supabase):

```bash
PGHOST=localhost PGUSER=postgres database/pruebas/aplicar-migraciones.sh zaru_prueba
# Aplicando 20261024025542_esquema_inicial.sql
# Aplicando 20261024025550_funciones_seguridad_esquema_privado.sql
# Aplicando 20261024025601_indices_llaves_foraneas.sql
# Aplicando 20261028050419_hu42_integridad_notificaciones_indices.sql
# OK: 4 migraciones aplicadas en la base zaru_prueba
psql -d zaru_prueba -f database/pruebas/01_integridad.sql
# 23 de 23 pruebas aprobadas
```

`00_entorno_supabase_minimo.sql` simula lo que Supabase ya trae (esquema `auth`, lo mínimo de `storage`, roles y publicación de Realtime) para poder aplicar las migraciones fuera de Supabase.

## 3. Rendimiento con 81 establecimientos (CA3)

### 3.1 Carga de prueba

`database/pruebas/02_carga_81_establecimientos.sql` genera un año de operación con los supuestos del spike HU-58: 40 órdenes diarias por establecimiento, 1 a 2 servicios por orden y 4 cambios de estado por orden.

| Tabla | Filas |
|---|---|
| `establecimientos` | 81 |
| `clientes` | 121.500 |
| `vehiculos` | 162.000 |
| `ordenes` | 1.182.600 |
| `orden_servicios` | 2.217.212 |
| `historial_estados` | 4.728.780 |
| `notificaciones` | 1.182.600 |
| **Tamaño de la base** | **2,0 GB** |

### 3.2 Resultado

`database/pruebas/03_rendimiento.sql` ejecuta cada consulta 7 veces y toma la mediana del tiempo en la base. Se compara el esquema anterior (3 migraciones) con el esquema de esta HU (4 migraciones), con los mismos datos.

| # | HU | Consulta | Antes | Después | Acceso |
|---|---|---|---|---|---|
| 1 | HU-09 | Dashboard: órdenes activas del establecimiento | 1,079 ms | **0,010 ms** | Índice parcial `ordenes_activas_idx` |
| 2 | HU-08 | Vehículo por placa exacta | 0,007 ms | **0,005 ms** | Índice único (establecimiento, placa) |
| 3 | HU-05 | Vehículo por placa parcial | 0,873 ms | **0,182 ms** | Índice trigram `vehiculos_placa_trgm_idx` |
| 4 | HU-04 | Clientes por nombre parcial | 0,698 ms | **0,773 ms** | Índice por establecimiento (no requiere más) |
| 5 | HU-06 | Historial de servicios de un vehículo | 0,054 ms | **0,042 ms** | `ordenes_vehiculo_fecha_idx` |
| 6 | HU-10 | Línea de tiempo de una orden | 0,005 ms | **0,004 ms** | `historial_estados_orden_fecha_idx` |
| 7 | HU-09 | Órdenes de los últimos 7 días (50 por página) | 2,301 ms | **0,023 ms** | `ordenes_establecimiento_fecha_idx` |
| 8 | HU-16 | Servicios más demandados del último mes | 11,776 ms | **3,795 ms** | `ordenes_establecimiento_fecha_idx` |
| 9 | HU-46 | Cola de notificaciones pendientes | — | **0,022 ms** | Índice parcial `notificaciones_cola_idx` |
| 10 | HU-34 | Bitácora de notificaciones del establecimiento | — | **0,023 ms** | `notificaciones_establecimiento_fecha_idx` |

**Conclusión:** con un año de datos de 81 establecimientos, ninguna consulta frecuente supera los 4 ms en la base y ninguna recorre completa una tabla grande. Queda un margen amplio frente al objetivo de 800 ms de respuesta de la API (p95).

Mediciones hechas en PostgreSQL 16 local. En Supabase se suma la latencia de red, del orden de decenas de milisegundos. Las pruebas de carga de punta a punta se hacen en F8.

**Índice descartado:** se probó un índice trigram para buscar clientes por nombre. No mejoró el tiempo (unos 0,7 ms con y sin él), porque el filtro por establecimiento ya reduce la búsqueda a unos 1.500 clientes. Se descartó para no penalizar las escrituras.

## 4. Cómo reproducir las pruebas

```bash
export PGHOST=localhost PGUSER=postgres
database/pruebas/aplicar-migraciones.sh zaru_prueba
psql -d zaru_prueba -f database/pruebas/01_integridad.sql               # CA1
psql -d zaru_prueba -f database/pruebas/02_carga_81_establecimientos.sql  # unos 3 minutos
psql -d zaru_prueba -f database/pruebas/03_rendimiento.sql              # CA3
psql -d zaru_prueba -f database/pruebas/04_seguridad.sql                # HU-44: auditoría, contraseñas y claims
psql -d zaru_prueba -f database/pruebas/05_consentimientos.sql          # HU-51: política y evidencia de autorización
psql -d zaru_prueba -f database/pruebas/06_busqueda_clientes.sql        # HU-04: búsqueda sin tildes por nombre, teléfono o placa
psql -d zaru_prueba -f database/pruebas/07_eliminar_cliente.sql         # HU-52: eliminar los datos de un cliente
psql -d zaru_prueba -f database/pruebas/08_branding.sql                # HU-13: colores #RRGGBB y bucket de logos
psql -d zaru_prueba -f database/pruebas/09_promociones.sql             # HU-12: vigencia, guardado y mejor promoción
psql -d zaru_prueba -f database/pruebas/10_ordenes.sql                 # HU-08: crear orden con servicios e historial
psql -d zaru_prueba -f database/pruebas/11_estado_orden.sql            # HU-10: avanzar, revertir y cerrar una orden
psql -d zaru_prueba -f database/pruebas/12_configuracion_notificaciones.sql  # HU-31: interruptores, "listo" obligatorio y aislamiento
```

Para regenerar el esquema de referencia después de aplicar las migraciones en una base con credenciales:

```bash
DATABASE_URL="postgresql://usuario:clave@host:5432/base" database/pruebas/regenerar-esquema.sh
```

El script valida que exista `pg_dump`, no imprime la URL con credenciales y reemplaza `database/schema.sql` de forma atómica.
Los scripts 02 y 03 son solo para bases locales o de pruebas. Nunca se ejecutan contra producción.
