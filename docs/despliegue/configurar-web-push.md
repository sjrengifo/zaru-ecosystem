# Configurar Web Push (HU-39/HU-40)

Esta guía es para la persona que hace el despliegue del backend. El frontend **no** necesita llaves VAPID:
las obtiene en runtime de `GET /publico/push/clave`.

## 1. Estado local

En este entorno de desarrollo ya se generó un par VAPID real y quedó únicamente en `backend/.env`
(ignorado por git):

```text
PUSH_PROVEEDOR=webpush
VAPID_PUBLIC_KEY=…
VAPID_PRIVATE_KEY=…   # secreto
VAPID_SUBJECT=https://zaru-panel.vercel.app
```

Para ver los valores sin imprimir el secreto en esta guía:

```powershell
# En C:\Users\choco\Desktop\zaru-ecosystem\backend
Get-Content .env | Select-String '^(PUSH_PROVEEDOR|VAPID_PUBLIC_KEY|VAPID_SUBJECT)='
Get-Content .env | Select-String '^VAPID_PRIVATE_KEY='   # solo en la terminal de quien configura
```

Si se van a regenerar llaves nuevas (por ejemplo, porque se perdió la privada), hacerlo con:

```bash
cd backend
node -e "const w=require('web-push');const k=w.generateVAPIDKeys();console.log('VAPID_PUBLIC_KEY='+k.publicKey);console.log('VAPID_PRIVATE_KEY='+k.privateKey)"
```

Usar siempre `VAPID_SUBJECT` con una URL o `mailto:` bajo control del equipo. Al cambiar las llaves,
todas las suscripciones anteriores dejan de ser válidas y los dispositivos deben activarse de nuevo.

## 2. Render (servicio `zaru-api`)

1. Abrir [Render Dashboard](https://dashboard.render.com/) y entrar al servicio **`zaru-api`**.
2. Ir a **Environment → Add Environment Variable** y cargar:

| Key | Value |
|---|---|
| `PUSH_PROVEEDOR` | `webpush` |
| `VAPID_PUBLIC_KEY` | Copiar `VAPID_PUBLIC_KEY` de `backend/.env` |
| `VAPID_PRIVATE_KEY` | Copiar `VAPID_PRIVATE_KEY` de `backend/.env` — **secreto** |
| `VAPID_SUBJECT` | `https://zaru-panel.vercel.app` |

3. **Save Changes**. Render reinicia el servicio automáticamente. Si no reinicia, usar **Manual Deploy → Deploy latest commit**.
4. No subir `backend/.env` a git ni pegar la llave privada en canales abiertos. Enviarla al
   responsable del despliegue por un gestor de secretos o canal privado.

`render.yaml` ya declara estas variables con `sync: false`, así que el blueprint no sobrescribe los
valores cargados en el panel.

## 3. Verificación

En la máquina que tenga las variables configuradas:

```bash
cd backend
npm run verificar:push
```

Debe imprimir `pushConfigurado=true`, `clavePublicaDisponible=true` y `proveedor=webpush`, sin mostrar
la llave privada. Si falla, revisar que `PUSH_PROVEEDOR` sea exactamente `webpush` y que las tres
variables VAPID estén presentes.

En el ambiente desplegado, además:

- `GET /api/v1/publico/push/clave` debe responder `200` con `{ "clavePublica": "…" }`.
- El panel debe mostrar **Push en este dispositivo** dentro de **Notificaciones → Canales de notificación**
  y el service worker `GET /sw-zaru.js` debe responder `200`.

## 4. Base de datos

Antes de activar el registro push del administrador, aplicar en Supabase la migración
`supabase/migrations/20261122130000_hu39_push_administrador.sql`. El SQL listo para pegar está en
[`docs/uat/hu39-uat.md`](../uat/hu39-uat.md), sección **1.1 SQL para Supabase**.

Si la tabla no existe, el sistema degrada con gracia: la prueba reporta `sin_destino` y continúa por
SMS o correo. No se inventa un dispositivo para simular la UAT.
