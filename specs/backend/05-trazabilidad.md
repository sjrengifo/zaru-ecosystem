# Matriz de trazabilidad

Relaciona cada historia de usuario de Jira con la fase, los requisitos y los escenarios que la cubren. Las columnas **Prueba** y **Estado** se completan al cerrar cada tarea (Art. 9 de la constitución) y se revisan en la compuerta G8.

Estados: `Pendiente` · `En desarrollo` · `Cubierta` (prueba en verde) · `Validada` (compuerta de la fase cerrada).

> Alcance: solo el backend. Los criterios que son exclusivamente de interfaz se marcan como **Frontend** y no requieren prueba de backend.

---

## Épica 1 — Panel administrativo web (ZARU-1)

| HU | Jira | Criterios | Fase | Requisitos | Escenarios | Prueba | Estado |
|---|---|---|---|---|---|---|---|
| HU-01 Iniciar sesión | ZARU-2 | CA1 · CA2 (Frontend/Supabase Auth) · CA3 | F1 | RF-F1-01, 04, 06 | ESC-F1-01, 04 | — | Pendiente |
| HU-02 Usuarios operarios | ZARU-3 | CA1 · CA2 · CA3 | F1 | RF-F1-03, 05, 07, 08 | ESC-F1-03, 05, 06, 08 | — | Pendiente |
| HU-03 Registrar cliente | ZARU-4 | CA1 · CA2 · CA3 | F2 | RF-F2-01, 02, 04, 06 | ESC-F2-01, 02, 04 | — | Pendiente |
| HU-04 Consultar y editar clientes | ZARU-5 | CA1 · CA2 | F2 | RF-F2-07, 08 | ESC-F2-05 | — | Pendiente |
| HU-05 Registrar vehículo | ZARU-6 | CA1 · CA2 · CA3 | F2 | RF-F2-11 a 14 | ESC-F2-06 | — | Pendiente |
| HU-06 Historial del vehículo | ZARU-7 | CA1 · CA2 | F2 | RF-F2-15 | ESC-F2-07 | — | Pendiente |
| HU-07 Catálogo de servicios | ZARU-8 | CA1 · CA2 · CA3 | F2 | RF-F2-16 a 18 | ESC-F2-08, 09 | — | Pendiente |
| HU-08 Orden de servicio | ZARU-9 | CA1 · CA2 | F3 | RF-F3-01 a 04 | ESC-F3-01, 02 | — | Pendiente |
| HU-09 Dashboard en tiempo real | ZARU-10 | CA1 · CA2 · CA3 | F3 | RF-F3-10, 12 | ESC-F3-07, 09 | — | Pendiente |
| HU-10 Actualizar estado | ZARU-11 | CA1 · CA2 · CA3 | F3 | RF-F3-05, 06, 08, 09 | ESC-F3-03, 04, 06 | — | Pendiente |
| HU-11 Alertas sin actualizar | ZARU-12 | CA1 · CA2 | F3 | RF-F3-11 | ESC-F3-07 | — | Pendiente |
| HU-12 Promociones | ZARU-13 | CA1 · CA2 · CA3 | F4 | RF-F4-01 a 06 | ESC-F4-01 a 04 | — | Pendiente |
| HU-13 Branding | ZARU-14 | CA1 · CA2 · CA3 | F4 | RF-F4-07 a 09 | ESC-F4-05, 06 | — | Pendiente |

## Épica 2 — Interfaz del cliente final (ZARU-30)

| HU | Jira | Criterios | Fase | Requisitos | Escenarios | Prueba | Estado |
|---|---|---|---|---|---|---|---|
| HU-29 Acceso sin fricción | ZARU-33 | CA1 · CA2 (Frontend) | F5 | RF-F5-02 | ESC-F5-01 | — | Pendiente |
| HU-30 Seguimiento en tiempo real | ZARU-34 | CA1 · CA2 | F5 | RF-F5-04, 05 | ESC-F5-03, 04 | — | Pendiente |
| HU-31 Historial de servicios | ZARU-35 | CA1 · CA2 | F5 | RF-F5-14 | ESC-F5-09 | — | Pendiente (duplicada de HU-38, DA-01) |
| HU-32 Promociones de la sede | ZARU-36 | CA1 · CA2 | F5 | RF-F5-09 | ESC-F5-07 | — | Pendiente (duplicada de HU-41, DA-01) |
| HU-33 Rain Insure | ZARU-37 | CA1 | F2, F5 | RF-F2-16, RF-F5-04, 15 | ESC-F5-10 | — | Pendiente (duplicada de HU-40, DA-01) |
| HU-34 Ingreso por placa / QR | ZARU-38 | CA1 · CA2 | F5 | RF-F5-02, 03 | ESC-F5-01, 02 | — | Pendiente |
| HU-35 Acceso sin fricción | ZARU-39 | CA1 · CA2 (Frontend) | F5 | RF-F5-02 | ESC-F5-01 | — | Pendiente (duplicada de HU-29, DA-01) |
| HU-36 Detalle de servicios contratados | ZARU-40 | CA1 · CA2 | F5 | RF-F5-04 | ESC-F5-03 | — | Pendiente |
| HU-37 Branding en la app | ZARU-41 | CA1 | F4, F5 | RF-F4-09, RF-F5-01 | ESC-F4-05 | — | Pendiente |
| HU-38 Historial cronológico | ZARU-42 | CA1 · CA2 | F5 | RF-F5-13, 14 | ESC-F5-09 | — | Pendiente |
| HU-39 Detalle de un servicio | ZARU-43 | CA1 | F5 | RF-F5-15 | ESC-F5-10 | — | Pendiente |
| HU-40 Garantía Rain Insure | ZARU-44 | CA1 | F2, F5 | RF-F2-16, RF-F5-15 | ESC-F5-10 | — | Pendiente |
| HU-41 Explorador de promociones | ZARU-45 | CA1 · CA2 | F5 | RF-F5-09 | ESC-F5-07 | — | Pendiente |
| HU-42 Detalle de una promoción | ZARU-46 | CA1 | F5 | RF-F5-10 | — | — | Pendiente |

## Épica 3 — Notificaciones y comunicación (ZARU-15)

| HU | Jira | Criterios | Fase | Requisitos | Escenarios | Prueba | Estado |
|---|---|---|---|---|---|---|---|
| HU-14 Notificación por cambio de estado | ZARU-17 | CA1 · CA2 · CA3 · CA4 | F3, F6 | RF-F3-07, 08, RF-F6-01 a 05 | ESC-F3-05, ESC-F6-01 a 04 | — | Pendiente |
| HU-15 Canal preferido | ZARU-18 | CA1 · CA2 · CA3 · CA4 | F6 | RF-F6-07 a 10 | ESC-F6-05, 06 | — | Pendiente |
| HU-16 Autorización y revocación | ZARU-19 | CA1 · CA2 · CA3 · CA4 | F2, F6, F7 | RF-F2-03 a 05, RF-F6-24, 25, RF-F7-07 | ESC-F2-03, ESC-F6-14, ESC-F7-04 | — | Pendiente |
| HU-17 Estados que notifican | ZARU-20 | CA1 · CA2 · CA3 | F6 | RF-F6-12 a 14 | ESC-F6-07, 08 | — | Pendiente |
| HU-18 Plantillas con marca | ZARU-21 | CA1 · CA2 · CA3 · CA4 | F7 | RF-F7-01 a 05 | ESC-F7-01 a 03 | — | Pendiente |
| HU-19 Reintento y canal alterno | ZARU-22 | CA1 · CA2 · CA3 · CA4 | F6 | RF-F6-16 a 19 | ESC-F6-09 a 11 | — | Pendiente |
| HU-20 Bitácora de notificaciones | ZARU-23 | CA1 · CA2 · CA3 | F6 | RF-F6-20, 21 | ESC-F6-12 | — | Pendiente (DA-04) |
| HU-21 Promociones segmentadas | ZARU-24 | CA1 · CA2 · CA3 · CA4 | F7 | RF-F7-06 a 10 | ESC-F7-04, 05 | — | Pendiente |
| HU-22 Recordatorio de lavado | ZARU-25 | CA1 · CA2 · CA3 | F7 | RF-F7-11 a 14 | ESC-F7-06, 07 | — | Pendiente |
| HU-23 Mensaje manual del operario | ZARU-26 | CA1 · CA2 · CA3 | F7 | RF-F7-15 a 18 | ESC-F7-08, 09 | — | Pendiente |
| HU-24 Centro de notificaciones | ZARU-27 | CA1 · CA2 · CA3 | F6 | RF-F6-22, 23 | ESC-F6-13 | — | Pendiente |
| HU-25 Consumo por plan | ZARU-28 | CA1 · CA2 · CA3 | F7 | RF-F7-19 a 23 | ESC-F7-10, 11 | — | Pendiente (DA-12) |

## Épica 4 — Arquitectura y backend (ZARU-48)

| HU | Jira | Criterios | Fase | Requisitos | Escenarios | Prueba | Estado |
|---|---|---|---|---|---|---|---|
| HU-43 Aislamiento multi-tenant | ZARU-47 | CA1 · CA2 · CA3 | F1 | RF-F1-02, 06, 09 | ESC-F1-04, 07 · suite de aislamiento | — | Pendiente |
| HU-44 Base de datos | ZARU-49 | CA1 · CA2 · CA3 | F0–F7 | RF-F0-07 · `03-modelo-de-datos.md` | ESC-F0-05 · pruebas de rendimiento por fase | — | Pendiente |
| HU-45 API REST documentada | ZARU-50 | CA1 · CA2 · CA3 | F0 | RF-F0-01 a 04 | ESC-F0-01, 02 | — | Pendiente |
| HU-46 Autenticación y roles | ZARU-51 | CA1 · CA2 · CA3 · CA4 | F1 | RF-F1-01, 02, 05 · RNF-F1-01 | ESC-F1-01 a 03 | — | Pendiente (DA-05) |
| HU-47 Tiempo real | ZARU-52 | CA1 · CA2 · CA3 | F3, F5 | RF-F3-12, RF-F5-05 a 07 | ESC-F3-09, ESC-F5-04 a 06 | — | Pendiente |
| HU-48 Envío de notificaciones | ZARU-53 | CA1 · CA2 · CA3 · CA4 | F6 | RF-F6-01, 15, 16, 20 | ESC-F6-01, 09, 12 | — | Pendiente |
| HU-49 Despliegue escalable | ZARU-54 | CA1 · CA2 · CA3 · CA4 | F8 | RF-F8-17 a 19 | ESC-F8-07 | — | Pendiente (DA-06) |
| HU-50 Monitoreo | ZARU-55 | CA1 · CA2 · CA3 | F0, F8 | RF-F0-05, 06, RF-F8-05 a 07 | ESC-F0-03, 04, ESC-F8-03 | — | Pendiente |
| HU-51 Copias de seguridad | ZARU-56 | CA1 · CA2 · CA3 · CA4 | F8 | RF-F8-08 a 11 | ESC-F8-04 | — | Pendiente (DA-07) |
| HU-52 Cifrado | ZARU-57 | CA1 · CA2 · CA3 | F1, F8 | RNF-F1-02, 03, RF-F8-12, 13 | ESC-F8-05 | — | Pendiente (DA-08) |
| HU-53 Autorización Habeas Data | ZARU-58 | CA1 · CA2 · CA3 | F2 | RF-F2-01, 02, 04, 10 | ESC-F2-01, 02 | — | Pendiente |
| HU-54 Derechos del titular | ZARU-59 | CA1 · CA2 · CA3 | F2, F5 | RF-F2-08, 09, RF-F5-16 a 18 | ESC-F2-10, ESC-F5-11 | — | Pendiente |
| HU-55 Auditoría e incidentes | ZARU-60 | CA1 · CA2 · CA3 | F1, F8 | RF-F1-10, 11, RF-F8-14 a 16 | ESC-F1-03, ESC-F8-06 | — | Pendiente |
| HU-56 Sincronización sin conexión | ZARU-61 | CA1, CA2 (Frontend) · CA3 | F3 | RF-F3-13 | ESC-F3-08 | — | Pendiente |
| HU-57 CI/CD y ambientes | ZARU-62 | CA1 · CA2 · CA3 | F0, F8 | RF-F0-08, RF-F8-01 a 04 | ESC-F0-06, ESC-F8-01, 02 | — | Pendiente |

---

## Resumen de cobertura por fase

| Fase | HUs completas | HUs parciales | Requisitos | Escenarios |
|---|---|---|---|---|
| F0 | HU-45 | HU-44, HU-50, HU-57 | 8 RF · 5 RNF | 6 |
| F1 | HU-01, HU-02, HU-43, HU-46 | HU-52, HU-55 | 11 RF · 5 RNF | 8 |
| F2 | HU-03 a HU-07, HU-53 | HU-16, HU-33, HU-40, HU-54 | 18 RF · 3 RNF | 10 |
| F3 | HU-08 a HU-11 | HU-14, HU-47, HU-56 | 13 RF · 4 RNF | 9 |
| F4 | HU-12, HU-13 | HU-37 | 9 RF · 3 RNF | 6 |
| F5 | HU-29 a HU-42 | HU-47, HU-54 | 18 RF · 5 RNF | 11 |
| F6 | HU-14, HU-15, HU-17, HU-19, HU-20, HU-24, HU-48 | HU-16 | 25 RF · 4 RNF | 14 |
| F7 | HU-18, HU-21, HU-22, HU-23, HU-25 | HU-16 | 23 RF · 3 RNF | 11 |
| F8 | HU-49, HU-50, HU-51, HU-52, HU-55, HU-57 | — | 19 RF · 4 RNF | 7 |
| **Total** | **54 HUs** | | **144 RF · 36 RNF** | **82** |
