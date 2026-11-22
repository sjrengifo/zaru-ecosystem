# F7 — Comunicación avanzada: Plan técnico

## 1. Resumen del enfoque
Todas las funcionalidades de F7 producen filas en la cola `notificaciones` de F6, de modo que heredan reintentos, bitácora, deduplicación y centro de notificaciones. Se agrega un motor de plantillas con validación de variables, un segmentador de campañas basado en SQL, un programador de recordatorios disparado por el evento `orden.entregada` y un contador de consumo que el enviador consulta antes de usar SMS o correo.

## 2. Cambios en el modelo de datos
Migración `<ts>_comunicacion_avanzada.sql`:

| Objeto | Cambio | RF |
|---|---|---|
| `plantillas_notificacion` | Nueva (HU-32, migración `20261117120000_hu32_plantillas_notificacion.sql`): una fila por `(establecimiento_id, estado, canal)`; `establecimiento_id null` = plantillas de la plataforma (15 sembradas). RLS de lectura: la sede ve las suyas y las de la plataforma; solo el backend escribe. Funciones `plantillas_notificacion_de` y `guardar_plantilla_notificacion` | RF-F7-01 a 05 |
| `campanas` | Nueva | RF-F7-06 a 10 |
| `recordatorios` | Nueva; índice único parcial `(vehiculo_id) where estado = 'programado'` | RF-F7-11 a 14 |
| `novedades` | Nueva | RF-F7-15 a 18 |
| `consumo_mensual` | Nueva; contador por `(establecimiento_id, mes, canal)` con `cantidad` (aceptadas), `reservada` (en curso) y `alerta_80_enviada`. RPC `hu39_reservar_consumo`, `hu39_confirmar_consumo` y `hu39_liberar_consumo` (bloqueo de fila, idempotentes) | RF-F7-19 a 23 |
| `consumo_reservas`, `consumo_alertas` | Nuevas; idempotencia por notificación y registro de cada entrega de la alerta del 80 % con reintento del worker | RF-F7-20, 21 |
| `notificaciones` | `prioridad smallint default 1` (0 = novedad, 1 = operativa, 2 = comercial); `tomar_notificaciones` ordena por `prioridad, created_at` | RNF-F7-02 |
| `planes` | Cupos definidos (seed): básico 200 SMS / 1 000 correos; intermedio 600 / 3 000; empresarial 2 000 / 10 000 — **valores a confirmar por el PO** | RF-F7-19 |
| `config_canales` | Nueva (HU-31/HU-39, migración `20261119110000_hu31_preferencias_canales.sql`): una fila por `(establecimiento_id, canal)` con `activo`; RPC `guardar_preferencias_canales(uuid, jsonb)` y RLS de lectura por sede. Solo decide la prueba y los avisos no críticos | RF-F7-23 |
| Storage | Bucket privado `evidencias`, ruta `{establecimiento_id}/{orden_id}/{novedad_id}/…` | RF-F7-16 |
| Vista `privado.segmento_campana(...)` | Función SQL que recibe filtros y devuelve clientes elegibles con motivo de exclusión | RF-F7-06 a 08 |

## 3. Contrato de API

| Método | Ruta | Rol | Petición | Respuesta | RF |
|---|---|---|---|---|---|
| GET | `/plantillas` | admin | — | `{ variables, estados, canales, limites, plantillas: Plantilla[] }` (propias y de la plataforma) | RF-F7-05 |
| PUT | `/plantillas/{estado}/{canal}` | admin | `{ asunto?, cuerpo }` | `Plantilla` + `{ caracteres, segmentos, codificacion, advertencias[] }` · `400` con `{ variable, posicion, linea, columna, sugerencia }` | RF-F7-01, 02, 04 |
| DELETE | `/plantillas/{estado}/{canal}` | admin | — | `Plantilla` (vuelve a la de la plataforma) | RF-F7-05 |
| POST | `/plantillas/vista-previa` | admin | `{ estado, canal, cuerpo, asunto? }` | `{ sede, datosEjemplo, push: { titulo, texto }, sms: { texto, caracteres, segmentos, … }, correo: { asunto, html, texto } }` | RF-F7-03 |
| POST | `/campanas/estimar` | admin | `{ promocionId, segmento }` | `{ total, exclusiones }` | RF-F7-06 a 08 |
| POST | `/campanas` | admin | `Idempotency-Key` · `{ promocionId, segmento, programadaPara? }` | `201 Campana` (con hora ajustada) | RF-F7-09, 10 |
| GET | `/campanas` | admin | paginación | `Campana[]` | RF-F7-06 |
| POST | `/ordenes/{id}/novedades` | admin, operario | `Idempotency-Key` · `{ tipo, mensaje?, minutosExtra? }` | `201 Novedad` | RF-F7-15, 17, 18 |
| POST | `/ordenes/{id}/novedades/{nid}/fotos` | admin, operario | `multipart` (hasta 3) | `{ fotos: [url firmada] }` | RF-F7-16 |
| GET | `/publico/recordatorios/{token}/desactivar` | — | — | Página de confirmación | RF-F7-13 |
| GET | `/consumo` | admin | `?mes=YYYY-MM` | `{ mes, establecimientoId, plan, sms, correo, push }` (el tenant sale de la sesión; push se contabiliza sin cupo) | RF-F7-23 |
| GET | `/configuracion/canales` | admin | — | `PreferenciaCanal[]` con `activo`, `disponible` y `proveedor` reales; no bloquean avisos | RF-F7-23 |
| PUT | `/configuracion/canales` | admin | `{ canales: [{ canal, activo }] }` | `PreferenciaCanal[]`; una sola RPC, sin `establecimiento_id` en el cuerpo | RF-F7-23 |
| POST | `/notificaciones/prueba` | admin | `{ canal? }` | Resultado por canal con `estado`, `destino` enmascarado, proveedor y consumo HU-39 | RF-F7-23 |
| GET | `/superadmin/consumo` | superadmin | `?mes=YYYY-MM` | `{ mes, resumen, establecimientos[] }` | RF-F7-22 |
| GET | `/superadmin/consumo/{establecimientoId}` | superadmin | `?mes=YYYY-MM` | Detalle de la sede con `historial[]` de hasta 36 periodos | RF-F7-22 |
| GET | `/superadmin/planes` | superadmin | — | `Plan[]` con cupos vigentes | RF-F7-19 |
| PUT | `/superadmin/planes/{nombre}` | superadmin | `{ cupoSmsMes?, cupoCorreoMes? }` | `Plan` actualizado; el historial no se reescribe | RF-F7-19 |

`GET /ordenes/{id}` incluye `novedades`; el seguimiento público incluye la `entregaEstimadaAt` actualizada.

## 4. Diseño de módulos

| Componente | Responsabilidad |
|---|---|
| `shared/plantillasNotificacion.js` (HU-32) | Parser de `{variable}` con lista blanca, conteo de caracteres y segmentos GSM-7/UCS-2, render por canal con branding y `armarMensaje` para el envío (ver §4.1) |
| `modules/campanas` | Estimar, crear (ajuste nocturno con `America/Bogota`), y un paso del worker que materializa las campañas vencidas en notificaciones `comercial` |
| `modules/recordatorios` | El despachador, al procesar `orden.entregada`, cancela el recordatorio vigente del vehículo y, si hay ≥ 3 servicios, calcula el promedio de días entre visitas y programa uno nuevo. El worker convierte los vencidos en notificaciones `recordatorio`. |
| `modules/novedades` | Crea la novedad, actualiza `entrega_estimada_at` si es demora, genera notificación `novedad` con prioridad 0 y `programada_para = now()` |
| `shared/consumo.js` | Antes de enviar SMS reserva el cupo; si está agotado aplica RF-F7-21; tras aceptar el mensaje confirma el consumo y dispara la alerta del 80 % una vez por mes. Reportes globales/propios y catálogo de planes |
| `controllers/consumo.controller.js` · `routes/consumo.routes.js` · `routes/superadmin.routes.js` | Exponen `/consumo` (solo admin con tenant, sin id de sede en la petición) y los reportes/planes bajo `/superadmin` (solo plataforma) |
| `frontend/src/components/ConsumoPorPlan.jsx` | Panel CA3 en el Superadmin: filtro por mes, tabla por sede/plan y ajuste de cupos; ancla `#consumo-por-plan` con enlace visible desde el panel |
| `shared/preferenciasCanales.js` · `shared/pruebaCanales.js` · `controllers/canales.controller.js` | Preferencias con disponibilidad real de proveedores y prueba real con fallback push → SMS → correo, reserva/confirmación/liberación HU-39 y auditoría sin destinos completos |
| `frontend/src/components/ConfiguracionCanales.jsx` | Panel de sede: interruptores de canales, alertas y tabla de consumo propio, y resultado de la prueba por canal |

### 4.1 Uso de `armarMensaje` en el envío (HU-46 / HU-28)

HU-32 deja el texto de cada estado y canal en `plantillas_notificacion`, pero **no** cambia el envío: `notificaciones.js`, `plantillasCorreo.js` y `proveedorSms.js` siguen con sus textos fijos. HU-46 y HU-28 conectan el envío con esta función:

```js
import { armarMensaje } from './plantillasNotificacion.js';

// tenant: acceso del tenant de la orden (crearAccesoTenant / el que ya usa el enviador).
const mensaje = await armarMensaje(tenant, {
  estado: 'orden.lista',            // estado de la orden ('recibido' … 'entregado') o evento de la cola
  canal: 'correo',                  // 'push' | 'sms' | 'correo'
  datos: {
    cliente: { nombre },            // {nombre_cliente} = primer nombre
    vehiculo: { placa },            // {placa}
    establecimiento,                // opcional; si falta se lee con el tenant ({sede} y la marca)
    momento: cambioEstadoAt,        // {hora}, en hora de Bogotá
  },
  extra: { html, texto },           // opcional, solo correo: tabla de servicios, total, enlaces de seguimiento y de baja
});
// → { origen: 'sede' | 'plataforma', canal, asunto, html, texto }          (correo)
// → { origen, canal, titulo, texto }                                       (push)
// → { origen, canal, texto, caracteres, segmentos, codificacion, … }       (sms)
```

| Hoy (HU-46 / HU-33) | Con plantillas |
|---|---|
| `prepararCorreo` y la reconstrucción del correo usan `PLANTILLAS[evento]` de `plantillasCorreo.js` | Llamar `armarMensaje(tenant, { estado: evento, canal: 'correo', datos, extra })`; `extra.html` lleva la tabla de servicios, el total y los enlaces (ya escapados), que no son variables de la plantilla. Guardar en `contenido` solo el asunto, como hoy |
| `reconstruirTextoCorto` usa `textoAvisoListo` de `proveedorSms.js` | `armarMensaje(tenant, { estado: fila.evento, canal: fila.canal, datos })` y enviar `texto` (y `titulo` en push) |
| HU-28: avisos de `en_lavado`, `secado`, `entregado` | Mismo llamado con el estado nuevo; ya hay plantilla de la plataforma para los cinco estados |

Eventos de la cola: `orden.recibida` → `recibido`, `orden.lista` → `listo` (`ESTADO_DE_EVENTO`). Un estado o canal desconocido lanza un error de programación. El mensaje se arma al enviar, no al encolar, para usar siempre la plantilla vigente.

## 5. Reglas de negocio

| Regla | Implementación |
|---|---|
| Límite de 2 comerciales por cliente cada 7 días | Conteo en `notificaciones` tipo `comercial` estado `enviada/entregada` |
| Horario permitido 7:00 a. m. – 8:00 p. m. | Función `ajustarHorario(fecha)` con zona Bogotá |
| Frecuencia promedio | `(última - primera) / (n - 1)` en días, redondeado |
| Fotos | Máx. 3 por novedad, JPG/PNG por contenido, ≤ 5 MB |
| Alerta del 80 % única | Columna `alerta_80_enviada` en `consumo_mensual` |

## 6. Estrategia de pruebas

| Nivel | Qué se prueba |
|---|---|
| Unitarias | Parser de plantillas, segmentos SMS (incluidas tildes que fuerzan UCS-2), ajuste de horario, cálculo de frecuencia |
| Integración | ESC-F7-01 a ESC-F7-11 con worker paso a paso y reloj controlado |
| Rendimiento | Estimación con 5 000 clientes < 2 s |
| Aislamiento | Plantillas, campañas, novedades, fotos y consumo |

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Campañas grandes retrasan notificaciones operativas | Prioridad en la cola (RNF-F7-02) |
| Costos de SMS en pruebas | Proveedor `consola` fuera de producción y cupos bajos en el ambiente de pruebas |
| Fotos con datos personales (rostros, placas) | Bucket privado y URLs firmadas de corta duración |
