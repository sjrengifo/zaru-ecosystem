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
   └── notificaciones ── clientes, ordenes
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
| Auditoría | `auditoria` (solo inserción) | `establecimiento_id` sin llave foránea, para conservar el registro aunque se elimine el establecimiento |

### Integridad entre establecimientos

Además de las llaves foráneas simples, la base impide relacionar datos de establecimientos distintos, aunque el error venga del backend:

- **Llaves foráneas compuestas** `(id, establecimiento_id)`: vehículo → cliente, orden → vehículo, orden → usuario creador, notificación → cliente y notificación → orden.
- **Triggers** en las tablas puente (`orden_servicios`, `promocion_servicios`, `historial_estados`): verifican que ambos extremos sean del mismo establecimiento.
- **Reglas de negocio en la base**: teléfono y placa únicos por establecimiento, autorización de datos obligatoria, precios no negativos, estados válidos y borrado en cascada al eliminar un establecimiento.
- **RLS** habilitado en todas las tablas (ver HU-41).

La tabla `notificaciones` sigue el patrón *outbox* (ADR-03). La lógica de envío, reintentos y canal alterno se implementa en HU-46.

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

**Reglas:**

1. Todo cambio de esquema es un archivo nuevo en `supabase/migrations/` con el formato `AAAAMMDDHHMMSS_descripcion.sql`. Una migración aplicada nunca se edita.
2. Se aplica igual en cualquier ambiente:
   - Supabase: `supabase db push`, o la herramienta de migraciones del panel o del MCP.
   - Local o CI: `database/pruebas/aplicar-migraciones.sh`.
3. `database/schema.sql` se regenera desde las migraciones y solo sirve de referencia legible.

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

`00_entorno_supabase_minimo.sql` simula lo que Supabase ya trae (esquema `auth`, roles y publicación de Realtime) para poder aplicar las migraciones fuera de Supabase.

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
```

Los scripts 02 y 03 son solo para bases locales o de pruebas. Nunca se ejecutan contra producción.
