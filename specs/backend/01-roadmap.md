# Roadmap del backend

El backend se construye en **9 fases incrementales**. Cada fase entrega funcionalidad utilizable de punta a punta, termina con una **compuerta de validación** y deja la base para la siguiente.

---

## Vista general

```
F0 Fundaciones
 └─▶ F1 Identidad y tenants
      └─▶ F2 Clientes, vehículos y catálogo
           └─▶ F3 Órdenes y operación ──────────────┐
                ├─▶ F4 Promociones y branding        │
                └─▶ F5 API del cliente final ◀───────┘
                     └─▶ F6 Notificaciones (núcleo)
                          └─▶ F7 Comunicación avanzada
                               └─▶ F8 Producción y operación
```

F4 y F5 pueden desarrollarse en paralelo una vez cerrada F3, aunque F5 consume el branding de F4 (HU-37); si se paralelizan, F5 usa los valores por defecto hasta que F4 se integre.

---

## Fases

| Fase | Nombre | Objetivo | HUs | Puntos estimados* |
|---|---|---|---|---|
| **F0** | Fundaciones técnicas | Reestructurar el backend en capas, con contrato OpenAPI, validación, errores estándar, logs, pruebas, migraciones versionadas y CI. | HU-44 (CA2), HU-45, HU-50 (CA3), HU-57 (CA1, CA2) | 13 |
| **F1** | Identidad, tenants y autorización | Autenticar usuarios, resolver tenant y rol en cada petición, gestionar operarios y establecimientos, y auditar acciones. | HU-01, HU-02, HU-43, HU-46, HU-52 (CA1, CA3), HU-55 (CA1) | 21 |
| **F2** | Clientes, vehículos, catálogo y datos personales | Registrar clientes con autorización versionada, vehículos, catálogo de servicios e historial; atender derechos del titular. | HU-03, HU-04, HU-05, HU-06, HU-07, HU-16 (CA1, CA4), HU-53, HU-54 | 26 |
| **F3** | Órdenes y operación en tiempo real | Crear órdenes, gestionar la máquina de estados con trazabilidad, alimentar el dashboard y garantizar idempotencia. | HU-08, HU-09, HU-10, HU-11, HU-47 (CA1 panel), HU-56 (CA3) | 29 |
| **F4** | Promociones y branding | Gestionar promociones, aplicarlas al total de la orden y personalizar logo y colores por sede. | HU-12, HU-13 | 13 |
| **F5** | API del cliente final | Acceso sin contraseña por placa o enlace QR, seguimiento en tiempo real, historial, promociones, branding y Rain Insure. | HU-29 a HU-42, HU-47 | 31 |
| **F6** | Motor de notificaciones (núcleo) | Cola de notificaciones, proveedores push/SMS/correo, preferencias del cliente, estados configurables, reintentos, canal alterno, bitácora y centro de notificaciones. | HU-14, HU-15, HU-16 (CA2, CA3), HU-17, HU-19, HU-20, HU-24, HU-48 | 40 |
| **F7** | Comunicación avanzada | Plantillas con marca, campañas segmentadas, recordatorios, mensajes manuales del operario y control de consumo por plan. | HU-18, HU-21, HU-22, HU-23, HU-25 | 29 |
| **F8** | Producción y operación | Ambientes separados, despliegue continuo, monitoreo y alertas, copias de seguridad, cifrado y protocolo de incidentes. | HU-49, HU-50, HU-51, HU-52 (CA2), HU-55 (CA2, CA3), HU-57 (CA3) | 21 |

\* Los puntos estiman **solo el esfuerzo de backend** de cada fase; no son la suma de los puntos de Jira, que también incluyen el trabajo de frontend. Además, las HUs de las Épicas 3 y 4 aún no tienen estimación en Jira. Estas cifras son preliminares y deben validarse en el refinamiento del backlog. **Total estimado del backend: 223 puntos.**

---

## Compuertas de validación

Cada fase termina con una compuerta definida al final de su `tareas.md`. Además de los puntos específicos de cada fase, **todas** las compuertas exigen:

| # | Verificación | Cómo se comprueba |
|---|---|---|
| G1 | Todas las pruebas en verde | `npm test` en `backend/` |
| G2 | Cobertura ≥ 80 % en `src/modules` y `src/shared` | `npm run test:coverage` |
| G3 | Contrato OpenAPI válido y alineado | `npm run lint:openapi` sin errores; cada endpoint de la fase aparece en `/api/docs` |
| G4 | Pruebas de contrato | Las respuestas de las pruebas de integración se validan contra `openapi.yaml` |
| G5 | Migraciones reproducibles | `supabase db reset` aplica todas las migraciones y el seed sin errores |
| G6 | Base de datos segura | Asesores de Supabase (seguridad y rendimiento) sin alertas `WARN` o superiores |
| G7 | Aislamiento multi-tenant | La suite `tests/integration/tenant-isolation` incluye los endpoints nuevos y pasa |
| G8 | Criterios de aceptación cubiertos | Todos los CA de las HUs de la fase tienen prueba enlazada en `05-trazabilidad.md` |
| G9 | CI en verde | El workflow de GitHub Actions pasa en el PR de cierre de fase |
| G10 | Demostración | Recorrido de los escenarios de la fase ante el PO (Postman o `/api/docs`) y registro en Jira |

Una fase con algún punto sin cumplir **no se cierra**: se crea una tarea de corrección en Jira y se vuelve a ejecutar la compuerta.

---

## Hitos de entrega

| Hito | Fases | Resultado |
|---|---|---|
| **H1 — Panel operativo (MVP interno)** | F0 – F3 | El panel administrativo puede operar un car wash: usuarios, clientes, vehículos, catálogo, órdenes y dashboard en tiempo real. |
| **H2 — Experiencia del cliente final** | F4 – F5 | El cliente final sigue su vehículo desde el celular con la marca de la sede. |
| **H3 — Comunicación** | F6 – F7 | Notificaciones automáticas, campañas y recordatorios. |
| **H4 — Producción** | F8 | Plataforma desplegada, monitoreada y respaldada. |

---

## Dependencias externas por fase

| Fase | Dependencia | Acción previa |
|---|---|---|
| F0 | Docker + Supabase CLI | Instalar en los equipos de desarrollo y en CI |
| F4 | Supabase Storage | Crear buckets `logos` y `evidencias` (por migración) |
| F6 | Proveedores de envío | Cuentas de prueba: Web Push (claves VAPID), SMS (Twilio) y correo (Resend) |
| F8 | Monitoreo externo | Cuentas en un servicio de uptime y de captura de errores |
