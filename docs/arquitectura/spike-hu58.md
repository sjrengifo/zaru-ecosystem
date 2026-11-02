# Spike HU-58: arquitectura y stack del backend

| Campo | Valor |
|---|---|
| Historia | HU-58 · ZARU-64 (Épica 4) |
| Responsable | Samuel Rengifo |
| Time-box | 27 al 28 de octubre de 2026 (2 días) |
| Estado | Terminado |
| Decisión | **Supabase (PostgreSQL, Auth y Realtime) + API Node/Express en Render + frontend en Vercel** |

## 1. Pregunta del spike

¿El stack elegido sirve para operar a los 81 establecimientos proyectados cumpliendo cuatro condiciones?

1. Aislamiento de datos entre establecimientos (multi-tenant).
2. Tiempo real del estado del vehículo.
3. Despliegue sencillo para un equipo de 7 personas.
4. Costo dentro de los $800.000 COP mensuales de infraestructura del caso de negocio.

## 2. Arquitectura elegida

```
Panel web (React, Vercel) ──JWT──▶ API Node/Express (Render) ──service_role──▶ Supabase
        │                                   │                                 ├─ PostgreSQL + RLS
        └──── Realtime (lectura con RLS) ───┼────────────────────────────────▶├─ Auth
                                            │                                 └─ Realtime
Web móvil del cliente final ──SSE──────────┘
```

| Componente | Elección | Motivo |
|---|---|---|
| Base de datos | PostgreSQL administrado por Supabase | Relacional (órdenes, servicios, historial), RLS nativo para el aislamiento multi-tenant, copias diarias incluidas en el plan Pro |
| Autenticación | Supabase Auth | JWT estándar; el backend y RLS leen el mismo `auth.uid()` |
| Tiempo real | Supabase Realtime (panel) y SSE desde la API (cliente final) | Realtime respeta RLS para usuarios del panel; el cliente final no tiene usuario de Supabase (ADR-04) |
| API | Node.js 20 + Express en Render | Lenguaje único (JS) en todo el equipo; despliegue desde GitHub con `render.yaml` |
| Frontend | React + Vite en Vercel | Despliegue automático por rama y vistas previas por PR |

Las decisiones de detalle están en `specs/backend/02-arquitectura.md` (ADR-01 a ADR-08).

## 3. Alternativas descartadas

| Alternativa | Por qué se descarta |
|---|---|
| **AWS** (RDS PostgreSQL + ECS Fargate + ALB + Cognito + API Gateway WebSockets) | Cumple los requisitos, pero exige armar y operar 5 servicios por separado (redes, IAM, balanceador, WebSockets, autenticación). El costo mínimo es parecido o mayor, y el equipo no tiene experiencia en AWS. Para el alcance del curso, el esfuerzo de infraestructura desplazaría al desarrollo de las HU. |
| **Google Cloud** (Cloud Run + Cloud SQL + Firebase Auth + Pub/Sub) | Cloud Run es atractivo para escalar a cero, pero Cloud SQL no tiene plan gratuito, y el tiempo real y la autenticación quedan en productos separados. Exige más configuración que Supabase para el mismo resultado. |
| **Firebase / Firestore** | El modelo de documentos complica los reportes y relaciones (órdenes ↔ servicios ↔ promociones) y las consultas de HU-16. Las reglas de seguridad son menos expresivas que RLS para el aislamiento por establecimiento. |
| **Canales públicos de Realtime para el cliente final** | No permiten restringir quién escucha sin un usuario de Supabase. Se reemplazan por SSE desde la API (ADR-04). |

**Ruta de crecimiento:** HU-47 pide balanceo de carga y autoescalado. La API no guarda estado (ADR-08), así que se puede mover a Cloud Run o ECS sin cambiar el código. Supabase se mantiene como base de datos. Esta migración solo se justifica si las pruebas de carga de F8 muestran que Render no alcanza.

## 4. Prototipo (CA2)

### 4.1 Montaje

En el proyecto de Supabase `djutvsulfduzuylvaten` se crearon datos de prueba marcados con `[Spike HU-58]`:

| Dato | Establecimiento A | Establecimiento B |
|---|---|---|
| Establecimiento | `…a058` · Lavadero A | `…b058` · Lavadero B |
| Administrador | `spike-a@zaru.test` | `spike-b@zaru.test` |
| Cliente / vehículo | Cliente solo de A · `SPA058` | Cliente solo de B · `SPB058` |
| Orden | `…0a0d58` | `…0b0d58` |

El script `backend/scripts/spike-hu58.mjs` inicia sesión con cada administrador usando la clave pública (`anon`), igual que el panel web. Luego ejecuta las pruebas. La contraseña de prueba vive en `backend/.env.spike.local`, que no se sube a GitHub.

### 4.2 Resultado

Ejecución del 28 de octubre de 2026: **19 de 19 pruebas aprobadas**. El detalle está en `spike-hu58-resultado.json`.

| Prueba | Resultado |
|---|---|
| Cada administrador ve solo las filas de su establecimiento en `establecimientos`, `perfiles`, `clientes`, `vehiculos` y `ordenes` (10 pruebas) | Pasa: 1 fila propia y 0 ajenas en cada tabla |
| Leer la orden del otro establecimiento por su id (2) | Pasa: 0 filas |
| Modificar la orden del otro establecimiento (2) | Pasa: 0 filas modificadas |
| Escribir directo en la base con la clave pública (2) | Pasa: rechazado por RLS (`42501`), como exige ADR-01 |
| El establecimiento A recibe por Realtime el cambio de estado de su orden | Pasa: **296 ms** desde el commit |
| El establecimiento B no recibe el cambio de una orden ajena | Pasa: 0 eventos |

### 4.3 Cómo reproducirlo

```bash
cd backend
node --env-file=.env.spike.local scripts/spike-hu58.mjs 90
# Mientras espera, en el SQL Editor de Supabase:
update ordenes set estado = 'en_lavado', estado_desde = now()
where id = '00000000-0000-0000-0000-0000000a0d58';
```

### 4.4 Limpieza

Los datos del spike se eliminan cuando el equipo ya no los necesite para la demostración:

```sql
delete from ordenes        where establecimiento_id in ('00000000-0000-0000-0000-00000000a058','00000000-0000-0000-0000-00000000b058');
delete from vehiculos      where establecimiento_id in ('00000000-0000-0000-0000-00000000a058','00000000-0000-0000-0000-00000000b058');
delete from clientes       where establecimiento_id in ('00000000-0000-0000-0000-00000000a058','00000000-0000-0000-0000-00000000b058');
delete from perfiles       where establecimiento_id in ('00000000-0000-0000-0000-00000000a058','00000000-0000-0000-0000-00000000b058');
delete from auth.users     where email in ('spike-a@zaru.test','spike-b@zaru.test');
delete from establecimientos where id in ('00000000-0000-0000-0000-00000000a058','00000000-0000-0000-0000-00000000b058');
```

## 5. Capacidad y costo para 81 establecimientos (CA3)

### 5.1 Demanda estimada

| Variable | Supuesto | Valor |
|---|---|---|
| Sesiones del panel abiertas a la vez | 3 por establecimiento | 243 conexiones Realtime |
| Órdenes por día | 40 por establecimiento | 3.240 diarias, unas 1,2 millones al año |
| Mensajes Realtime al mes | 4 cambios por orden × 3 pantallas | Unos 1,2 millones |
| Tamaño de la base el primer año | ~2 KB por orden con servicios e historial | Unos 2,5 GB |
| Usuarios autenticados al mes | Panel + clientes con OTP | Menos de 30.000 |

### 5.2 Planes y costo

Los precios son de referencia en USD y deben revisarse en las páginas oficiales antes de contratar, porque los proveedores los ajustan con frecuencia. Render cambió su lista de precios en septiembre de 2026.

| Servicio | Plan gratuito | ¿Alcanza para 81? | Plan necesario | Costo mensual |
|---|---|---|---|---|
| Supabase | 500 MB de base, 200 conexiones Realtime, pausa por inactividad | No (243 conexiones y 2,5 GB) | Pro: 8 GB de base, 500 conexiones Realtime, 5 M de mensajes, copias diarias | USD 25 |
| Render (API) | Se suspende tras 15 min sin tráfico | No (la operación es continua) | Instancia Standard (2 GB de RAM) | USD 25 |
| Vercel (frontend) | Hobby, solo para uso no comercial | No para un producto comercial | Pro, 1 integrante | USD 20 |
| SMS y correo (HU-46) | — | Se cobra por uso y se traslada al plan de cada establecimiento (HU-17, HU-25) | — | Variable |
| **Total fijo** | | | | **USD 70** |

Con un dólar de referencia de $3.200 COP (TRM de octubre de 2026), el total fijo es de unos **$224.000 COP al mes, el 28 % del presupuesto de $800.000**.

**Conclusión del CA3:** la arquitectura cabe en el presupuesto. Hay holgura para duplicar la capacidad de la API o subir el cómputo de Supabase (unos USD 60 adicionales) y seguir por debajo del 60 % del presupuesto.

## 6. Riesgos que quedan

| Riesgo | Mitigación |
|---|---|
| Superar 500 conexiones Realtime si crecen las pantallas por sede | Monitorear en F8; el plan Team o cómputo adicional lo resuelve |
| El cliente final por SSE carga la API | Las pruebas de carga de F8 (`escenario-81.js`) lo validan |
| Dependencia de un solo proveedor (Supabase) | PostgreSQL estándar y migraciones versionadas: se puede migrar a RDS o Cloud SQL con `pg_dump` |
| Durante el curso se usan planes gratuitos | Aceptable para desarrollo; el cambio a Pro se hace antes de producción (F8) |

## 7. Respuesta a los criterios de aceptación

| CA | Cumplimiento |
|---|---|
| CA1: documento con la arquitectura elegida y las alternativas descartadas | Secciones 2 y 3 |
| CA2: prototipo con dos establecimientos que prueba aislamiento y tiempo real | Sección 4: 19 de 19 pruebas aprobadas |
| CA3: capacidad y costo frente a los $800.000 mensuales | Sección 5: unos $224.000 COP al mes (28 %) |
