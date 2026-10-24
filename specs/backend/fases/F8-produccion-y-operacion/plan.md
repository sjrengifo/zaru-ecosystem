# F8 — Producción y operación: Plan técnico

## 1. Resumen del enfoque
Se crea un segundo proyecto de Supabase para pruebas (`zaru-staging`) y se separan los servicios de Render por ambiente. GitHub Actions orquesta migraciones y despliegues. El monitoreo combina un servicio externo de disponibilidad, captura de errores y los logs de Render. Las copias de seguridad se hacen con un workflow programado. La escalabilidad se valida con k6 y se documenta la arquitectura objetivo.

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

## 8. Escalabilidad

| Elemento | Entregable |
|---|---|
| `backend/Dockerfile` | Imagen multi-etapa `node:20-alpine`, usuario sin privilegios, `HEALTHCHECK` |
| Sin estado | Verificación de que caché, SSE y worker funcionan con 2 instancias (el worker usa `SKIP LOCKED`; cada instancia tiene su propio bus Realtime) |
| `docs/arquitectura/objetivo-nube.md` | Diagrama en AWS (ALB + ECS Fargate con autoescalado por CPU 60 % y latencia) o GCP (Cloud Run con mín. 1 / máx. 10 instancias), supuestos y costo mensual |
| `tests/carga/escenario-81.js` (k6) | 81 sedes × (consultas de dashboard cada 10 s + 1 cambio de estado/min + 5 seguimientos SSE) durante 15 min |

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El plan gratuito no soporta la carga | El informe de carga documenta límites y el costo del siguiente plan |
| Migración destructiva en producción | Aprobación manual, copia de seguridad previa en el pipeline y prueba en staging |
| Pérdida de la clave de descifrado | Dos custodios y procedimiento de rotación |
