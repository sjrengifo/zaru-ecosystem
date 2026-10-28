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
| Backend | Node.js, Express | Node ≥ 20 · Express 4 |
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

### Seguridad multi-tenant

- Todas las tablas de negocio incluyen `establecimiento_id`.
- RLS está habilitado en todas las tablas. Las políticas de lectura restringen las filas al establecimiento del usuario autenticado mediante la función `privado.mi_establecimiento()`.
- Las funciones de seguridad residen en el esquema `privado`, que no se expone en la API REST de Supabase.
- Las escrituras se realizan exclusivamente desde el backend con la clave `service_role`, filtrando siempre por el establecimiento del usuario (`req.usuario.establecimientoId`).
- La base impide relacionar datos de establecimientos distintos mediante llaves foráneas compuestas `(id, establecimiento_id)` y triggers en las tablas puente.
- La tabla `ordenes` está publicada en `supabase_realtime` para el dashboard operativo.

### Gestión de cambios

Todo cambio de esquema se escribe como un archivo nuevo en `supabase/migrations/` (`AAAAMMDDHHMMSS_descripcion.sql`) y se aplica igual en cualquier ambiente. Una migración aplicada nunca se edita. En el mismo Pull Request se regenera `database/schema.sql` y se ejecutan las pruebas de `database/pruebas/` (ver [`docs/base-de-datos.md`](docs/base-de-datos.md)).

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
│   │   ├── routes/               Definición de endpoints por recurso
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
├── .github/                      Workflow de CI y plantilla de Pull Request
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
| `FRONTEND_URL` | Origen permitido por CORS |

**`frontend/.env`**

| Variable | Descripción |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave pública (`anon`); el acceso a los datos está protegido por RLS |
| `VITE_API_URL` | URL base de la API (por defecto `http://localhost:4000/api`) |

Los archivos `.env.example` ya incluyen la URL de Supabase y la clave pública. La clave `service_role` se distribuye por un canal privado.

### Ejecución

| Comando | Directorio | Descripción |
|---|---|---|
| `npm run dev` | `backend/` | API en modo desarrollo con recarga automática — `http://localhost:4000` |
| `npm start` | `backend/` | API en modo producción |
| `npm run dev` | `frontend/` | Servidor de desarrollo de Vite — `http://localhost:5173` |
| `npm run build` | `frontend/` | Build de producción en `frontend/dist/` |

Verificación de la API: `GET http://localhost:4000/api/health`.

### Usuarios de prueba

El acceso al panel requiere un usuario en Supabase Auth con un registro asociado en `perfiles` (establecimiento y rol). El procedimiento está documentado al final de [`database/seed.sql`](database/seed.sql).

---

## 7. API

Base: `/api`. Todos los endpoints, salvo `/health`, requieren el encabezado `Authorization: Bearer <JWT de Supabase>`. Las respuestas de error tienen la forma `{ "error": "mensaje" }`.

| Método | Endpoint | Rol | Descripción | Estado |
|---|---|---|---|---|
| GET | `/health` | Público | Estado del servicio | Implementado |
| GET | `/clientes?buscar=` | Admin, Operario | Listar y buscar clientes | Implementado |
| GET | `/clientes/:id` | Admin, Operario | Detalle de cliente con sus vehículos | Implementado |
| POST | `/clientes` | Admin, Operario | Registrar cliente | Implementado |
| PUT | `/clientes/:id` | Admin, Operario | Actualizar cliente | Implementado |
| GET | `/vehiculos?placa=` | Admin, Operario | Listar o buscar vehículos | Pendiente |
| POST | `/vehiculos` | Admin, Operario | Registrar vehículo | Pendiente |
| GET | `/vehiculos/:id/historial` | Admin, Operario | Historial de servicios | Pendiente |
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
- **Integración continua:** GitHub Actions compila el frontend y valida el backend en cada Pull Request hacia `main` o `develop`.

Las convenciones completas están en [`docs/CONTRIBUIR.md`](docs/CONTRIBUIR.md).

### Plan de desarrollo del backend

El backend se desarrolla con **Spec Driven Development**. El roadmap por fases, la especificación, el plan técnico, las tareas y las compuertas de validación de cada fase están en [`specs/backend/`](specs/backend/README.md).

---

## 10. Despliegue

| Componente | Plataforma | Configuración |
|---|---|---|
| Base de datos | Supabase | Desplegada (`us-east-1`) |
| Backend | Render | `render.yaml` (Blueprint), raíz `backend/`, health check `/api/health` |
| Frontend | Vercel | Raíz `frontend/`, build `npm run build`, salida `dist/` |

El despliegue es continuo desde la rama `main`.

### Backend (Render)

1. Crear un servicio desde **New → Blueprint** seleccionando este repositorio.
2. Definir `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `FRONTEND_URL`.

### Frontend (Vercel)

1. Importar el repositorio con **Root Directory** `frontend`.
2. Definir `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_API_URL` (URL de Render seguida de `/api`).
3. Actualizar `FRONTEND_URL` en Render con el dominio asignado por Vercel.

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
