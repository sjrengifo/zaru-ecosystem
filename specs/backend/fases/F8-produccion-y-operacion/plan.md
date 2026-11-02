# F8 — Producción y operación: Plan técnico

## 1. Resumen del enfoque
Se crea un segundo proyecto de Supabase para pruebas (`zaru-staging`) y se separan los servicios de Render por ambiente. GitHub Actions orquesta migraciones y despliegues. El monitoreo combina un servicio externo de disponibilidad, captura de errores y los logs de Render. Las copias de seguridad se hacen con un workflow programado. La API se publica en Render y el panel en Vercel con despliegue automático desde `main` (HU-47).

## 2. Ambientes

| Ambiente | Base de datos | Backend | Frontend | Rama |
|---|---|---|---|---|
| Desarrollo | Supabase local (Docker) | `npm run dev` | `npm run dev` | `feature/*` |
| Pruebas | Supabase `zaru-staging` | Render `zaru-api-staging` | Vercel preview | `develop` |
| Producción | Supabase `zaru` | Render `zaru-api` | Vercel producción | `main` |

El plan gratuito de Supabase permite dos proyectos por organización: `zaru` y `zaru-staging`.

## 3. Pipeline de despliegue (`.github/workflows/deploy.yml`)

```
push develop ─▶ CI (F0) ─▶ supabase db push (staging) ─▶ deploy hook Render staging ─▶ smoke tests staging
                                         │ falla ─▶ detener + notificar
push main    ─▶ CI ─▶ [environment: produccion, aprobación manual] ─▶ supabase db push (prod)
              ─▶ deploy hook Render prod ─▶ smoke tests prod ─▶ notificar resultado
```

- Secretos por *environment* de GitHub: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD_*`, `RENDER_DEPLOY_HOOK_*`, `BACKUP_AGE_PUBLIC_KEY`.
- Render con `autoDeploy: false`; el despliegue lo dispara el pipeline mediante el *deploy hook*.
- Pruebas de humo (`tests/smoke/`): `/health/ready`, login de un usuario de prueba, `GET /me`, `GET /dashboard`.

## 4. Monitoreo

| Necesidad | Herramienta propuesta | Configuración |
|---|---|---|
| Disponibilidad y latencia | Better Stack Uptime o UptimeRobot (gratuitos) | Monitor de `/api/v1/health/ready` cada 1 min, alerta a 2 fallos |
| Errores | Sentry (plan gratuito) | `@sentry/node` con `requestId` como etiqueta y sin datos personales |
| Logs | Logs de Render + *log drain* a Better Stack Logs | Retención 30 días |
| Métricas de negocio | Endpoint `GET /api/v1/metricas` (rol plataforma) | Cola de notificaciones vencidas, órdenes activas, errores por proveedor |
| Tablero | Better Stack o Grafana Cloud | Disponibilidad, p95, errores, cola |

## 5. Copias de seguridad (`.github/workflows/backup.yml`)

1. `cron: '0 8 * * *'` (3:00 a. m. Bogotá).
2. `supabase db dump --db-url $PROD_DB_URL -f backup.sql` (esquema y datos, incluido `auth`).
3. `age -r $BACKUP_AGE_PUBLIC_KEY -o backup-<fecha>.sql.age backup.sql`.
4. Subir a almacenamiento externo (bucket de Cloudflare R2 o Backblaze B2 gratuito) con regla de vida de 30 días.
5. Notificar fallos al equipo.

La clave privada de `age` se guarda fuera de GitHub, en poder del Configuration Manager y del Development Manager.

`docs/operacion/restauracion.md` documenta: descargar, descifrar, `psql` sobre un proyecto vacío, verificar conteos con `scripts/verificar-restauracion.sql` y registrar el resultado en `docs/operacion/registro-restauraciones.md`.

## 6. Cifrado

| Capa | Medida |
|---|---|
| Tránsito | HTTPS en Render, Vercel y Supabase; `helmet.hsts`; rechazo de HTTP (F1) |
| Reposo | Discos de Supabase cifrados con AES-256 |
| Columna | `clientes.correo` cifrado con Supabase Vault / `pgsodium` (búsqueda por correo no requerida) |
| Copias | `age` (X25519) |
| Secretos | Variables de entorno en Render, Vercel y GitHub Environments; gitleaks en CI |

## 7. Respuesta a incidentes

`docs/operacion/incidentes.md`:

| Paso | Plazo | Responsable |
|---|---|---|
| 1. Detección y registro | Inmediato | Quien lo detecte |
| 2. Contención (rotar claves, revocar sesiones, desactivar usuarios) | ≤ 1 h | Development Manager |
| 3. Evaluación de impacto con `scripts/impacto-incidente.sql` sobre `auditoria` | ≤ 24 h | Support Manager |
| 4. Notificación a establecimientos y titulares afectados | ≤ 72 h | Team Leader |
| 5. Reporte a la SIC (Registro Nacional de Bases de Datos) | Según la normativa vigente | Team Leader |
| 6. Auditoría y lecciones aprendidas | ≤ 15 días | Quality Manager |

Incluye plantillas de comunicación y un simulacro antes del cierre de la fase.

## 8. Publicación en la nube (HU-47)

| Elemento | Entregable |
|---|---|
| `render.yaml` | Blueprint de la API: Node 22, health check `/api/v1/health`, variables secretas con `sync: false` |
| `frontend/vercel.json` | Reescrituras para que las rutas del panel funcionen al recargar |
| `GET /api/v1/health` | Incluye `commit` (`RENDER_GIT_COMMIT`) para saber qué versión está publicada |
| `.github/workflows/humo-produccion.yml` | Tras cada push a `main`: espera a que la API sirva el commit nuevo, comprueba el panel y el CORS entre ambos |
| README, sección 10 | Orden de creación de los servicios y URLs públicas |

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| `FRONTEND_URL` vacía o con `http://` impide arrancar la API en producción | El README define el dominio del panel antes de crear el servicio de Render |
| Migración destructiva en producción | Aprobación manual, copia de seguridad previa en el pipeline y prueba en staging |
| Pérdida de la clave de descifrado | Dos custodios y procedimiento de rotación |
