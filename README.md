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
| `establecimientos` | Car wash afiliado (tenant), con logo y colores de marca | HU-13 |
| `perfiles` | Usuario del panel vinculado a `auth.users`, con rol `admin` u `operario` | HU-01, HU-02 |
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
│   │   ├── hooks/                Hooks de React (useSesion)
│   │   ├── styles/global.css     Estilos globales y tokens de diseño
│   │   ├── App.jsx               Definición de rutas
│   │   └── main.jsx              Punto de entrada
│   ├── vercel.json               Reescrituras para SPA en Vercel
│   └── .env.example
│
├── backend/                      API REST (Node.js + Express)
│   ├── src/
│   │   ├── routes/               Definición de endpoints por recurso (versión 1)
│   │   ├── schemas/              Validación de entradas con zod
│   │   ├── controllers/          Lógica de negocio por recurso
│   │   ├── middlewares/          Autenticación, autorización por rol y manejo de errores
│   │   ├── config/supabase.js    Cliente de Supabase con service_role
│   │   ├── app.js                Configuración de Express
│   │   └── index.js              Arranque del servidor
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

- Node.js 20 o superior
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
| `FRONTEND_URL` | Origen permitido por CORS |

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
| `npm run dev` | `frontend/` | Servidor de desarrollo de Vite — `http://localhost:5173` |
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
| GET | `/me` | Admin, Operario | Usuario, rol, establecimiento y vencimiento de la sesión | Implementado |
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
| GET | `/ordenes/activas` | Admin, Operario | Órdenes en curso para el dashboard | Pendiente |
| POST | `/ordenes` | Admin, Operario | Crear orden de servicio | Pendiente |
| PATCH | `/ordenes/:id/estado` | Admin, Operario | Avanzar estado de la orden | Pendiente |
| GET | `/promociones` | Admin, Operario | Listar promociones | Pendiente |
| POST / PUT | `/promociones`, `/promociones/:id` | Admin | Crear o editar promoción | Pendiente |
| GET / POST / PUT | `/usuarios`, `/usuarios/:id` | Admin | Gestión de operarios | Pendiente |
| GET | `/establecimiento` | Admin, Operario | Datos y branding del establecimiento | Implementado |
| PUT | `/establecimiento/branding` | Admin | Actualizar logo y colores | Pendiente |

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

---

## 9. Flujo de trabajo

- **Ramas:** `main` (versión desplegada), `develop` (integración del sprint) y `feature/ZARU-<n>-<descripcion>` por historia de usuario.
- **Commits:** prefijados con la clave de Jira, por ejemplo `ZARU-4: registro de clientes`.
- **Pull Requests:** hacia `develop`, con al menos una aprobación y verificación de los criterios de aceptación. Al cierre de cada sprint, `develop` se integra en `main`.
- **Integración continua:** GitHub Actions compila el frontend, valida el backend, ejecuta sus pruebas y escanea secretos con gitleaks en cada Pull Request hacia `main` o `develop`.

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
