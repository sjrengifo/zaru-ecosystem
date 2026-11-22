# UAT — HU-39 / HU-40: consumo por plan, canales y prueba push real

| Campo | Valor |
|---|---|
| Historias | HU-39 (ZARU-28) y HU-40 (ZARU-70), con HU-31/HU-29 como contexto |
| Fecha del documento | 2026-11-22 |
| Estado | **Ejecución parcial**: automatización en verde; falta UAT manual con dispositivo real y ambiente desplegado |
| Rama | `feature/ZARU-20-configuracion-notificaciones` |

> Este documento no certifica una entrega push de extremo a extremo con un dispositivo falso ni con
> llaves de prueba publicadas. Las llaves VAPID generadas localmente viven solo en `backend/.env`
> (ignorado por git). El registro push del administrador requiere la migración
> `20261122130000_hu39_push_administrador.sql`, que debe aplicarse en cada ambiente antes de la prueba.

## 1. Precondiciones

| # | Requisito | Verificación |
|---|---|---|
| P1 | Migraciones aplicadas: `20261119100000_hu39_consumo_por_plan.sql`, `20261119110000_hu31_preferencias_canales.sql`, `20261122120000_hu40_suscripciones_push.sql` y `20261122130000_hu39_push_administrador.sql` | En Supabase: `select to_regclass('public.planes'), to_regclass('public.config_canales'), to_regclass('public.suscripciones_push'), to_regclass('public.notificaciones_push_admin');` — las cuatro deben devolver un nombre, no `null` |
| P2 | Web Push configurado en el **ambiente donde se haga la UAT** | `PUSH_PROVEEDOR=webpush`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` válidos. Las llaves privadas nunca se incluyen en el repo ni en este documento |
| P3 | Service worker publicado | `GET /sw-zaru.js` responde 200 en el dominio del panel |
| P4 | Usuario administrador de la sede de prueba con sesión vigente | Login en el panel; el endpoint `/configuracion/canales` responde 200 |
| P5 | Dispositivo real con navegador que soporte Web Push | Chrome/Edge en Android o escritorio. En iPhone, la web debe estar instalada en la pantalla de inicio |
| P6 | Datos de DA-12 todavía sin aprobación | No cambiar los cupos sembrados sin el acta del PO (ver [`../decisiones/DA-12-cupos-notificaciones.md`](../decisiones/DA-12-cupos-notificaciones.md)) |

## 2. Casos de prueba manuales

### CA-UAT-1 — Consumo del mes frente al plan (HU-39 CA3)

1. Entrar con un usuario superadministrador y abrir **Ver reporte de consumo**.
2. Confirmar que por establecimiento aparecen: plan, cupo de SMS, cupo de correo, usados, reservados y porcentaje.
3. Cambiar el mes y confirmar que el historial de otros meses no se modifica.
4. Entrar con un administrador de sede y abrir **Notificaciones → Canales de notificación**.
5. Confirmar que solo se muestran sus cupos y los de ninguna otra sede.

**Esperado:** los valores de cupo son los de `public.planes` (hoy la propuesta DA-12: 200/1.000,
600/3.000, 2.000/10.000), el porcentaje coincide con `usados / cupo`, y ningún pedido del frontend
incluye `establecimiento_id` elegido por el usuario.

**Resultado:** Pendiente de ejecutar en el ambiente desplegado.

### CA-UAT-2 — Preferencias de canales (HU-31/HU-39)

1. En **Notificaciones → Canales de notificación**, desactivar SMS y dejar correo y push activos.
2. Recargar la página y confirmar que el estado se conserva.
3. Generar un cambio de estado real de una orden (por ejemplo, `listo`) y confirmar que el aviso
   operativo sigue llegando aunque el SMS esté desactivado.

**Esperado:** las preferencias afectan la prueba y los avisos no críticos; los avisos operativos y el
fallback `push → SMS → correo` no se detienen. Correo y push se contabilizan pero nunca bloquean.

**Resultado:** Pendiente de ejecutar en el ambiente desplegado.

### CA-UAT-3 — Registrar el dispositivo push del administrador (HU-39/HU-40)

1. Con la sesión del administrador, abrir **Notificaciones → Canales de notificación → Push en este dispositivo**.
2. Pulsar **Activar push en este dispositivo** y aceptar el permiso del navegador.
3. Confirmar el mensaje *"Push activado en … Ya puedes probar el canal"*.
4. Verificar en la bitácora de auditoría la acción `notificacion.push_admin.registrada`, sin endpoint ni llaves.

**Esperado:** la suscripción queda asociada al usuario de la sesión y a la sede de la sesión. Si el
navegador no soporta push o el usuario rechaza el permiso, se muestra el mensaje alterno y SMS/correo
siguen disponibles. Si la migración P1 falta, la prueba debe seguir funcionando por SMS/correo.

**Resultado:** Pendiente de ejecutar con un dispositivo real. La implementación y sus pruebas unitarias
ya están cubiertas; no se ha registrado un dispositivo falso para simular esta evidencia.

### CA-UAT-4 — Prueba real por push (HU-39/HU-40)

1. Con el dispositivo registrado en CA-UAT-3, pulsar **Probar push** en el panel.
2. Confirmar en pantalla: orden `push → sms → correo`, estado `entregado`, canal entregado `push`, y
   el destino mostrado solo como el nombre legible del dispositivo (por ejemplo, *Chrome en Android*).
3. Confirmar que llegó la notificación al dispositivo y que al tocarla abre el seguimiento de la orden
   o la sección correspondiente del panel.
4. Repetir la prueba con el dispositivo apagado y verificar que el proveedor conserva el aviso hasta
   una hora, sin duplicar el consumo.

**Esperado:** el terminal nunca recibe el endpoint, `p256dh` ni `auth`; el consumo del canal push
queda reservado y confirmado una sola vez; si el proveedor rechaza la suscripción (404/410), el
intento se marca fallido y se continúa por SMS/correo.

**Resultado:** Pendiente. No se puede afirmar sin el dispositivo real y con la migración admin push
todavía no aplicada en el proyecto Supabase de pruebas.

### CA-UAT-5 — Respaldo y cupo agotado (HU-39 CA2)

1. Desactivar SMS en la sede de prueba o dejar el cupo de SMS en cero.
2. Enviar una prueba iniciando por SMS y observar el resultado de cada intento.
3. Verificar que el canal alterno entrega y que solo el canal entregado cuenta como consumo.
4. Consultar `GET /consumo` y comprobar que el intento fallido no incrementó el contador.

**Esperado:** `sin_cupo`/`inactivo` en SMS, aviso entregado por push o correo, reserva liberada en el
canal fallido y contador incrementado solo en el canal aceptado. La alerta del 80 % de SMS se envía
una sola vez al mes por sede y a la plataforma.

**Resultado:** Pendiente de ejecutar con cupo controlado en el ambiente desplegado. La automatización
ya cubre el fallback y la contabilidad con proveedores de consola.

## 3. Evidencia automática ya ejecutada (2026-11-22)

| Prueba | Resultado | Observación |
|---|---|---|
| `backend`: `npm run test:unit` | 757/757 | Incluye `tests/unit/push-admin.test.js` (4/4): registro con sesión, degradación sin migración, destino enmascarado y prueba push con fallback |
| `frontend`: `npm test` | 241/241 | Panel de canales, consumo, preferencias y cliente push |
| `backend`: `tests/integration/hu39-consumo.test.js` | 4/4 | Cupos, reservas, alerta 80 % y reportes contra Supabase |
| `backend`: `tests/integration/hu31-canales.test.js` | 4/4 | Preferencias, prueba real y consumo; con VAPID configurado espera `sin_destino` hasta registrar el dispositivo del administrador |
| `backend`: `npm run lint:openapi` | Válido | Incluye `POST /notificaciones/push` y `/push/baja` |
| `frontend`: `npm run build` | OK | Compila con el nuevo panel de push del administrador |
| `git diff --check` | OK | Sin errores de whitespace |

La migración `20261122130000_hu39_push_administrador.sql` **no está aplicada** en el proyecto
Supabase de pruebas al redactar este documento: no hay `pg_dump`, `psql`, Docker ni `DATABASE_URL` en
el entorno de desarrollo, y `public.exec_sql` no existe. Por eso no se reporta CA-UAT-3/4 como ejecutado.

## 4. Cierre y firma

La historia no se marca como *Validada* hasta que:

1. Se aplique la migración admin push en el ambiente de la UAT.
2. Se configuren las llaves VAPID en el ambiente desplegado (nunca en el repositorio).
3. Se completen CA-UAT-1 a CA-UAT-5 con un dispositivo real y se adjunten capturas o grabación.
4. El PO apruebe DA-12 por escrito.

| Rol | Nombre | Fecha | Acepta / Observaciones |
|---|---|---|---|
| Product Owner | Pendiente | Pendiente | Pendiente |
| QA / responsable de UAT | Pendiente | Pendiente | Pendiente |
| Desarrollo | Pendiente | Pendiente | Pendiente |
