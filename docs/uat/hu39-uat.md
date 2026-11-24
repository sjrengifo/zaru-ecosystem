# UAT — HU-39 / HU-40: consumo por plan, canales y prueba push real

| Campo | Valor |
|---|---|
| Historias | HU-39 (ZARU-28) y HU-40 (ZARU-70), con HU-31/HU-29 como contexto |
| Fecha del documento | 2026-11-24 |
| Estado | **DA-12 aprobada**; CA1/CA2/CA3 ejecutados funcionalmente contra Supabase real con las cuentas oficiales. Siguen pendientes la UAT en ambiente desplegado y la prueba push con dispositivo real |
| Rama | `feature/ZARU-20-configuracion-notificaciones` |

> Este documento distingue tres cosas que no son equivalentes: (1) funcionalidad **implementada** en el
> código, (2) **pruebas automatizadas** en verde y (3) **validación real**. Las verificaciones de
> CA1/CA2/CA3 registradas abajo son ejecuciones reales contra el Supabase de pruebas, con las cuentas
> oficiales y la aplicación local; **no** son una UAT firmada en el ambiente desplegado. Ninguna prueba
> unitaria ni de integración se reporta aquí como UAT ejecutada.

> No se afirma entrega externa de correo ni SMS: los proveedores por defecto escriben en consola
> (`proveedor: "consola"`, `entregaConfirmada: false`) porque SMTP/Resend y un proveedor SMS real no
> están configurados en este ambiente. El estado `enviada` de una alerta significa que el proveedor
> disponible aceptó el mensaje, no que buzón o terminal lo recibieron.

> Este documento no certifica una entrega push de extremo a extremo con un dispositivo falso ni con
> llaves de prueba publicadas. Las llaves VAPID generadas localmente viven solo en `backend/.env`
> (ignorado por git). La migración `20261122130000_hu39_push_administrador.sql` **ya está aplicada** en
> el proyecto Supabase de pruebas; en cualquier otro ambiente debe aplicarse antes de la prueba.

## 1. Precondiciones

| # | Requisito | Verificación |
|---|---|---|
| P1 | Migraciones aplicadas: `20261119100000_hu39_consumo_por_plan.sql`, `20261119110000_hu31_preferencias_canales.sql`, `20261122120000_hu40_suscripciones_push.sql` y `20261122130000_hu39_push_administrador.sql` | **Verificado en Supabase el 2026-11-22**: `planes`, `config_canales`, `suscripciones_push`, `notificaciones_push_admin` y `rls_activa = true`. <br>Para repetirlo: `select to_regclass('public.planes'), to_regclass('public.config_canales'), to_regclass('public.suscripciones_push'), to_regclass('public.notificaciones_push_admin');` — las cuatro deben devolver un nombre, no `null` |
| P2 | Web Push configurado en el **ambiente donde se haga la UAT** | `PUSH_PROVEEDOR=webpush`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` válidos. Las llaves privadas nunca se incluyen en el repo ni en este documento |
| P3 | Service worker publicado | `GET /sw-zaru.js` responde 200 en el dominio del panel |
| P4 | Usuario administrador de la sede de prueba con sesión vigente | Login en el panel; el endpoint `/configuracion/canales` responde 200. Cuentas oficiales usadas: ADMIN `cuartassilvaguias@gmail.com`, SUPERADMIN `silvi.cuartas@gmail.com`; correos/contraseñas no están hardcodeados en la lógica |
| P5 | Dispositivo real con navegador que soporte Web Push | Chrome/Edge en Android o escritorio. En iPhone, la web debe estar instalada en la pantalla de inicio |
| P6 | DA-12 aprobada por el PO el 2026-11-22 | `select nombre, cupo_sms_mes, cupo_correo_mes from public.planes order by nombre;` devolvió `basico 200/1000`, `intermedio 600/3000`, `empresarial 2000/10000` el 2026-11-24, después de la prueba CA1/CA2. Ver [`../decisiones/DA-12-cupos-notificaciones.md`](../decisiones/DA-12-cupos-notificaciones.md) |

## 1.1 SQL para Supabase (copiar y pegar)

**Ya ejecutado en el proyecto Supabase de pruebas** (P1): no volver a aplicar DDL allí. Este bloque
sirve para reproducir la tabla en **otro ambiente** donde falte; es idempotente y no modifica una tabla
existente.

```sql
-- HU-39/HU-40 · dispositivo push del administrador para la prueba real de envío.
create table if not exists public.notificaciones_push_admin (
  id                 uuid primary key default gen_random_uuid(),
  establecimiento_id uuid not null references public.establecimientos(id) on delete cascade,
  usuario_id         uuid not null,
  endpoint           text not null unique
                     check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh             text not null check (char_length(p256dh) between 20 and 200),
  auth               text not null check (char_length(auth) between 10 and 100),
  dispositivo        text not null default 'Navegador',
  actualizada_at     timestamptz not null default now(),
  unique (establecimiento_id, usuario_id)
);

create index if not exists notificaciones_push_admin_endpoint_idx
  on public.notificaciones_push_admin (endpoint);

alter table public.notificaciones_push_admin enable row level security;

grant select, insert, update, delete on public.notificaciones_push_admin to service_role;

-- Registrar la migración para que supabase db push no intente repetirla.
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    insert into supabase_migrations.schema_migrations (version, name)
    values ('20261122130000', 'hu39_push_administrador')
    on conflict (version) do nothing;
  end if;
end $$;

-- Verificación: las cuatro consultas deben devolver valores, no null/false.
select
  to_regclass('public.planes')                    as planes,
  to_regclass('public.config_canales')            as canales,
  to_regclass('public.suscripciones_push')        as push_cliente,
  to_regclass('public.notificaciones_push_admin') as push_admin,
  (select relrowsecurity from pg_class
    where oid = 'public.notificaciones_push_admin'::regclass) as rls_activa;
```

Si la última consulta devuelve `rls_activa = false`, volver a ejecutar solo el `alter table … enable
row level security`. No crear políticas para `authenticated`: el backend escribe con `service_role`.

## 2. Casos de prueba manuales

### CA-UAT-1 — Consumo del mes frente al plan (HU-39 CA3)

1. Entrar con un usuario superadministrador y abrir **Ver reporte de consumo**.
2. Confirmar que por establecimiento aparecen: establecimiento, plan, cupo de SMS, SMS usados,
   porcentaje, correos y estado. El reporte **no muestra la columna `reservada`**: comprobar solo los
   campos visibles; la inclusión de reservas queda como mejora pendiente, no como criterio de esta UAT.
3. Cambiar el mes y confirmar que el historial de otros meses no se modifica.
4. Entrar con un administrador de sede y abrir **Notificaciones → Canales de notificación**.
5. Confirmar que solo se muestran sus cupos y los de ninguna otra sede.

**Esperado:** los valores de cupo son los de `public.planes` (DA-12 aprobada: 200/1.000,
600/3.000, 2.000/10.000), el porcentaje coincide con `usados / cupo`, y ningún pedido del frontend
incluye un `establecimientoId` elegido por el usuario para consultar la sede propia.

**Resultado (2026-11-24): ejecutado funcionalmente en ambiente local contra Supabase real.**

- Con ADMIN: `GET /me`, `/consumo` y `/consumo/alertas` → 200; `/superadmin/consumo` y
  `/superadmin/consumo/alertas` → 403.
- Con SUPERADMIN: `GET /me`, `/superadmin/consumo`, `/superadmin/consumo/alertas` y el detalle de sede
  → 200; `/consumo` → 403.
- Reporte con 8 establecimientos. Fila «Lavadero Demo Zaru»: plan `Intermedio`, SMS `5/600`
  (`0,83 %`), correos `13/3000` (`0,43 %`), estado `Normal`. Cupo ya restaurado.
- En UI: columnas Establecimiento/Plan/SMS consumidos/Cupo SMS/% SMS/Correos/Estado; búsqueda «Demo»
  filtró 8 → 2 filas y también las alertas; filtro por plan `intermedio` y por `basico` aplicados.
- Evidencia: [`../evidencias/hu39/06-ca3-verificacion-api.json`](../evidencias/hu39/06-ca3-verificacion-api.json),
  [`../evidencias/hu39/05-superadmin-cupo-restaurado.png`](../evidencias/hu39/05-superadmin-cupo-restaurado.png),
  [`../evidencias/hu39/06-superadmin-busqueda-establecimiento.png`](../evidencias/hu39/06-superadmin-busqueda-establecimiento.png),
  [`../evidencias/hu39/07-superadmin-filtro-plan.png`](../evidencias/hu39/07-superadmin-filtro-plan.png).

**No ejecutado en este registro:** el cambio de mes en la UI (paso 3) y la repetición en ambiente
desplegado. El detalle por sede y su historial sí se consultaron por API con SUPERADMIN.

### CA-UAT-2 — Preferencias de canales (HU-31/HU-39)

1. En **Notificaciones → Canales de notificación**, desactivar SMS y dejar correo y push activos.
2. Recargar la página y confirmar que el estado se conserva.
3. Generar un cambio de estado real de una orden (por ejemplo, `listo`) y confirmar que el aviso
   operativo sigue llegando aunque el SMS esté desactivado.

**Esperado:** las preferencias afectan la prueba y los avisos no críticos; los avisos operativos y el
fallback `push → SMS → correo` no se detienen. Correo y push se contabilizan pero nunca bloquean.

**Resultado:** pendiente de ejecutar manualmente en el ambiente desplegado. Solo hay cobertura
automatizada.

### CA-UAT-3 — Registrar el dispositivo push del administrador (HU-39/HU-40)

1. Con la sesión del administrador, abrir **Notificaciones → Canales de notificación → Push en este dispositivo**.
2. Pulsar **Activar push en este dispositivo** y aceptar el permiso del navegador.
3. Confirmar el mensaje *"Push activado en … Ya puedes probar el canal"*.
4. Verificar en la bitácora de auditoría la acción `notificacion.push_admin.registrada`, sin endpoint ni llaves.

**Esperado:** la suscripción queda asociada al usuario de la sesión y a la sede de la sesión. Si el
navegador no soporta push o el usuario rechaza el permiso, se muestra el mensaje alterno y SMS/correo
siguen disponibles. Si la migración P1 falta, la prueba debe seguir funcionando por SMS/correo.

**Resultado:** pendiente de ejecutar con un dispositivo real. Las pruebas unitarias de registro están
en verde, pero **no sustituyen esta evidencia**: no se ha registrado un dispositivo falso para simularla.

### CA-UAT-4 — Prueba real por push (HU-39/HU-40)

1. Con el dispositivo registrado en CA-UAT-3, elegir **Canal inicial: Push** y pulsar **Enviar prueba**
   en **Notificaciones → Canales de notificación**. No existe un botón independiente «Probar push».
2. Confirmar en pantalla: orden `push → sms → correo`, estado `entregado`, canal entregado `push`, y
   el destino mostrado solo como el nombre legible del dispositivo (por ejemplo, *Chrome en Android*).
3. Confirmar que llegó la notificación al dispositivo y que al tocarla abre el seguimiento de la orden
   o la sección correspondiente del panel.
4. Repetir la prueba con el dispositivo apagado y verificar que el proveedor conserva el aviso hasta
   una hora, sin duplicar el consumo.

**Esperado:** el terminal nunca recibe el endpoint, `p256dh` ni `auth`; el consumo del canal push
queda reservado y confirmado una sola vez; si el proveedor rechaza la suscripción (404/410), el
intento se marca fallido y se continúa por SMS/correo.

**Resultado:** pendiente. La migración admin push ya está aplicada en Supabase (P1), pero no se puede
afirmar la entrega sin un dispositivo real y sin VAPID configurado en el ambiente desplegado. La prueba
`POST /notificaciones/prueba?canal=sms` no demuestra entrega SMS porque el proveedor es consola.

### CA-UAT-5 — Respaldo y cupo agotado (HU-39 CA2)

1. Desactivar SMS en la sede de prueba o dejar el cupo de SMS en cero.
2. Enviar una prueba iniciando por SMS y observar el resultado de cada intento.
3. Verificar que el canal alterno entrega y que solo el canal entregado cuenta como consumo.
4. Consultar `GET /consumo` y comprobar que el intento fallido no incrementó el contador.

**Esperado:** `sin_cupo`/`inactivo` en SMS, aviso entregado por push o correo, reserva liberada en el
canal fallido y contador incrementado solo en el canal aceptado.

**Resultado (2026-11-24): ejecutado funcionalmente en ambiente local contra Supabase real.** Se bajó
temporalmente el plan `intermedio` de 600 a 5 SMS; **esto afectó a todas las sedes intermedias durante
la ventana** y se restauró a 600/3000 al terminar, incluso tras el fallo intermedio de la sonda UI.
Se usó un flujo real de orden de cliente con celular verificado (el ADMIN oficial no tiene celular en
Auth).

- SMS `5/5`; una orden nueva generó el aviso con el cupo ya agotado. El SMS quedó `cancelada` desde la
  preparación con `error: "Cupo mensual de SMS agotado (5/5)"` y `motivoFallo: "sin_cupo_sms"`, sin
  quedar en la cola: `smsAntes: 5`, `smsDespues: 5`.
- El aviso operativo salió por correo (`canal: "correo"`, estado `enviada`) y `detalle.alterno` quedó
  enlazado al SMS cancelado en la bitácora.
- La primera ejecución dejó ver un defecto: con el SMS encolado, un worker desplegado con código anterior
  lo reclamó y lo envió fuera de cupo. El ajuste cancela el SMS antes de encolarlo, de modo que ese worker
  ya no tiene una fila envifiable; la reserva atómica al enviar se mantiene para la carrera entre workers.
- Evidencia del flujo corregido:
  [`../evidencias/hu39/08-ca2-cupo-agotado-sin-envio-sms.json`](../evidencias/hu39/08-ca2-cupo-agotado-sin-envio-sms.json),
  [`../evidencias/hu39/09-admin-ca2-cupo-agotado.png`](../evidencias/hu39/09-admin-ca2-cupo-agotado.png) y
  [`../evidencias/hu39/10-admin-ca2-detalle-alterno.png`](../evidencias/hu39/10-admin-ca2-detalle-alterno.png).
  La bitácora del ADMIN muestra la fila SMS cancelada junto al correo enviado, y el detalle muestra
  `Cupo mensual de SMS agotado (5/5)`, `Intentos 0` y el alterno por correo en estado `Enviada`.
  Ejecución anterior (comportamiento observado antes del ajuste):
  [`../evidencias/hu39/03-sms-cancelado-api.json`](../evidencias/hu39/03-sms-cancelado-api.json),
  [`../evidencias/hu39/04-admin-sms-cancelado-alterno.png`](../evidencias/hu39/04-admin-sms-cancelado-alterno.png),
  [`../evidencias/hu39/00-resumen-ejecucion.json`](../evidencias/hu39/00-resumen-ejecucion.json).

**No verificado aquí:** entrega por push (sin dispositivo) ni entrega externa de correo/SMS (sin
proveedores reales configurados en el ambiente local: el correo quedó aceptado por el proveedor de
consola, no se afirma llegada a buzón).

### CA-UAT-6 — Alerta automática al 80 % (HU-39 CA1)

1. Con el cupo de SMS de la sede reducido de forma controlada, generar SMS reales hasta cruzar el 80 %.
2. Confirmar en la bitácora de la sede y en el reporte de plataforma que la alerta quedó persistida con
   consumo, cupo y porcentaje reales.
3. Volver a cruzar el umbral en el mismo mes no debe crear una segunda alerta.

**Esperado:** una alerta por establecimiento y mes, destinada al ADMIN de la sede y al SUPERADMIN,
consultable por API y con estado real del envío; si hay proveedor de correo configurado, se envía por
correo.

**Resultado (2026-11-24): ejecutado funcionalmente en ambiente local contra Supabase real.** En el
cruce exacto `4/5 = 80 %` se registraron 4 filas en `consumo_alertas` (2 para la sede y 2 para la
plataforma), todas `enviada`, con `detalle.consumo: 4`, `detalle.cupo: 5`,
`detalle.porcentaje: 80`. Un segundo cruce en el mismo mes no generó nuevas alertas. La UI de ADMIN
mostró el aviso «alcanzaste el 80 % del cupo mensual de SMS».

Evidencia: [`../evidencias/hu39/01-alerta-80-api-80exacto.json`](../evidencias/hu39/01-alerta-80-api-80exacto.json),
[`../evidencias/hu39/01-admin-alerta-80.png`](../evidencias/hu39/01-admin-alerta-80.png) y
[`../evidencias/hu39/00-resumen-ejecucion.json`](../evidencias/hu39/00-resumen-ejecucion.json).

**Pendiente:** comprobar la entrega externa del correo cuando se configure SMTP/Resend; en este
ambiente el proveedor por defecto es consola.

## 3. Evidencia automática ya ejecutada (2026-11-24)

Estas son **pruebas automatizadas**, no UAT. Ninguna usa un dispositivo push real ni certifica la
entrega de extremo a extremo.

| Prueba | Resultado | Naturaleza y observación |
|---|---|---|
| `backend`: `npm run test:unit` | 761/761 | Automatizada con proveedores simulados/de consola. Incluye la regresión CA2 que verifica SMS cancelado al preparar y correo operativo, además de `orden_id`, `motivoFallo: sin_cupo_sms`, `detalle.alterno` y validaciones de filtros |
| `backend`: `npm test -- --run` | 1006 pasadas / 1 omitida | Batería completa del backend (82 archivos pasados, 1 omitido) tras el fix CA2 |
| `frontend`: `npm test` | 43/43 (`node --test`) + 241/241 (Vitest) | Automatizada en Node/jsdom: panel de canales, consumo, preferencias, búsqueda/filtros y cliente push |
| `backend`: `tests/integration/hu39-consumo.test.js` | 5/5 | Automatizada contra Supabase: cupos, reservas, alerta 80 %, reporte global y nuevos endpoints `/consumo/alertas` y `/superadmin/consumo/alertas` con roles separados |
| `backend`: `npm run test:integracion` | 245 pasadas / 1 omitida | Todas las suites de integración del repo; la omitida depende de entorno no configurado |
| `backend`: `npm run lint:openapi` | Válido | Validación estática del contrato; incluye los endpoints de alertas y los campos CA2/CA3 |
| `frontend`: `npm run build` | OK | Compilación del panel completo |
| `git diff --check` | OK | Validación de whitespace |

### 3.1 Clasificación de la evidencia

| Nivel | Estado | Qué respalda |
|---|---|---|
| Funcionalidad implementada | Sí | Código, endpoints, RPC y paneles presentes en el repo |
| Migraciones aplicadas en Supabase | Sí, verificado el 2026-11-22 | P1: tablas y RLS activa |
| Pruebas automatizadas | Sí, en verde el 2026-11-24 | Tabla anterior |
| Verificación real contra Supabase con roles oficiales | Sí, 2026-11-24 | CA1/CA2/CA3 en ambiente local; cupo restaurado y verificado después de las suites |
| Validación en ambiente desplegado y con dispositivo real | **No, pendiente** | CA-UAT-2, CA-UAT-3, CA-UAT-4 y el cambio de mes en CA-UAT-1; sin capturas ni grabación no se marcan como ejecutados |

### 3.2 Observaciones del ambiente

- Se detectó un worker externo/desplegado conectado a la misma Supabase que procesa la cola con código
  anterior y sin reserva HU-39. No se pudo detener desde el repo; la sonda funcional reclamó cada fila
  llamando a `procesarCola` inmediatamente después del cambio de estado. No se dejaron filas de prueba.
- `CORREO_PROVEEDOR`, SMTP/Resend y `SMS_PROVEEDOR` no están configurados: los mensajes quedan en
  consola con `idProveedor` tipo `consola-…` y `entregaConfirmada: false`.
- Los artefactos duplicados o de ejecución fallida se retiraron de `docs/evidencias/hu39`; se conserva
  `00-resumen-ejecucion.json` porque documenta la restauración del cupo tras el fallo de la sonda UI.
- `docs/hu39-sql/*.sql` se inspeccionó: cada tabla y función aparece una sola vez; son extractos
  históricos de las migraciones, no definiciones nuevas. La fuente de verdad sigue siendo
  `supabase/migrations/`.

La migración `20261122130000_hu39_push_administrador.sql` **sí está aplicada** en el proyecto Supabase
de pruebas (P1). Lo que impide reportar CA-UAT-3/4 como ejecutados es la ausencia de dispositivo real y
de un ambiente desplegado con VAPID, no la migración.

## 4. Cierre y firma

La historia no se marca como *Validada* hasta que:

1. Confirmar que la migración admin push esté aplicada en el ambiente de la UAT (ya lo está en el
   proyecto Supabase de pruebas; debe aplicarse en cualquier ambiente nuevo).
2. Se configuren las llaves VAPID y un proveedor de correo real en el ambiente desplegado (nunca en el
   repositorio).
3. Se completen CA-UAT-2, CA-UAT-3, CA-UAT-4 y el cambio de mes de CA-UAT-1 con un dispositivo real y
   se adjunten capturas o grabación.
4. ~~El PO apruebe DA-12 por escrito.~~ **Hecho el 2026-11-22**: redacción y cupos aprobados; ver [`../decisiones/DA-12-cupos-notificaciones.md`](../decisiones/DA-12-cupos-notificaciones.md). Si el proceso exige enlace a Jira, adjuntarlo en el registro de decisión.

| Rol | Nombre | Fecha | Acepta / Observaciones |
|---|---|---|---|
| Product Owner | Pendiente | Pendiente | Pendiente |
| QA / responsable de UAT | Pendiente | Pendiente | Pendiente |
| Desarrollo | Pendiente | Pendiente | Pendiente |
