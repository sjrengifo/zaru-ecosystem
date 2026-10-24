# ZARU Ecosystem 🚗💧

Plataforma web (SaaS) para que los car wash gestionen clientes, vehículos, servicios y el estado de cada lavado en tiempo real.

> Proyecto del curso **Gerencia de Proyectos de TI** — Universidad Icesi, 2026-2.
> Backlog en Jira: espacio **Zaru** (Épica `ZARU-1`).

---

## 📌 Índice

1. [¿Cómo está armado el proyecto?](#1-cómo-está-armado-el-proyecto)
2. [Estructura de carpetas](#2-estructura-de-carpetas)
3. [Lo que necesitas instalar](#3-lo-que-necesitas-instalar)
4. [Poner el proyecto a correr (paso a paso)](#4-poner-el-proyecto-a-correr-paso-a-paso)
5. [Cómo trabajamos con Git](#5-cómo-trabajamos-con-git)
6. [¿Dónde va cada historia de usuario?](#6-dónde-va-cada-historia-de-usuario)
7. [Despliegue (publicar en internet)](#7-despliegue-publicar-en-internet)
8. [Problemas comunes](#8-problemas-comunes)
9. [Glosario rápido](#9-glosario-rápido)

---

## 1. ¿Cómo está armado el proyecto?

El proyecto tiene **3 partes**. Todo se escribe en **JavaScript**.

```
  ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
  │   FRONTEND   │ ─────▶ │   BACKEND    │ ─────▶ │ BASE DE DATOS│
  │ React + Vite │ ◀───── │ Node+Express │ ◀───── │   Supabase   │
  └──────────────┘        └──────────────┘        └──────────────┘
   Lo que ve el            La lógica y las          Donde se guardan
   usuario (pantallas)     reglas del negocio       los datos
```

| Parte | ¿Qué es? | Tecnología | ¿Dónde se publica? |
|---|---|---|---|
| **Frontend** | Las pantallas del panel: login, dashboard, clientes, etc. | React + Vite | Vercel |
| **Backend** | Una API que recibe peticiones del frontend y aplica las reglas del negocio | Node.js + Express | Render |
| **Base de datos** | Guarda establecimientos, clientes, vehículos, órdenes… También maneja el login y el tiempo real | Supabase (PostgreSQL) | Supabase |

**¿Por qué así?**
- **Un solo lenguaje (JavaScript):** todo el equipo puede leer y ayudar en cualquier parte.
- **React trabaja con componentes**, igual que en Figma: un botón, una tarjeta, una tabla.
- **Supabase** ya trae login y tiempo real, así no hay que construirlos desde cero.
- Los tres servicios tienen **plan gratuito**.

**Sugerencia de reparto:**
- 🎨 **Equipo DMI** (María José, Nikol, Silvana, Yeliani y Vanessa): diseño en Figma, componentes y páginas en `frontend/`.
- 🛠️ **Equipo SIS** (Samuel y Adri): `backend/`, `database/`, conexión entre partes, revisión de código y despliegue.

---

## 2. Estructura de carpetas

```
zaru-ecosystem/
├── frontend/                 ← 🎨 Pantallas (React)
│   ├── src/
│   │   ├── pages/            ← Una página por pantalla (Login, Dashboard, Clientes…)
│   │   ├── components/       ← Piezas reutilizables (botones, tarjetas, menú…)
│   │   ├── services/         ← Funciones que hablan con el backend
│   │   ├── lib/              ← Conexión con Supabase
│   │   ├── hooks/            ← Lógica reutilizable de React (ej: usuario actual)
│   │   ├── styles/           ← Estilos globales y colores de la marca
│   │   ├── App.jsx           ← Define las rutas (qué página va en qué URL)
│   │   └── main.jsx          ← Punto de entrada (no hace falta tocarlo)
│   ├── .env.example          ← Plantilla de variables de entorno
│   ├── vercel.json           ← Configuración para publicar en Vercel
│   └── package.json
│
├── backend/                  ← 🛠️ API (Node + Express)
│   ├── src/
│   │   ├── routes/           ← Las URLs de la API (ej: /api/clientes)
│   │   ├── controllers/      ← Qué hace cada URL
│   │   ├── middlewares/      ← Filtros: login obligatorio, roles, errores
│   │   ├── config/           ← Conexión con Supabase
│   │   ├── app.js            ← Arma la API
│   │   └── index.js          ← Enciende el servidor
│   ├── .env.example
│   └── package.json
│
├── database/                 ← 🗄️ Base de datos
│   ├── schema.sql            ← Crea todas las tablas y reglas de seguridad
│   └── seed.sql              ← Datos de prueba
│
├── docs/                     ← 📄 Documentación extra
│   └── CONTRIBUIR.md         ← Reglas para trabajar en equipo
│
├── .github/                  ← Revisión automática (CI) y plantilla de Pull Request
│
├── render.yaml               ← Configuración para publicar el backend
└── README.md                 ← Este archivo
```

---

## 3. Lo que necesitas instalar

Solo una vez, en tu computador:

| Programa | Para qué | Descarga |
|---|---|---|
| **Node.js 20 o superior** (versión LTS) | Ejecutar el proyecto | https://nodejs.org |
| **Git** | Guardar y compartir cambios | https://git-scm.com |
| **VS Code** | Editar el código | https://code.visualstudio.com |

Para comprobar que quedó bien, abre una terminal y escribe:

```bash
node -v    # debe mostrar v20.x o mayor
git -v     # debe mostrar una versión
```

**Extensiones recomendadas en VS Code:** ES7+ React snippets, Prettier, ESLint.

---

## 4. Poner el proyecto a correr (paso a paso)

### Paso 1 — Descargar el proyecto

```bash
git clone https://github.com/sjrengifo/zaru-ecosystem.git
cd zaru-ecosystem
```

### Paso 2 — Base de datos (✅ ya está creada)

La base de datos **ya existe en la nube**, no tienes que crear nada. Todos usamos la misma.

| Dato | Valor |
|---|---|
| Proyecto | `zaru` (organización **zaru** en Supabase, plan gratuito) |
| Región | `us-east-1` (Estados Unidos, la más cercana a Colombia) |
| URL | `https://djutvsulfduzuylvaten.supabase.co` |
| Panel | https://supabase.com/dashboard/project/djutvsulfduzuylvaten |

**¿Qué tiene adentro?**
- Las tablas de la Épica 1: establecimientos, perfiles, clientes, vehículos, servicios, promociones y órdenes.
- Seguridad multi-tenant: cada car wash solo ve sus propios datos.
- Tiempo real activado en `ordenes` (para el dashboard).
- Datos de prueba: el car wash **"Car Wash Demo Cali"**, 4 servicios, un cliente y el vehículo de placa **ABC123**.

**¿Necesitas entrar al panel de Supabase?** Pídele a Samuel que te invite a la organización **zaru**.

> ⚠️ **¿Vas a cambiar la base de datos?** No edites tablas a mano desde el panel. Avisa al equipo SIS: cada cambio se guarda también en `database/schema.sql` para que el repositorio y la base siempre coincidan.

### Paso 3 — Backend

```bash
cd backend
npm install                 # instala las librerías (solo la primera vez)
cp .env.example .env        # crea tu archivo de claves
```

Abre `backend/.env`. La URL de Supabase ya viene puesta; solo falta la **`SUPABASE_SERVICE_ROLE_KEY`**.
Pídesela a alguien del equipo SIS por un **canal privado** (o cópiala en Supabase → **Project Settings → API Keys** si tienes acceso). ⚠️ Es secreta: nunca va en el frontend ni en GitHub.

Luego:

```bash
npm run dev
```

✅ Si ves `API de Zaru corriendo en http://localhost:4000`, funciona.
Pruébalo abriendo http://localhost:4000/api/health en el navegador.

### Paso 4 — Frontend (en **otra** terminal)

```bash
cd frontend
npm install
cp .env.example .env
```

¡Listo! El `.env` del frontend ya trae la URL y la clave pública de Supabase, no hay que llenar nada. Luego:

```bash
npm run dev
```

✅ Abre http://localhost:5173 y verás la pantalla de inicio de sesión.

**¿Con qué usuario entro?** Cada integrante necesita su propio usuario:
1. Pídele a alguien con acceso a Supabase que te cree un usuario en **Authentication → Users → Add user** (marcando *Auto Confirm User*).
2. Ese usuario se conecta al car wash de prueba con su rol (`admin` u `operario`), siguiendo las instrucciones del final de `database/seed.sql`.

> 💡 **Recuerda:** backend y frontend corren **al mismo tiempo**, cada uno en su terminal.

> 📘 **¿Por dónde empiezo a programar?** Mira `frontend/src/pages/Clientes.jsx` y `backend/src/controllers/clientes.controller.js`. Son los **ejemplos de referencia**: copien ese mismo patrón para los demás módulos. Las páginas que dicen 🚧 están pendientes y muestran qué historia de Jira les corresponde.

### Comandos útiles

| Comando | Dónde | Qué hace |
|---|---|---|
| `npm run dev` | frontend / backend | Corre el proyecto en modo desarrollo (se recarga solo al guardar) |
| `npm run build` | frontend | Genera la versión final para publicar |
| `npm start` | backend | Corre el backend en modo producción |

---

## 5. Cómo trabajamos con Git

**Regla de oro:** nadie trabaja directo en `main`. Cada historia de usuario va en su propia rama.

```
main      ← versión estable (lo que se publica)
 └── develop   ← donde se junta el trabajo del sprint
      ├── feature/ZARU-2-login
      ├── feature/ZARU-10-dashboard
      └── ...
```

**El ciclo de cada tarea:**

```bash
# 1. Actualizarte antes de empezar
git checkout develop
git pull

# 2. Crear tu rama con la clave de Jira
git checkout -b feature/ZARU-4-registro-clientes

# 3. Trabajar y guardar cambios
git add .
git commit -m "ZARU-4: formulario de registro de clientes"

# 4. Subir tu rama
git push -u origin feature/ZARU-4-registro-clientes
```

5. En GitHub, abrir un **Pull Request** hacia `develop`.
6. Otra persona lo revisa y lo aprueba → se une (*merge*).
7. Al final del sprint, `develop` se une a `main` y se publica.

📖 Más detalles en [`docs/CONTRIBUIR.md`](docs/CONTRIBUIR.md).

---

## 6. ¿Dónde va cada historia de usuario?

Épica 1 — Panel administrativo web (`ZARU-1`):

| Jira | Historia | Frontend (`src/pages/`) | Backend (`src/routes/`) |
|---|---|---|---|
| ZARU-2 | HU-01 Iniciar sesión | `Login.jsx` | `auth` (vía Supabase) |
| ZARU-3 | HU-02 Usuarios operarios | `Usuarios.jsx` | `usuarios.routes.js` |
| ZARU-4 | HU-03 Registrar cliente | `Clientes.jsx` | `clientes.routes.js` |
| ZARU-5 | HU-04 Consultar/editar clientes | `Clientes.jsx` | `clientes.routes.js` |
| ZARU-6 | HU-05 Registrar vehículo | `Vehiculos.jsx` | `vehiculos.routes.js` |
| ZARU-7 | HU-06 Historial de servicios | `Vehiculos.jsx` | `vehiculos.routes.js` |
| ZARU-8 | HU-07 Catálogo de servicios | `Servicios.jsx` | `servicios.routes.js` |
| ZARU-9 | HU-08 Orden de servicio | `Dashboard.jsx` | `ordenes.routes.js` |
| ZARU-10 | HU-09 Dashboard en tiempo real | `Dashboard.jsx` | Supabase Realtime |
| ZARU-11 | HU-10 Actualizar estado | `Dashboard.jsx` | `ordenes.routes.js` |
| ZARU-12 | HU-11 Alertas sin actualizar | `Dashboard.jsx` | — (se calcula en pantalla) |
| ZARU-13 | HU-12 Promociones | `Promociones.jsx` | `promociones.routes.js` |
| ZARU-14 | HU-13 Branding | `Branding.jsx` | `establecimiento.routes.js` |

---

## 7. Despliegue (publicar en internet)

Se hace al final de cada sprint. Los tres servicios son **gratuitos** y se conectan a GitHub, así que cada vez que se actualiza `main` se publica solo.

| Qué | Dónde | Resultado |
|---|---|---|
| Base de datos | Supabase | ✅ Ya está publicada: `https://djutvsulfduzuylvaten.supabase.co` |
| Backend | Render | `https://zaru-api.onrender.com` |
| Frontend | Vercel | `https://zaru.vercel.app` |

### 7.1 Backend en Render

1. Entrar a https://render.com con la cuenta de GitHub.
2. **New → Blueprint** → elegir el repositorio. Render lee `render.yaml` solo.
3. Llenar las variables que pida (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URL`).
4. Copiar la URL que entrega Render (la usaremos en Vercel).

### 7.2 Frontend en Vercel

1. Entrar a https://vercel.com con la cuenta de GitHub.
2. **Add New → Project** → elegir el repositorio.
3. En **Root Directory** escribir `frontend`.
4. En **Environment Variables** agregar:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_URL` → la URL de Render + `/api`
5. **Deploy**. ✅

> ⚠️ Volver a Render y poner en `FRONTEND_URL` la URL de Vercel para que el backend acepte las peticiones.
> ℹ️ En el plan gratuito de Render, el backend "se duerme" tras 15 min sin uso; la primera petición puede tardar ~30 s.

---

## 8. Problemas comunes

| Síntoma | Solución |
|---|---|
| `npm: command not found` | Instalar Node.js y reiniciar la terminal |
| La página carga en blanco | Revisar que `frontend/.env` tenga las claves y reiniciar `npm run dev` |
| Error **CORS** en la consola del navegador | Revisar `FRONTEND_URL` en `backend/.env` |
| `Cannot find module` | Correr `npm install` en esa carpeta |
| Cambié el `.env` y no pasa nada | Detener (`Ctrl + C`) y volver a correr `npm run dev` |
| Conflicto al hacer `git pull` | No borrar nada; pedir ayuda a alguien de Sistemas |

---

## 9. Glosario rápido

- **Frontend:** lo que el usuario ve y toca.
- **Backend / API:** el "cerebro" que recibe pedidos del frontend y responde con datos.
- **Componente:** una pieza de interfaz reutilizable (como un componente de Figma).
- **Ruta:** la dirección de una página (`/clientes`) o de la API (`/api/clientes`).
- **Variable de entorno (`.env`):** archivo con claves secretas. **Nunca se sube a GitHub.**
- **Multi-tenant:** cada car wash solo ve sus propios datos, aunque todos usen la misma plataforma.
- **Rama (branch):** una copia del proyecto para trabajar sin dañar la versión principal.
- **Pull Request (PR):** solicitud para unir tu rama a la principal, con revisión de un compañero.
- **Deploy:** publicar el proyecto en internet.

---

## 👥 Equipo

| Integrante | Carrera | Rol (TSP) |
|---|---|---|
| María José Rosas Cuellar | 🎨 DMI | Team Leader |
| Nikol Salamanca Chantre | 🎨 DMI | Planning Manager |
| Silvana Cuartas Silva | 🎨 DMI | Quality Manager |
| Yeliani Barbosa Guzmán | 🎨 DMI | Test Manager |
| Vanessa Nuñez Torres | 🎨 DMI | Configuration Manager |
| Samuel Rengifo Morales | 🛠️ SIS | Development Manager |
| Adri Jhoanny Martínez Murillo | 🛠️ SIS | Support Manager |

> **DMI:** Diseño de Medios Interactivos · **SIS:** Ingeniería de Sistemas
