# Cifrado y gestión de secretos (HU-50)

| Campo | Valor |
|---|---|
| Historia | HU-50 · ZARU-57 (Épica 4) |
| Responsable | Samuel Rengifo |
| Verificado | 28 de octubre de 2026 |

## 1. Cifrado en tránsito (CA1)

| Tramo | Medida | Verificación |
|---|---|---|
| Navegador o app → frontend (Vercel) | HTTPS obligatorio por la plataforma | Vercel redirige HTTP a HTTPS por defecto |
| Panel o app → API (Render) | Render termina TLS. En `NODE_ENV=production`, el middleware `exigirHttps` rechaza con `426 HTTPS_REQUERIDO` cualquier petición que llegue por HTTP (encabezado `X-Forwarded-Proto`). La API envía `Strict-Transport-Security: max-age=31536000; includeSubDomains`. | Pruebas `tests/unit/transporte-y-secretos.test.js` |
| API → Supabase (REST, Auth, Realtime) | HTTPS con TLS 1.3 (`TLS_AES_256_GCM_SHA384`). TLS 1.0 y 1.1 rechazados. `http://` responde `301` a `https://`. | `openssl s_client` y `curl` contra `djutvsulfduzuylvaten.supabase.co` |
| Conexiones a PostgreSQL | `ssl = on`, `ssl_min_protocol_version = TLSv1.2`. Las conexiones de clientes (PostgREST, pooler, panel) usan TLS 1.3. | `pg_stat_ssl` en Supabase |
| Configuración | `SUPABASE_URL` debe empezar por `https://`; en producción `FRONTEND_URL` también. Si no, el servidor no arranca. | `src/config/env.js` |

Los health checks (`/api/health`, `/api/v1/health`) quedan exentos del rechazo por HTTP porque no transportan datos y Render los ejecuta internamente.

## 2. Cifrado en reposo (CA2)

| Capa | Medida |
|---|---|
| Disco de la base de datos | Supabase cifra los datos y las copias de seguridad en reposo con AES-256. Cubre nombres, teléfonos y placas, que deben seguir siendo buscables. |
| Contraseñas | Supabase Auth: bcrypt (`$2a$10$`). Ninguna tabla propia guarda contraseñas (HU-44). |
| Campo `clientes.correo` | Cifrado adicional AES-256-GCM en el backend (`src/shared/cifrado.js`) con la clave `ZARU_CLAVE_CIFRADO`. En la base, en las copias y en el panel de Supabase el valor aparece como `v1:…`. La API lo descifra solo para usuarios autenticados del establecimiento. |

**Por qué solo el correo a nivel de campo.** Nombre, teléfono y placa se buscan por coincidencia parcial (HU-04, HU-05, HU-08). Cifrarlos a nivel de campo impediría esas búsquedas; para ellos aplica el cifrado del disco. El correo no se busca y solo se usa para enviar notificaciones.

**Formato.** `v1:` + base64(IV de 12 bytes, etiqueta GCM de 16 bytes, texto cifrado). El IV es aleatorio en cada escritura y la etiqueta detecta cualquier alteración. El prefijo `v1` permite rotar la clave o el algoritmo más adelante.

**Datos anteriores.** `npm run cifrar:correos` cifra los correos que aún estén en claro. Es idempotente.

## 3. Gestión de secretos (CA3)

| Secreto | Dónde vive | Quién lo usa |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` (clave secreta de Supabase) | Render → Environment del servicio `zaru-api`; `backend/.env` en cada equipo | Backend |
| `ZARU_CLAVE_CIFRADO` | Render → Environment; `backend/.env`. Una clave distinta por ambiente. | Backend |
| `VITE_SUPABASE_ANON_KEY` | Vercel → Environment Variables. Es pública por diseño: los datos los protege RLS. | Frontend |
| Credenciales de prueba del spike | `backend/.env.spike.local` | Pruebas de integración |

**Reglas**

- Ningún secreto se escribe en el código. `.gitignore` excluye `.env` y `.env.*`; solo se versiona `.env.example` con valores vacíos.
- El servidor valida la configuración al arrancar y se niega a iniciar si falta un secreto. El mensaje nombra la variable sin mostrar su valor.
- Hay dos controles en CI:
  - `gitleaks` revisa todo el historial de commits en cada push y en cada PR.
  - Una prueba revisa que ningún archivo versionado contenga claves de Supabase, JWT `service_role`, llaves privadas ni tokens.
- La revisión del historial del 28 de octubre de 2026 no encontró secretos. El único JWT presente es la clave `anon`, que es pública.

**Rotación**

1. Supabase: en Project Settings → API Keys, crear una clave secreta nueva, actualizarla en Render y en los `.env` del equipo, y luego eliminar la anterior.
2. `ZARU_CLAVE_CIFRADO`: no se cambia directamente, porque los correos cifrados con la clave anterior no se podrían leer. Se rota con una versión `v2` que descifre con la clave anterior y vuelva a cifrar con la nueva.
3. Si un secreto se expone (por ejemplo, en un chat o un commit), se rota de inmediato y se registra como incidente (HU-53).
