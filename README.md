# ZARU Ecosystem

Plataforma SaaS multi-tenant para la gestión operativa de establecimientos de lavado de vehículos (car wash). Permite a cada establecimiento afiliado administrar clientes, vehículos, servicios y promociones, y hacer seguimiento en tiempo real del estado de cada servicio. El cliente final consulta el avance de su vehículo desde una interfaz web móvil.

Proyecto desarrollado en el curso **Gerencia de Proyectos de TI** — Universidad Icesi, 2026-2, bajo metodología **Scrum**. El product backlog se gestiona en Jira (espacio **Zaru**).

---

## Contenido

1. [Alcance](#1-alcance)
2. [Arquitectura](#2-arquitectura)
3. [Stack tecnológico](#3-stack-tecnológico)
4. [Modelo de datos y seguridad](#4-modelo-de-datos-y-seguridad)
5. [Estructura del repositorio](#5-estructura-del-repositorio)
6. [Configuración del entorno local](#6-configuración-del-entorno-local)
7. [API](#7-api)
8. [Trazabilidad con el backlog](#8-trazabilidad-con-el-backlog)
   - [HU-46, HU-57 y HU-59 (Épica 4)](#hu-46-hu-57-y-hu-59-épica-4)
9. [Flujo de trabajo](#9-flujo-de-trabajo)
10. [Despliegue](#10-despliegue)
11. [Equipo](#11-equipo)

---

## 1. Alcance

El producto se organiza en cuatro épicas:

| Épica | Jira | Descripción |
|---|---|---|
| Épica 1 | `ZARU-1` | Panel administrativo web por establecimiento: gestión de clientes y vehículos, dashboard operativo en tiempo real, promociones y branding por sede. |
| Épica 2 | `ZARU-30` | Interfaz web móvil para el cliente final: acceso sin registro, seguimiento del servicio en tiempo real e historial. |
| Épica 3 | `ZARU-15` | Sistema de notificaciones y comunicación con el cliente. |
| Épica 4 | `ZARU-48` | Arquitectura y backend. |

Este repositorio contiene actualmente la base de la Épica 1 y la infraestructura compartida (autenticación, modelo de datos, API y despliegue).

---

## 2. Arquitectura

```
┌────────────────────┐      HTTPS / JSON      ┌────────────────────┐      SQL      ┌────────────────────┐
│      Frontend      │ ─────────────────────▶ │    Backend (API)   │ ────────────▶ │   Supabase         │
│   React + Vite     │                        │  Node.js + Express │               │   PostgreSQL       │
│   (Vercel)         │ ◀───────────────────── │   (Render)         │ ◀──────────── │   Auth · Realtime  │
└─────────┬──────────┘                        └────────────────────┘               └─────────┬──────────┘
          │                    Autenticación y suscripciones en tiempo real                   │
          └───────────────────────────────────────────────────────────────────────────────────┘
```

- **Frontend:** SPA que consume la API REST para operaciones de negocio y se conecta directamente a Supabase para autenticación (Supabase Auth) y para recibir cambios en tiempo real (Supabase Realtime).
- **Backend:** API REST que valida la sesión del usuario, resuelve su establecimiento y rol, y aplica las reglas de negocio. Es el único componente con permisos de escritura sobre la base de datos (`service_role`).
- **Base de datos:** PostgreSQL gestionado por Supabase, con Row Level Security (RLS) que garantiza el aislamiento entre establecimientos para cualquier acceso directo desde el cliente.

---

## 3. Stack tecnológico

| Capa | Tecnología | Versión |
|---|---|---|
| Frontend | React, React Router, Vite | React 18 · Vite 5 |
| Backend | Node.js, Express | Node ≥ 22 · Express 4 |
| Base de datos | PostgreSQL (Supabase) | — |
| Autenticación | Supabase Auth (JWT) | — |
| Tiempo real | Supabase Realtime (`postgres_changes`) | — |
| Cliente de datos | `@supabase/supabase-js` | 2.x |
| CI | GitHub Actions | — |
| Hosting | Vercel (frontend) · Render (backend) · Supabase (BD) | Planes gratuitos |

---

## 4. Modelo de datos y seguridad

### Instancia

| Atributo | Valor |
|---|---|
| Proyecto Supabase | `zaru` (organización `zaru`) |
| Región | `us-east-1` |
| URL | `https://djutvsulfduzuylvaten.supabase.co` |
| Migraciones (fuente de verdad) | [`supabase/migrations/`](supabase/migrations) |
| Esquema de referencia | [`database/schema.sql`](database/schema.sql) (generado desde las migraciones) |
| Documentación del modelo | [`docs/base-de-datos.md`](docs/base-de-datos.md) |
| Datos de prueba | [`database/seed.sql`](database/seed.sql) |

### Entidades

| Tabla | Descripción | HU |
|---|---|---|
| `establecimientos` | Car wash afiliado (tenant), con logo y colores de marca, plan y estado (`prueba`, `activo`, `pendiente_activacion`, `suspendido`) | HU-13, HU-57 |
| `perfiles` | Usuario del panel vinculado a `auth.users`, con rol `admin`, `operario` o `superadmin` (sin establecimiento) | HU-01, HU-02, HU-57 |
| `clientes` | Cliente final con autorización de tratamiento de datos (Ley 1581 de 2012) | HU-03, HU-04 |
| `vehiculos` | Vehículos por cliente; placa única por establecimiento | HU-05 |
| `servicios` | Catálogo de servicios con precio y duración estimada | HU-07 |
| `promociones`, `promocion_servicios` | Promociones con vigencia y servicios aplicables | HU-12 |
| `ordenes` | Orden de servicio y su estado (`recibido` → `en_lavado` → `listo` → `entregado`) | HU-08, HU-10 |
| `orden_servicios` | Servicios de cada orden con el precio y la duración vigentes al momento de crearla | HU-07, HU-08 |
| `historial_estados` | Trazabilidad de cada cambio de estado (usuario y hora) | HU-10 |
| `notificaciones` | Cola de notificaciones (patrón outbox) por cliente, orden y canal | HU-42, HU-46 |
| `auditoria` | Registro inmutable de accesos permitidos y denegados (usuario, acción, IP, `request_id`) | HU-44, HU-53 |
| `politicas_datos` | Versiones de la política de tratamiento de datos; una versión publicada no se modifica ([texto v1.0](docs/legal/politica-tratamiento-datos-v1.0.md), [texto v1.1](docs/legal/politica-tratamiento-datos-v1.1.md)) | HU-51 |
| `consentimientos` | Evidencia inmutable de cada autorización o revocación: fecha, hora, versión de la política, canal, IP y usuario | HU-51, HU-30 |

### Seguridad multi-tenant

- Todas las tablas de negocio incluyen `establecimiento_id`.
- RLS está habilitado en todas las tablas. Las políticas de lectura restringen las filas al establecimiento del usuario autenticado mediante la función `privado.mi_establecimiento()`.
- Las funciones de seguridad residen en el esquema `privado`, que no se expone en la API REST de Supabase.
- Las escrituras se realizan exclusivamente desde el backend con la clave `service_role`. Los controladores acceden a los datos solo mediante `req.tenant` ([`backend/src/shared/tenant.js`](backend/src/shared/tenant.js)), que aplica automáticamente el filtro por el establecimiento de la sesión, ignora cualquier `establecimiento_id` enviado en la petición y responde `404` igual para un recurso inexistente que para uno de otro establecimiento (HU-41). Una prueba en CI impide consultar la base directamente desde un controlador.
- La base impide relacionar datos de establecimientos distintos mediante llaves foráneas compuestas `(id, establecimiento_id)` y triggers en las tablas puente.
- La tabla `ordenes` está publicada en `supabase_realtime` para el dashboard operativo.

### Cifrado y secretos

Todo el tráfico usa HTTPS: la API rechaza HTTP en producción y Supabase exige TLS 1.2 o superior. Los datos están cifrados en reposo (AES-256) y el correo de los clientes se cifra además a nivel de campo. Los secretos viven solo en el gestor de cada ambiente y en `.env` (ignorado por git), y CI escanea todo el historial con gitleaks. Detalle en [`docs/seguridad/cifrado-y-secretos.md`](docs/seguridad/cifrado-y-secretos.md) (HU-50).

### Gestión de cambios

Todo cambio de esquema se escribe como un archivo nuevo en `supabase/migrations/` (`AAAAMMDDHHMMSS_descripcion.sql`) y se aplica igual en cualquier ambiente. Una migración aplicada nunca se edita. Se aplica en Supabase **antes** del merge a `main`, porque `main` se despliega sola (ver [Despliegue](#10-despliegue)). En el mismo Pull Request se regenera `database/schema.sql` y se ejecutan las pruebas de `database/pruebas/` (ver [`docs/base-de-datos.md`](docs/base-de-datos.md)).

---

## 5. Estructura del repositorio

```
zaru-ecosystem/
├── frontend/                     Aplicación web (React + Vite)
│   ├── src/
│   │   ├── pages/                Vistas por módulo (Login, Dashboard, Clientes, …)
│   │   ├── components/           Componentes compartidos (Layout, RutaProtegida, …)
│   │   ├── services/api.js       Cliente HTTP hacia la API (adjunta el JWT de sesión)
│   │   ├── lib/supabase.js       Cliente de Supabase (Auth y Realtime)
│   │   ├── hooks/                Hooks de React (useSesion, usePerfil, useRol)
│   │   ├── lib/permisos.js       Módulos del panel por rol (HU-59)
│   │   ├── styles/global.css     Estilos globales y tokens de diseño
│   │   ├── App.jsx               Definición de rutas
│   │   └── main.jsx              Punto de entrada
│   ├── tests/                    Pruebas del panel (Vitest + Testing Library)
│   ├── vercel.json               Reescrituras para SPA en Vercel
│   └── .env.example
│
├── backend/                      API REST (Node.js + Express)
│   ├── src/
│   │   ├── routes/               Definición de endpoints por recurso (versión 1)
│   │   ├── schemas/              Validación de entradas con zod
│   │   ├── controllers/          Lógica de negocio por recurso
│   │   ├── middlewares/          Autenticación, autorización por rol/módulo y manejo de errores
│   │   ├── shared/               Tenant, cifrado, permisos (HU-59), correo y notificaciones (HU-46)
│   │   ├── config/supabase.js    Cliente de Supabase con service_role
│   │   ├── app.js                Configuración de Express
│   │   └── index.js              Arranque del servidor
│   ├── tests/                    Pruebas unitarias y de integración (Vitest)
│   └── .env.example
│
├── supabase/migrations/          Migraciones versionadas del esquema (fuente de verdad)
├── database/
│   ├── schema.sql                Esquema de referencia generado desde las migraciones
│   ├── seed.sql                  Datos de prueba
│   └── pruebas/                  Aplicación de migraciones, integridad, carga y rendimiento
│
├── specs/backend/                Plan de desarrollo del backend (Spec Driven Development)
├── docs/                         Convenciones, base de datos y decisiones de arquitectura
├── .github/                      Workflows de CI y prueba de humo, plantilla de Pull Request
└── render.yaml                   Blueprint de despliegue del backend en Render
```

---

## 6. Configuración del entorno local

### Requisitos

- Node.js 22 o superior (el backend usa `--env-file` y `process.loadEnvFile`)
- npm 10 o superior
- Git
- Acceso a las credenciales del proyecto Supabase

### Instalación

```bash
git clone https://github.com/sjrengifo/zaru-ecosystem.git
cd zaru-ecosystem

# Backend
cd backend
npm install
cp .env.example .env

# Frontend
cd ../frontend
npm install
cp .env.example .env
```

### Variables de entorno

**`backend/.env`**

| Variable | Descripción |
|---|---|
| `PORT` | Puerto de la API (por defecto `4000`) |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave `service_role`. **Confidencial**: no debe incluirse en el frontend ni en el repositorio |
| `ZARU_CLAVE_CIFRADO` | Clave de 32 bytes para cifrar datos personales a nivel de campo (`openssl rand -base64 32`). **Confidencial**: una por ambiente; si se pierde, los correos cifrados no se recuperan |
| `FRONTEND_URL` | Origen permitido por CORS y base del enlace de invitación (`/aceptar-invitacion`, HU-57) |
| `CORREO_PROVEEDOR` | HU-46: `consola` (por defecto: no envía, escribe el mensaje en la terminal), `smtp` o `resend` |
| `CORREO_REMITENTE` | Remitente de los correos, por ejemplo `Lavadero Zaru <notificaciones@tudominio.com>` |
| `RESEND_API_KEY` | Obligatoria con `CORREO_PROVEEDOR=resend`. **Confidencial** |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USUARIO`, `SMTP_CLAVE` | Con `CORREO_PROVEEDOR=smtp` (por ejemplo Gmail: `smtp.gmail.com`, `465`, tu correo y una *contraseña de aplicación*). `SMTP_CLAVE` es **confidencial** |

**`frontend/.env`**

| Variable | Descripción |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave pública (`anon`); el acceso a los datos está protegido por RLS |
| `VITE_API_URL` | URL base de la API (por defecto `http://localhost:4000/api/v1`) |

Los archivos `.env.example` ya incluyen la URL de Supabase y la clave pública. La clave `service_role` se distribuye por un canal privado.

### Ejecución

| Comando | Directorio | Descripción |
|---|---|---|
| `npm run dev` | `backend/` | API en modo desarrollo con recarga automática — `http://localhost:4000` |
| `npm start` | `backend/` | API en modo producción |
| `npm run lint:openapi` | `backend/` | Valida el contrato OpenAPI |
| `npm run cifrar:correos` | `backend/` | Cifra los correos de clientes que aún estén en texto plano (HU-50) |
| `npm test` | `backend/` | Pruebas unitarias y de integración (Vitest). Las de integración requieren `.env` y `.env.spike.local`; sin ellos se omiten |
| `npm run test:unit` | `backend/` | Solo pruebas unitarias: no necesitan Supabase ni tocan datos reales |
| `npm run test:integracion` | `backend/` | Solo pruebas de integración contra Supabase (crean y borran sus propios datos de prueba) |
| `npm run dev` | `frontend/` | Servidor de desarrollo de Vite — `http://localhost:5173` |
| `npm test` | `frontend/` | Pruebas del panel (Vitest + Testing Library, sin navegador ni backend) |
| `npm run build` | `frontend/` | Build de producción en `frontend/dist/` |

Verificación de la API: `GET http://localhost:4000/api/v1/health`. Documentación: `http://localhost:4000/api/docs`.

### Usuarios de prueba

El acceso al panel requiere un usuario en Supabase Auth con un registro asociado en `perfiles` (establecimiento y rol). El procedimiento está documentado al final de [`database/seed.sql`](database/seed.sql).

---

## 7. API

Base: `/api/v1`. Todos los endpoints, salvo `/health`, requieren el encabezado `Authorization: Bearer <JWT de Supabase>`.

- **Documentación:** `GET /api/docs` (Swagger UI) y `GET /api/openapi.json`. El contrato vive en [`backend/openapi/openapi.yaml`](backend/openapi/openapi.yaml); una prueba verifica que todas las rutas estén documentadas y CI valida el contrato con `npm run lint:openapi`.
- **Errores:** formato único `{ "error": { "codigo", "mensaje", "detalles"?, "requestId" } }`. Los datos inválidos responden `400 VALIDACION` con un elemento en `detalles` por cada campo a corregir. Cada respuesta incluye `X-Request-Id`.
- **Versiones:** `/api` sin versión sigue funcionando para las aplicaciones ya desplegadas y responde con `Deprecation: true` y `Link: </api/v1>; rel="successor-version"`. Una versión nueva se publica en `/api/v2` sin retirar las anteriores.

| Método | Endpoint | Rol | Descripción | Estado |
|---|---|---|---|---|
| GET | `/health` | Público | Estado del servicio | Implementado |
| GET | `/me` | Admin, Operario, Superadmin | Usuario, rol, establecimiento, módulos permitidos (`permisos`, HU-59) y vencimiento de la sesión | Implementado |
| GET | `/politicas-datos/vigente` | Público | Política de tratamiento de datos vigente (versión y texto) | Implementado |
| GET | `/clientes?buscar=` | Admin, Operario | Listar y buscar clientes por nombre, teléfono o placa | Implementado |
| GET | `/clientes/:id` | Admin, Operario | Detalle de cliente con sus vehículos | Implementado |
| POST | `/clientes` | Admin, Operario | Registrar cliente con autorización de datos y versión de la política (`politicaVersion`) | Implementado |
| PUT | `/clientes/:id` | Admin, Operario | Actualizar cliente | Implementado |
| DELETE | `/clientes/:id` | Admin | Eliminar los datos de un cliente a su solicitud (HU-52) | Implementado |
| GET | `/clientes/:id/consentimientos` | Admin | Evidencia de autorización de tratamiento de datos | Implementado |
| GET | `/vehiculos?placa=` | Admin, Operario | Listar o buscar vehículos | Implementado |
| POST | `/vehiculos` | Admin, Operario | Registrar vehículo asociado a un cliente | Implementado |
| GET | `/vehiculos/:id/historial` | Admin, Operario | Historial de servicios | Implementado |
| GET | `/servicios` | Admin, Operario | Catálogo de servicios | Implementado |
| POST / PUT | `/servicios`, `/servicios/:id` | Admin | Crear, editar o desactivar servicio | Pendiente |
| GET | `/ordenes/activas` | Admin, Operario | Órdenes en curso con el estado de sus correos (HU-46) | Implementado |
| POST | `/ordenes` | Admin, Operario | Registrar ingreso y enviar correo de confirmación (HU-08, HU-46 CA1) | Implementado |
| PATCH | `/ordenes/:id/estado` | Admin, Operario | Avanzar estado; al quedar `listo` envía el correo de aviso (HU-10, HU-46 CA2) | Implementado |
| GET | `/promociones` | Admin | Listar promociones (el operario ya no las ve, HU-59 CA1) | Implementado |
| POST / PUT | `/promociones`, `/promociones/:id` | Admin | Crear o editar promoción | Pendiente |
| GET / POST / PUT | `/usuarios`, `/usuarios/:id` | Admin | Gestión de operarios | Pendiente |
| GET | `/establecimiento` | Admin, Operario | Datos y branding del establecimiento | Implementado |
| PUT | `/establecimiento/branding` | Admin | Actualizar logo y colores | Implementado |
| GET | `/superadmin/establecimientos?estado=&buscar=` | Superadmin | Listado global con días de prueba restantes y administrador inicial (HU-57) | Implementado |
| POST | `/superadmin/establecimientos` | Superadmin | Registrar establecimiento e invitar a su administrador (HU-57 CA1) | Implementado |
| POST | `/superadmin/establecimientos/:id/activar` | Superadmin | Activar o habilitar (HU-57) | Implementado |
| POST | `/superadmin/establecimientos/:id/suspender` | Superadmin | Suspender sin borrar datos, con motivo opcional (HU-57 CA3) | Implementado |
| POST | `/superadmin/establecimientos/:id/reenviar-invitacion` | Superadmin | Reenviar la invitación si aún no se aceptó (HU-57) | Implementado |

Los endpoints pendientes responden `501 Not Implemented` hasta que se desarrolle la historia correspondiente.

---

## 8. Trazabilidad con el backlog

Épica 1 — Panel administrativo web (`ZARU-1`). Total estimado: **55 story points**.

| Jira | Historia | Puntos | MoSCoW | Frontend | Backend |
|---|---|---|---|---|---|
| ZARU-2 | HU-01 Iniciar sesión | 5 | Must | `Login.jsx` | Supabase Auth · `middlewares/auth.js` |
| ZARU-3 | HU-02 Gestionar usuarios operarios | 5 | Must | `Usuarios.jsx` | `usuarios.routes.js` |
| ZARU-4 | HU-03 Registrar cliente | 3 | Must | `Clientes.jsx` | `clientes.routes.js` |
| ZARU-5 | HU-04 Consultar y editar clientes | 2 | Should | `Clientes.jsx` | `clientes.routes.js` |
| ZARU-6 | HU-05 Registrar vehículo | 3 | Must | `Vehiculos.jsx` | `vehiculos.routes.js` |
| ZARU-7 | HU-06 Historial de servicios | 3 | Should | `Vehiculos.jsx` | `vehiculos.routes.js` |
| ZARU-8 | HU-07 Catálogo de servicios | 3 | Must | `Servicios.jsx` | `servicios.routes.js` |
| ZARU-9 | HU-08 Orden de servicio | 5 | Must | `Dashboard.jsx` | `ordenes.routes.js` |
| ZARU-10 | HU-09 Dashboard en tiempo real | 8 | Must | `Dashboard.jsx` | Supabase Realtime |
| ZARU-11 | HU-10 Actualizar estado operativo | 5 | Must | `Dashboard.jsx` | `ordenes.routes.js` |
| ZARU-12 | HU-11 Alertas de vehículos sin actualizar | 3 | Could | `Dashboard.jsx` | — |
| ZARU-13 | HU-12 Promociones | 5 | Should | `Promociones.jsx` | `promociones.routes.js` |
| ZARU-14 | HU-13 Branding de la sede | 5 | Should | `Branding.jsx` | `establecimiento.routes.js` |

### HU-46, HU-57 y HU-59 (Épica 4)

Épica 4 — Arquitectura y backend (`ZARU-48`).

| Jira | Historia | Puntos | MoSCoW | Frontend | Backend | Pruebas |
|---|---|---|---|---|---|---|
| ZARU-53 | HU-46 Enviar notificaciones por correo al cliente | 3 | Must | `Dashboard.jsx`, `FormularioIngreso.jsx`, `lib/avisoCorreo.js` | `ordenes.controller.js`, `shared/notificaciones.js`, `shared/correo.js`, `shared/plantillasCorreo.js` | `backend/tests/unit/{correo,notificaciones,ordenes,tenant-detalle}.test.js`, `frontend/tests/dashboard-correo.test.jsx` |
| ZARU-63 | HU-57 Registrar y activar un establecimiento afiliado | 5 | Should | `Superadmin.jsx`, `FormularioEstablecimiento.jsx`, `lib/establecimientos.js` | `superadmin.controller.js`, `superadmin.routes.js`, `superadmin.schemas.js` | `backend/tests/unit/superadmin.*.test.js`, `backend/tests/integration/superadmin.test.js`, `frontend/tests/superadmin.test.jsx` |
| ZARU-65 | HU-59 Mostrar a cada usuario solo lo que le corresponde según su rol | 3 | Should | `lib/permisos.js`, `RutaProtegida.jsx` (`RequiereModulo`), `Layout.jsx`, `App.jsx` | `shared/permisos.js`, `requiereModulo` en `middlewares/auth.js`, `routes/index.js`, `me.controller.js` | `backend/tests/unit/permisos-por-rol.test.js`, `frontend/tests/permisos-rutas.test.jsx` |

#### HU-46 · Correos al cliente

Cómo se cumplen los criterios:

- **CA1 — correo al registrar el ingreso.** `POST /ordenes` crea la orden en `recibido` con los servicios activos elegidos, guarda precio y duración del momento (`orden_servicios`), registra el primer `historial_estados` y envía al cliente el correo *"Recibimos tu vehículo ABC123"* con la lista de servicios y el total. En el panel: botón **+ Ingresar vehículo** del Dashboard → buscar placa → marcar servicios → **Registrar ingreso**.
- **CA2 — correo al pasar a "Listo".** `PATCH /ordenes/:id/estado` solo permite avanzar al estado siguiente (`recibido → en_lavado → listo → entregado`), deja el historial con usuario y hora y, al quedar `listo`, envía *"Tu vehículo ABC123 está listo para recoger"* con el valor a pagar. En el panel: botón **Marcar como listo** en la tarjeta (un clic).
- **CA3 — nunca bloquea al operario.** El correo se envía **en segundo plano, después de responder** a la petición. Si el cliente no tiene correo, pidió no recibir avisos (`consentimientos` `notificaciones_servicio` revocado) o el proveedor falla, la orden queda guardada igual y la respuesta solo informa `notificacion: { estado: "omitida" | "error", motivo }`. El panel lo muestra como advertencia ("El cliente no tiene correo registrado: avísale por otro medio"), no como error.

Diseño:

- **Patrón outbox** sobre la tabla `notificaciones` (ya existía desde HU-42): cada correo queda como fila `pendiente → enviando → enviada | fallida`, con intentos, último error y `clave_dedupe = <orden>:<evento>:correo` para que el mismo aviso nunca salga dos veces.
- **Reintentos:** hasta 3 intentos (esperas de 2 s y 4 s) con tiempo máximo de 10 s por intento. La política completa de 1-2-4 minutos y canal alterno es de HU-33 (F6).
- **Seguridad:** el destino se guarda cifrado igual que el correo del cliente (HU-50), los logs muestran el correo enmascarado (`l***@correo.com`), las plantillas escapan todo dato de la base y usan el color y logo de la sede (HU-13). Todo acceso a datos pasa por `req.tenant` (HU-41).
- **Proveedores** (`CORREO_PROVEEDOR`): `consola` en desarrollo y pruebas, `smtp` (nodemailer) o `resend`.
- El tablero muestra en cada tarjeta el estado del correo (*Correo enviado · ingreso*, *Correo no enviado · listo*, *Sin correo*) y se actualiza solo unos segundos después del envío.
- **No requiere migraciones nuevas.** Para HU-46 se implementaron también, en lo necesario, los endpoints de órdenes de HU-08, HU-09 y HU-10 que respondían `501`. Queda pendiente de HU-12 CA3 aplicar la promoción vigente al total (hoy `descuento = 0`).

#### HU-57 · Mejoras al registro y activación de establecimientos

- **Interfaz nueva del panel de plataforma** (`/superadmin`): barra superior con la sesión, tarjetas de resumen por estado que también filtran el listado, buscador por nombre o correo del administrador (sin distinguir tildes), aviso de pruebas que vencen en 3 días o menos, columna de administrador con *Invitación pendiente* / *Cuenta activa*, y vista adaptada a celular.
- **Registro en ventana modal** con validación por campo antes de enviar, planes como tarjetas con descripción, periodo de prueba con control deslizante (14 a 30 días) y la fecha en que terminará; los errores que devuelve la API (por ejemplo, correo ya registrado) se muestran junto al campo.
- **Confirmación con ventana modal** (en lugar de `window.confirm`) que explica el efecto: al suspender, los usuarios no pueden entrar pero los datos se conservan (CA3); permite registrar un **motivo** que queda en la auditoría.
- **Reenviar invitación** (`POST /superadmin/establecimientos/:id/reenviar-invitacion`) cuando el administrador aún no la aceptó.
- **Reglas de transición en la API:** solo se activa desde `prueba`, `pendiente_activacion` o `suspendido`, y solo se suspende desde `prueba`, `activo` o `pendiente_activacion` (`409` en otro caso). La actualización exige el estado leído, así dos superadministradores no se pisan.
- **Auditoría** de registro, activación, suspensión y reenvío (`superadmin.establecimiento.*`).
- El listado acepta `?estado=` y `?buscar=` e incluye `dias_restantes` y `administrador { nombre, correo, invitacionAceptada }`.
- **Corrección:** `/aceptar-invitacion` ya no se muestra dentro del menú del panel; el administrador invitado define su contraseña en una pantalla propia.
- Las migraciones de HU-57 (`20261103100000_hu57_rol_superadmin.sql` y `20261103100100_hu57_establecimientos_y_pruebas.sql`) deben estar aplicadas en Supabase (ver [Migraciones](#migraciones-de-base-de-datos-antes-del-merge-a-main)). Para crear el primer superadministrador: crear el usuario en Supabase Auth y ejecutar `npm run configurar:superadmin` en `backend/` con `ZARU_SUPERADMIN_USER_ID` y `ZARU_SUPERADMIN_NOMBRE`.

#### HU-59 · Cada rol ve solo lo suyo

Una sola matriz de permisos en [`backend/src/shared/permisos.js`](backend/src/shared/permisos.js):

| Módulo | Admin | Operario | Superadmin |
|---|:---:|:---:|:---:|
| Dashboard (órdenes y estados) | ✓ | ✓ | |
| Clientes | ✓ | ✓ | |
| Vehículos | ✓ | ✓ | |
| Servicios (configuración) | ✓ | solo lectura del catálogo para registrar ingresos | |
| Promociones | ✓ | | |
| Usuarios | ✓ | | |
| Branding | ✓ | | |
| Reportes (cuando exista) | ✓ | | |
| Administración de la plataforma | | | ✓ |

- **CA1:** el operario ve en el menú solo *Dashboard, Clientes y Vehículos*. La API le niega promociones, usuarios, configuración de servicios y branding.
- **CA2:** el administrador ve todos los módulos, siempre con los datos de su establecimiento (aislamiento HU-41).
- **CA3:** si alguien escribe a mano una dirección que no le corresponde (por ejemplo `/promociones` siendo operario, o `/superadmin` siendo administrador), el panel no muestra la página, lo devuelve a su inicio y muestra *"No tienes acceso a esa sección con tu rol"*. La API además responde `403 SIN_PERMISO` y registra el intento en la auditoría (`requiereModulo`).
- `GET /me` devuelve `permisos: { modulos, inicio }`; el panel arma el menú con esa lista y comparte el perfil con todas las páginas (`usePerfil`), así ya no se consulta `/me` una vez por página.
- **Cambio de comportamiento:** antes el operario podía consultar `GET /promociones`; ahora recibe `403` (se actualizó la prueba de integración de HU-12).

#### Cómo ejecutar el backend, el frontend y las pruebas

1. **Instalar dependencias** (una vez, o cuando cambie `package.json`):

   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

2. **Configurar las variables:** copiar `backend/.env.example` a `backend/.env` y `frontend/.env.example` a `frontend/.env`, y llenar `SUPABASE_SERVICE_ROLE_KEY` y `ZARU_CLAVE_CIFRADO` (ver [Variables de entorno](#variables-de-entorno)). Para ver los correos sin enviarlos deja `CORREO_PROVEEDOR=consola`: aparecerán en la terminal del backend como `[correo:consola] Para l***@correo.com · Recibimos tu vehículo…`. Para enviarlos de verdad usa `smtp` o `resend`.

3. **Levantar el backend** (terminal 1) — queda en `http://localhost:4000`, documentación en `http://localhost:4000/api/docs`:

   ```bash
   cd backend
   npm run dev
   ```

4. **Levantar el frontend** (terminal 2) — queda en `http://localhost:5173`:

   ```bash
   cd frontend
   npm run dev
   ```

5. **Ejecutar las pruebas:**

   ```bash
   # Backend: solo unitarias (no tocan Supabase)
   cd backend
   npm run test:unit

   # Backend: unitarias + integración (las de integración necesitan backend/.env y backend/.env.spike.local)
   npm test

   # Validar el contrato OpenAPI
   npm run lint:openapi

   # Frontend: pruebas del panel
   cd ../frontend
   npm test
   ```

6. **Probar a mano los criterios de aceptación:**
   - **HU-46:** entra como administrador u operario → *Dashboard* → **+ Ingresar vehículo** → busca la placa de un vehículo cuyo cliente tenga correo → elige servicios → **Registrar ingreso**: llega (o aparece en la consola) el correo de ingreso y la tarjeta muestra *Correo enviado · ingreso*. Pulsa **Pasar a lavado** y luego **Marcar como listo**: llega el correo de listo. Repite con un cliente sin correo: el estado cambia igual y se muestra la advertencia.
   - **HU-57:** entra como superadministrador → **+ Registrar establecimiento** → el administrador recibe la invitación y define su contraseña en `/aceptar-invitacion`. Suspende el establecimiento: sus usuarios reciben *"El establecimiento está suspendido"* al iniciar sesión; habilítalo y vuelven a entrar con sus datos intactos.
   - **HU-59:** entra como operario: el menú solo muestra Dashboard, Clientes y Vehículos; escribe `http://localhost:5173/promociones` en la barra de direcciones: vuelves al Dashboard con el aviso de acceso.

---

## 9. Flujo de trabajo

- **Ramas:** `main` (versión desplegada), `develop` (integración del sprint) y `feature/ZARU-<n>-<descripcion>` por historia de usuario.
- **Commits:** prefijados con la clave de Jira, por ejemplo `ZARU-4: registro de clientes`.
- **Pull Requests:** hacia `develop`, con al menos una aprobación y verificación de los criterios de aceptación. Al cierre de cada sprint, `develop` se integra en `main`.
- **Integración continua:** GitHub Actions ejecuta las pruebas y el build del frontend, valida el backend y su contrato OpenAPI, ejecuta sus pruebas y escanea secretos con gitleaks en cada Pull Request hacia `main` o `develop`.

Las convenciones completas están en [`docs/CONTRIBUIR.md`](docs/CONTRIBUIR.md).

### Plan de desarrollo del backend

El backend se desarrolla con **Spec Driven Development**. El roadmap por fases, la especificación, el plan técnico, las tareas y las compuertas de validación de cada fase están en [`specs/backend/`](specs/backend/README.md).

---

## 10. Despliegue

| Componente | Plataforma | Configuración |
|---|---|---|
| Base de datos | Supabase | Desplegada (`us-east-1`) |
| Backend | Render | `render.yaml` (Blueprint), raíz `backend/`, health check `/api/v1/health` |
| Frontend | Vercel | Raíz `frontend/`, build `npm run build`, salida `dist/` |

El despliegue es continuo desde la rama `main` (HU-47, `ZARU-54`): Render y Vercel publican cada merge sin pasos manuales, y el workflow `humo-produccion.yml` verifica después que la API sirva el commit nuevo y que el panel responda.

| Servicio | URL pública |
|---|---|
| API | https://zaru-api-i5s5.onrender.com/api/v1 · estado: [`/api/v1/health`](https://zaru-api-i5s5.onrender.com/api/v1/health) · documentación: [`/api/docs`](https://zaru-api-i5s5.onrender.com/api/docs) |
| Panel | https://zaru-panel.vercel.app |

### Migraciones de base de datos: antes del merge a `main`

`main` se publica sola en Render y Vercel, pero la base de datos **no**: Supabase no aplica las migraciones de `supabase/migrations/` por su cuenta. Si un Pull Request trae una migración, hay que aplicarla en Supabase **antes** de integrarlo en `main`; si no, la API publicada usaría tablas, columnas o buckets que todavía no existen.

Pasos desde el SQL Editor de Supabase (ejemplo con la migración de HU-13, `20261101190000_hu13_branding_logos.sql`):

1. Entrar a [supabase.com/dashboard](https://supabase.com/dashboard), abrir el proyecto de Zaru y, en el menú izquierdo, **SQL Editor → New query**.
2. Si la migración trae una consulta de revisión previa en su encabezado, ejecutarla primero. Para HU-13:

   ```sql
   select id, nombre, color_primario, color_secundario from establecimientos
   where color_primario !~ '^#[0-9A-Fa-f]{6}$' or color_secundario !~ '^#[0-9A-Fa-f]{6}$';
   ```

   Si devuelve filas, detenerse y decidir con el equipo cómo corregir esos datos.
3. Abrir el archivo de la migración en el repositorio, copiar **todo** su contenido, pegarlo en una consulta nueva y pulsar **Run**. Debe responder *Success. No rows returned*. Si falla, Supabase revierte la consulta completa y no queda nada a medias.
4. Registrar la migración como aplicada, para que `supabase db push` no intente repetirla:

   ```sql
   insert into supabase_migrations.schema_migrations (version, name)
   values ('20261101190000', 'hu13_branding_logos');
   ```

5. Comprobar el resultado. Para HU-13: **Storage** muestra el bucket `logos` como *Public*, y **Database → Tables → establecimientos → Constraints** muestra los dos checks de color.

Después se integra el Pull Request en `main`.

### Requisito previo: `main` actualizada

Render y Vercel construyen desde `main`. Antes de crear los servicios, `develop` debe estar integrada en `main` (PR `develop → main`); de lo contrario Render lee un `render.yaml` antiguo, con el health check en `/api/health` y sin `ZARU_CLAVE_CIFRADO`.

### Orden de creación

El backend valida sus variables al arrancar (`backend/src/config/env.js`): en producción `FRONTEND_URL` es obligatoria y debe empezar por `https://`, así que no puede quedar vacía mientras se crea el panel. Como cada servicio necesita la URL del otro, se define primero el nombre del proyecto en Vercel y se usa su dominio previsto.

1. **Elegir el dominio del panel.** El dominio de producción de Vercel es `https://<nombre-del-proyecto>.vercel.app` (por ejemplo `https://zaru-panel.vercel.app`). Verificar en el navegador que no esté ocupado.
2. **Backend en Render.** **New → Blueprint**, repositorio y rama `main`. Render toma `render.yaml` y pide las variables marcadas `sync: false`:

   | Variable | Valor |
   |---|---|
   | `SUPABASE_URL` | Supabase → Project Settings → API |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API (secreta) |
   | `ZARU_CLAVE_CIFRADO` | `openssl rand -base64 32`; si ya hay correos cifrados, la misma clave con la que se cifraron |
   | `FRONTEND_URL` | Dominio del paso 1, con `https://` y sin `/` final |
   | `CORREO_PROVEEDOR`, `CORREO_REMITENTE`, `RESEND_API_KEY` | HU-46: `resend` con su clave y un remitente de dominio verificado (o `smtp` con `SMTP_*`). Con `consola` no se envían correos |

   `NODE_ENV=production` y `NODE_VERSION=22` ya vienen en el Blueprint. Al terminar, comprobar `https://<servicio>.onrender.com/api/v1/health`.
3. **Panel en Vercel.** **Add New → Project**, mismo repositorio, nombre del paso 1 y **Root Directory** `frontend`. Variables:

   | Variable | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | Supabase → Project Settings → API |
   | `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API (pública) |
   | `VITE_API_URL` | URL de Render seguida de `/api/v1` |

   Si Vercel asigna un dominio distinto al previsto, corregir `FRONTEND_URL` en Render y redesplegar el backend.
4. **Supabase Auth.** Authentication → URL Configuration: `Site URL` con el dominio del panel y el mismo dominio en `Redirect URLs` (recuperación de contraseña).
5. **Prueba de humo.** En GitHub → Settings → Secrets and variables → Actions → **Variables**, crear `URL_API_PRODUCCION` (URL de Render, sin `/api/v1`) y `URL_PANEL_PRODUCCION` (dominio del panel). Ejecutar el workflow *Prueba de humo en producción* manualmente para confirmar.

En el plan gratuito de Render el servicio se suspende tras 15 minutos de inactividad; la primera petición posterior puede tardar alrededor de 30 segundos.

---

## 11. Equipo

| Integrante | Programa | Rol TSP |
|---|---|---|
| María José Rosas Cuellar | Diseño de Medios Interactivos | Team Leader |
| Nikol Salamanca Chantre | Diseño de Medios Interactivos | Planning Manager |
| Silvana Cuartas Silva | Diseño de Medios Interactivos | Quality Manager |
| Yeliani Barbosa Guzmán | Diseño de Medios Interactivos | Test Manager |
| Vanessa Nuñez Torres | Diseño de Medios Interactivos | Configuration Manager |
| Samuel Rengifo Morales | Ingeniería de Sistemas | Development Manager |
| Adri Jhoanny Martínez Murillo | Ingeniería de Sistemas | Support Manager |
