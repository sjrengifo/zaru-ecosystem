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

F4 y F5 pueden desarrollarse en paralelo una vez cerrada F3, aunque F5 consume el branding de F4 (HU-22); si se paralelizan, F5 usa los valores por defecto hasta que F4 se integre.

---

## Planeación por sprints

El proyecto tiene **dos sprints de dos semanas**. El Sprint 1 construye la base técnica y el panel administrativo (Épicas 1 y 4); el Sprint 2, la experiencia del cliente final y la comunicación (Épicas 2 y 3).

| Sprint | Fechas | Épicas | Fases | Puntos (Jira) |
|---|---|---|---|---|
| **Sprint 1** | 20 oct – 4 nov 2026 | Épica 1 (ZARU-1) y Épica 4 (ZARU-48) | F0, F1, F2, F3, F4 y F8, más HU-46 (núcleo de F6) y HU-59 (de F5) | **174** |
| **Sprint 2** | Por definir (2 semanas) | Épica 2 (ZARU-30) y Épica 3 (ZARU-15) | F5, F6 y F7 | **112** |

## Fases

Los puntos son los de Jira. Cada HU se cuenta en la fase donde se construye su parte principal.

| Fase | Sprint | Nombre | HUs | Puntos |
|---|---|---|---|---|
| **F0** | 1 | Fundaciones técnicas | HU-58 Spike, HU-42 Base de datos, HU-43 API REST, HU-56 CI/CD | 21 |
| **F1** | 1 | Identidad, tenants y autorización | HU-01, HU-02, HU-14, HU-41, HU-44, HU-57 | 30 |
| **F2** | 1 | Clientes, vehículos, catálogo y datos personales | HU-03, HU-04, HU-05, HU-06, HU-07, HU-15, HU-51, HU-52 | 25 |
| **F3** | 1 | Órdenes y operación en tiempo real | HU-08, HU-09, HU-10, HU-11, HU-16, HU-45, HU-54, HU-55 | 51 |
| **F4** | 1 | Promociones y branding | HU-12, HU-13 | 10 |
| **F8** | 1 | Producción y operación | HU-47, HU-48, HU-49, HU-50, HU-53 | 24 |
| **F6 (núcleo)** | 1 | Motor de envío de notificaciones | HU-46 | 8 |
| **F5 (seguridad)** | 1 | Protección del acceso sin contraseña | HU-59 | 5 |
| **F5** | 2 | API del cliente final | HU-17 a HU-27 | 42 |
| **F6** | 2 | Notificaciones | HU-28, HU-29, HU-30, HU-31, HU-33, HU-34, HU-38, HU-40 | 42 |
| **F7** | 2 | Comunicación avanzada | HU-32, HU-35, HU-36, HU-37, HU-39 | 28 |

F8 se adelanta al Sprint 1 porque sus HUs pertenecen a la Épica 4. Se trabaja en paralelo con F0–F4 (configuración de CI/CD, monitoreo, copias y documentación), sin depender del código de negocio.

## Sprint 1: responsables y orden de trabajo

Samuel tiene las HUs que hoy están en curso, porque son la base de todas las demás. El resto se reparte entre 21 y 25 puntos por persona, agrupado en cadenas para reducir las dependencias entre integrantes.

| Responsable | Puntos | Orden de trabajo (→) |
|---|---|---|
| Samuel Rengifo | 35 | HU-58 Spike → HU-42 BD → HU-41 Multi-tenant → HU-44 Auth/roles → HU-43 API → HU-51 Habeas Data → HU-50 Cifrado |
| Adri Martínez | 23 | HU-57 Alta de establecimiento → HU-45 Tiempo real → HU-59 Acceso sin contraseña → HU-46 Notificaciones |
| Yeliani Barbosa | 23 | HU-01 Login → HU-14 Recuperar contraseña → HU-02 Operarios → HU-09 Dashboard → HU-11 Alertas* |
| Nikol Salamanca | 21 | HU-53 Protocolo de incidentes → HU-03 Registrar cliente → HU-05 Vehículo → HU-04 Consultar/editar → HU-06 Historial → HU-52 Derechos del titular |
| Vanessa Nuñez | 24 | HU-07 Catálogo → HU-08 Orden de servicio → HU-10 Cambio de estado → HU-54 Idempotencia* → HU-55 Sin conexión* |
| María José Rosas | 23 | HU-56 CI/CD → HU-13 Branding → HU-12 Promociones → HU-47 Despliegue |
| Silvana Cuartas | 25 | HU-48 Monitoreo → HU-49 Copias de seguridad → HU-15 Rain Insure* → HU-16 Reportes* |

\* HUs Could: son las primeras que pasan al Sprint 2 si el avance del 01/11 es bajo.

| Ola | Fechas | Trabajo |
|---|---|---|
| 0 | 27 – 29 oct | Base técnica (Samuel). En paralelo, sin dependencias: HU-01, HU-14, HU-53, HU-56, HU-48, HU-49 y pantallas con datos simulados |
| 1 | 29 – 31 oct | Requiere la base: HU-02, HU-57, HU-03, HU-05, HU-07, HU-13, HU-45 |
| 2 | 31 oct – 2 nov | HU-04, HU-08, HU-10, HU-12, HU-59, HU-52, HU-47 |
| 3 | 2 – 4 nov | HU-06, HU-09, HU-46, HU-11 y las HUs Could |

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
| **H1 — Panel operativo (cierre del Sprint 1)** | F0 – F4 y F8 | El panel administrativo puede operar un car wash: usuarios, clientes, vehículos, catálogo, órdenes y dashboard en tiempo real. |
| **H2 — Experiencia del cliente final (Sprint 2)** | F5 | El cliente final sigue su vehículo desde el celular con la marca de la sede. |
| **H3 — Comunicación (Sprint 2)** | F6 – F7 | Notificaciones automáticas, campañas y recordatorios. |
| **H4 — Producción** | F8 completa (ambientes, monitoreo y copias activos) | Plataforma desplegada, monitoreada y respaldada. |

---

## Dependencias externas por fase

| Fase | Dependencia | Acción previa |
|---|---|---|
| F0 | Docker + Supabase CLI | Instalar en los equipos de desarrollo y en CI |
| F4 | Supabase Storage | Crear buckets `logos` y `evidencias` (por migración) |
| F6 | Proveedores de envío | Cuentas de prueba: Web Push (claves VAPID), SMS (Twilio) y correo (Resend) |
| F8 | Monitoreo externo | Cuentas en un servicio de uptime y de captura de errores |
