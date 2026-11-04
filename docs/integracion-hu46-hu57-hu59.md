# Integración selectiva de HU-46, HU-57 y HU-59

Este proyecto parte de la versión `zaru-ecosystem` y conserva sus módulos existentes. La carpeta `zaru-ecosystem-HU46-HU57-HU59` se usó como fuente de las implementaciones solicitadas, no como reemplazo completo.

## HU-46 — Notificaciones por correo

- Se integró el patrón outbox en `backend/src/shared/notificaciones.js`.
- Los eventos de ingreso y vehículo listo crean una fila pendiente en `notificaciones`.
- El envío ocurre en segundo plano, con un máximo de tres intentos y tiempo máximo por intento.
- Se incorporaron plantillas HTML/texto y proveedores `consola`, `smtp` y `resend`.
- El controlador de órdenes conserva la creación transaccional y el cambio de estado existentes.
- El dashboard informa si el correo está pendiente, fue omitido o no pudo prepararse.

Para desarrollo local se usa `CORREO_PROVEEDOR=consola`. Para enviar correos reales, configura SMTP o Resend en `backend/.env` y en las variables del servicio de producción.

## HU-57 — Administración de establecimientos

- Se integró el panel de superadministración con filtros, indicadores, periodo de prueba y datos del administrador.
- Se incorporó el formulario de registro y el envío/reenvío de invitaciones.
- Se conservaron las migraciones HU-57 que ya existían en el proyecto actual.

## HU-59 — Permisos por rol

- `backend/src/shared/permisos.js` centraliza los módulos por rol.
- `GET /me` devuelve los permisos.
- `requiereModulo` protege los prefijos de API correspondientes.
- El frontend usa esos permisos para construir el menú y proteger la navegación directa.
- Se conserva el acceso de lectura del catálogo de servicios para el operario, porque lo necesita al registrar un ingreso.

## Archivos de entorno y Git

- No se incluyeron `.env`, `.env.spike.local`, `.git` ni `node_modules`.
- Se conservaron los `.env.example`. Copia/actualiza tus variables locales sin compartir credenciales.
- El ZIP es un paquete de archivos del proyecto, no una copia del historial Git. Para integrarlo en tu repositorio, conserva la carpeta `.git` que ya tienes y copia encima los archivos del ZIP.

## Verificaciones realizadas durante la integración

- Sintaxis JavaScript/JSX: validada con parser.
- `node --check` del backend: correcto.
- Contrato OpenAPI: validado con Redocly.
- Pruebas Node del frontend que ya existían: 40 pasaron.
- Las pruebas Vitest y el build completo no se pudieron ejecutar en este entorno porque el `node_modules` del ZIP original contiene binarios de Windows y el entorno de validación es Linux. Ejecuta `npm install` en cada carpeta antes de correrlas localmente.
