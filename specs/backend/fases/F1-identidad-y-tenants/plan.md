# F1 — Identidad, tenants y autorización: Plan técnico

## 1. Resumen del enfoque
Un middleware `auth` valida el JWT con Supabase Auth y carga el perfil (rol y establecimiento) desde la base de datos. Un middleware `requireRol` protege rutas por rol y audita los rechazos. Todos los repositorios reciben `ctx.establecimientoId` y lo aplican en cada consulta. Un módulo `usuarios` gestiona operarios usando la API de administración de Supabase Auth, y un módulo `plataforma` da de alta establecimientos.

## 2. Cambios en el modelo de datos
Migración `<ts>_identidad_y_tenants.sql`:

| Objeto | Cambio | RF |
|---|---|---|
| `planes` | Nueva tabla con los planes `basico`, `intermedio`, `empresarial` (seed) | RF-F1-09 |
| `establecimientos` | `slug unique not null`, `direccion`, `telefono`, `plan_id`, `activo` | RF-F1-03, RF-F1-09 |
| `admins_plataforma` | Nueva: `usuario_id uuid primary key references auth.users` | RF-F1-02 |
| `auditoria` | Nueva (ver `03-modelo-de-datos.md`); trigger `impedir_modificacion_auditoria` que bloquea `update` y `delete` | RF-F1-10 |
| Índices | `auditoria (establecimiento_id, created_at desc)`, `auditoria (usuario_id)` | RF-F1-11 |
| RLS | `auditoria`: lectura solo para `admin` del mismo establecimiento (`privado.soy_admin()`) | RF-F1-11 |

## 3. Contrato de API

| Método | Ruta | Rol | Petición | Respuesta | RF |
|---|---|---|---|---|---|
| GET | `/me` | admin, operario | — | `Usuario` + `Establecimiento` | RF-F1-04 |
| GET | `/usuarios` | admin | `?activo=` | `Usuario[]` | RF-F1-07 |
| POST | `/usuarios` | admin | `{ nombre, correo }` | `201 Usuario` | RF-F1-07 |
| PATCH | `/usuarios/{id}` | admin | `{ nombre?, activo? }` | `Usuario` | RF-F1-07, RF-F1-08 |
| GET | `/plataforma/establecimientos` | plataforma | paginación | `Establecimiento[]` | RF-F1-09 |
| POST | `/plataforma/establecimientos` | plataforma | `{ nombre, slug, planId, admin: { nombre, correo } }` | `201 Establecimiento` | RF-F1-09 |
| PATCH | `/plataforma/establecimientos/{id}` | plataforma | `{ nombre?, planId?, activo? }` | `Establecimiento` | RF-F1-09 |
| GET | `/auditoria` | admin | `?usuarioId&accion&desde&hasta` + paginación | `RegistroAuditoria[]` | RF-F1-11 |

## 4. Diseño de módulos

| Componente | Comportamiento |
|---|---|
| `middlewares/auth.js` | 1) Extrae el Bearer; 2) `supabase.auth.getUser(token)`; 3) busca en `admins_plataforma` y luego en `perfiles` (con caché de 60 s); 4) valida `activo` del perfil y del establecimiento; 5) arma `req.ctx`. |
| `middlewares/roles.js` | `requireRol(...roles)`: si no coincide, registra auditoría `denegado` y lanza `SIN_PERMISO`. |
| `middlewares/auditoria.js` | `auditar(accion, recurso)` registra tras una respuesta 2xx en `res.on('finish')`; nunca bloquea la respuesta si la auditoría falla (se registra en el log). |
| `shared/tenant.js` | `conTenant(query, ctx)` agrega `.eq('establecimiento_id', ctx.establecimientoId)`; los repositorios lo usan siempre. |
| `modules/usuarios` | Crea con `supabase.auth.admin.inviteUserByEmail` y luego inserta `perfiles`; si falla el insert, elimina el usuario creado (compensación). |
| `modules/plataforma` | Crea establecimiento + invita a su admin + crea perfil `admin`, con compensación si falla algún paso. |
| `modules/auditoria` | Consulta paginada y filtrada. |

## 5. Reglas de negocio

| Regla | Implementación | Error |
|---|---|---|
| Rol y tenant desde la base | `auth.js` ignora cualquier `establecimiento_id` del cuerpo | — |
| Correo único | Error de Supabase Auth `email_exists` | `409 CONFLICTO` |
| No dejar el tenant sin admin | Conteo de admins activos antes de desactivar | `409 CONFLICTO` |
| Slug válido | `^[a-z0-9-]{3,40}$` y único | `400` / `409` |
| Invalidación de caché | Al editar un usuario se borra su entrada | — |

## 6. Estrategia de pruebas

| Nivel | Qué se prueba |
|---|---|
| Unitarias | `requireRol`, reglas de último administrador, construcción de `ctx` |
| Integración | ESC-F1-01 a ESC-F1-08 con usuarios reales de Supabase local |
| Aislamiento | Se crea `tests/integration/tenant-isolation/`: fixture con dos establecimientos (A y B) y una prueba parametrizada que recorre **todos** los endpoints con id y verifica `404` cruzado. Cada fase futura agrega sus endpoints a la tabla. |
| Seguridad | gitleaks en CI; prueba de rechazo HTTP en modo producción |

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Latencia de `getUser` en cada petición | Caché corta del perfil; evaluar verificación local del JWT con la clave pública del proyecto (JWKS) |
| Usuarios huérfanos en Auth si falla la creación del perfil | Compensación + prueba específica |
| Olvidar el filtro de tenant en un repositorio nuevo | Suite de aislamiento obligatoria (G7) y revisión en PR |
