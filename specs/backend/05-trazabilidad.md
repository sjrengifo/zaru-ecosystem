# Matriz de trazabilidad

Relaciona cada historia de usuario de Jira con la fase, los requisitos y los escenarios que la cubren, además de su estimación, prioridad y responsable. Las columnas **Prueba** y **Estado** se completan al cerrar cada tarea (Art. 9 de la constitución) y se revisan en la compuerta G8.

Estados: `Pendiente` · `En desarrollo` · `Cubierta` (prueba en verde) · `Validada` (compuerta de la fase cerrada).

> Numeración vigente en Jira desde el 25 de octubre de 2026. Alcance: solo el backend; los criterios que son exclusivamente de interfaz se cubren en el frontend.


## Épica 1 — Panel administrativo web (ZARU-1) · Sprint 1

| HU | Jira | Pts | MoSCoW | Responsable | Fase | Requisitos | Escenarios | Prueba | Estado |
|---|---|---|---|---|---|---|---|---|---|
| HU-01 Iniciar sesión en el panel administrativo | ZARU-2 | 5 | Must | Yeliani | F1 | RF-F1-01, 04, 06 | ESC-F1-01, 04 | — | En desarrollo |
| HU-02 Gestionar usuarios operarios del establecimiento | ZARU-3 | 5 | Must | Yeliani | F1 | RF-F1-03, 05, 07, 08 | ESC-F1-03, 05, 06, 08 | — | Pendiente |
| HU-03 Registrar cliente con autorización de datos | ZARU-4 | 3 | Must | Nikol | F2 | RF-F2-01 a 06 | ESC-F2-01 a 04 | — | Pendiente |
| HU-04 Consultar y editar clientes | ZARU-5 | 2 | Should | Nikol | F2 | RF-F2-07, 08 | ESC-F2-05 | — | Pendiente |
| HU-05 Registrar vehículo asociado a un cliente | ZARU-6 | 3 | Must | Nikol | F2 | RF-F2-11 a 14 | ESC-F2-06 | — | Pendiente |
| HU-06 Consultar historial de servicios de un vehículo | ZARU-7 | 3 | Should | Nikol | F2 | RF-F2-15 | ESC-F2-07 | — | Pendiente |
| HU-07 Gestionar catálogo de servicios y precios | ZARU-8 | 3 | Must | Vanessa | F2 | RF-F2-16 a 18 | ESC-F2-08, 09 | — | Pendiente |
| HU-08 Registrar ingreso de vehículo (orden de servicio) | ZARU-9 | 5 | Must | Vanessa | F3 | RF-F3-01 a 04 | ESC-F3-01, 02 | — | Pendiente |
| HU-09 Visualizar el dashboard operativo en tiempo real | ZARU-10 | 8 | Must | Yeliani | F3 | RF-F3-10, 12 | ESC-F3-07, 09 | — | Pendiente |
| HU-10 Actualizar el estado operativo del vehículo | ZARU-11 | 5 | Must | Vanessa | F3 | RF-F3-05 a 09 | ESC-F3-03 a 06 | — | Pendiente |
| HU-11 Recibir alertas de vehículos sin actualizar | ZARU-12 | 3 | Could | Yeliani | F3 | RF-F3-11 | ESC-F3-07 | — | Pendiente |
| HU-12 Crear y gestionar promociones | ZARU-13 | 5 | Should | María José | F4 | RF-F4-01 a 06 | ESC-F4-01 a 04 | — | Pendiente |
| HU-13 Personalizar el branding de la sede | ZARU-14 | 5 | Should | María José | F4 | RF-F4-07 a 09 | ESC-F4-05, 06 | — | Pendiente |
| HU-14 Recuperar la contraseña del panel administrativo | ZARU-66 | 2 | Should | Yeliani | F1 | RF-F1-12 | — | — | Pendiente |
| HU-15 Configurar la garantía Rain Insure en los servicios | ZARU-67 | 3 | Could | Silvana | F2 | RF-F2-16 | ESC-F2-08 | — | Pendiente |
| HU-16 Consultar reportes de servicios más demandados y horas de mayor afluencia | ZARU-68 | 14 | Could | Silvana | F3 | RF-F3-15, 16 | — | — | Pendiente |

**Total de la épica: 74 puntos.**

## Épica 4 — Arquitectura y backend (ZARU-48) · Sprint 1

| HU | Jira | Pts | MoSCoW | Responsable | Fase | Requisitos | Escenarios | Prueba | Estado |
|---|---|---|---|---|---|---|---|---|---|
| HU-41 Aislar los datos de cada establecimiento en la arquitectura multi-tenant | ZARU-47 | 8 | Must | Samuel | F1 | RF-F1-02, 06, 09 | ESC-F1-04, 07 · suite de aislamiento | — | En desarrollo |
| HU-42 Diseñar e implementar la base de datos del sistema | ZARU-49 | 8 | Must | Samuel | F0 | RF-F0-07 · 03-modelo-de-datos.md | ESC-F0-05 | — | En desarrollo |
| HU-43 Exponer una API REST para los clientes del sistema | ZARU-50 | 5 | Must | Samuel | F0 | RF-F0-01 a 04 | ESC-F0-01, 02 | — | En desarrollo |
| HU-44 Autenticar y autorizar usuarios por roles en el backend | ZARU-51 | 5 | Must | Samuel | F1 | RF-F1-01, 02, 05 · RNF-F1-01 | ESC-F1-01 a 03 | — | En desarrollo |
| HU-45 Propagar en tiempo real los cambios de estado del vehículo | ZARU-52 | 5 | Must | Adri | F3, F5 | RF-F3-12, RF-F5-05 a 07 | ESC-F3-09, ESC-F5-04 a 06 | — | Pendiente |
| HU-46 Gestionar el envío de notificaciones (push, SMS y correo) | ZARU-53 | 8 | Must | Adri | F6 | RF-F6-01, 15, 16, 20 | ESC-F6-01, 09, 12 | — | Pendiente |
| HU-47 Desplegar la plataforma en la nube con balanceo de carga y autoescalado | ZARU-54 | 8 | Should | María José | F8 | RF-F8-17 a 19 | ESC-F8-07 | — | Pendiente |
| HU-48 Monitorear la disponibilidad y el rendimiento del sistema | ZARU-55 | 3 | Should | Silvana | F0, F8 | RF-F0-05, 06, RF-F8-05 a 07 | ESC-F0-03, 04, ESC-F8-03 | — | Pendiente |
| HU-49 Realizar copias de seguridad diarias y restaurar la información | ZARU-56 | 5 | Should | Silvana | F8 | RF-F8-08 a 11 | ESC-F8-04 | — | Pendiente |
| HU-50 Cifrar la información en tránsito y en reposo | ZARU-57 | 3 | Must | Samuel | F1, F8 | RNF-F1-02, 03, RF-F8-12, 13 | ESC-F8-05 | — | En desarrollo |
| HU-51 Registrar la autorización del titular para el tratamiento de datos (Habeas Data) | ZARU-58 | 3 | Must | Samuel | F2 | RF-F2-01, 02, 04, 10 | ESC-F2-01, 02 | — | En desarrollo |
| HU-52 Atender los derechos del titular sobre sus datos personales | ZARU-59 | 5 | Should | Nikol | F2, F5 | RF-F2-08, 09, RF-F5-16 a 18 | ESC-F2-10, ESC-F5-11 | — | Pendiente |
| HU-53 Activar el protocolo de respuesta ante incidentes de seguridad de datos | ZARU-60 | 5 | Should | Nikol | F1, F8 | RF-F1-10, 11, RF-F8-14 a 16 | ESC-F1-03, ESC-F8-06 | — | Pendiente |
| HU-54 Procesar de forma idempotente las acciones sincronizadas desde el dispositivo | ZARU-61 | 3 | Could | Vanessa | F3 | RF-F3-13, 14 | ESC-F3-08 | — | Pendiente |
| HU-55 Guardar y sincronizar las acciones realizadas sin conexión | ZARU-71 | 8 | Could | Vanessa | F3 (frontend) | — (consume RF-F3-14) | — | — | Pendiente |
| HU-56 Automatizar la integración y el despliegue en ambientes separados | ZARU-62 | 5 | Should | María José | F0, F8 | RF-F0-08, RF-F8-01 a 04 | ESC-F0-06, ESC-F8-01, 02 | — | Pendiente |
| HU-57 Registrar y activar un nuevo establecimiento afiliado | ZARU-63 | 5 | Should | Adri | F1 | RF-F1-09, 13 | ESC-F1-07 | — | Pendiente |
| HU-58 Spike: validar la arquitectura y el stack del backend | ZARU-64 | 3 | Must | Samuel | F0 | RF-F0-09 | — | — | En desarrollo |
| HU-59 Proteger el acceso sin contraseña del cliente final | ZARU-65 | 5 | Should | Adri | F5 | RF-F5-02 a 04, 11, 12 · RNF-F5-01 | ESC-F5-08 | — | Pendiente |

**Total de la épica: 100 puntos.**

## Épica 2 — Interfaz del cliente final (ZARU-30) · Sprint 2

| HU | Jira | Pts | MoSCoW | Responsable | Fase | Requisitos | Escenarios | Prueba | Estado |
|---|---|---|---|---|---|---|---|---|---|
| HU-17 Acceder a la plataforma móvil con la placa o el celular, sin contraseña | ZARU-33 | 5 | Must | — | F5 | RF-F5-02, 03 | ESC-F5-01, 02 | — | Pendiente |
| HU-18 Seguimiento en tiempo real del estado del lavado | ZARU-34 | 8 | Must | — | F5 | RF-F5-04, 05 | ESC-F5-03, 04 | — | Pendiente |
| HU-19 Visualizar la línea de tiempo de las etapas del lavado | ZARU-39 | 5 | Should | — | F5 | RF-F5-04 | ESC-F5-03 | — | Pendiente |
| HU-20 Consultar el tiempo estimado de entrega de mi vehículo | ZARU-69 | 3 | Should | — | F5 | RF-F5-04 · RF-F3-04 | ESC-F3-01 | — | Pendiente |
| HU-21 Visualización del detalle de servicios contratados | ZARU-40 | 3 | Should | — | F5 | RF-F5-04 | ESC-F5-03 | — | Pendiente |
| HU-22 Personalización del branding de la sede en la app | ZARU-41 | 5 | Should | — | F4, F5 | RF-F4-09, RF-F5-01 | ESC-F4-05 | — | Pendiente |
| HU-23 Consulta del historial de servicios del vehículo | ZARU-35 | 3 | Should | — | F5 | RF-F5-13, 14 | ESC-F5-09 | — | Pendiente |
| HU-24 Consultar el detalle de un servicio del historial | ZARU-43 | 3 | Could | — | F5 | RF-F5-15 | ESC-F5-10 | — | Pendiente |
| HU-25 Identificación de garantías adicionales (Rain Insure) | ZARU-37 | 2 | Could | — | F2, F5 | RF-F2-16, RF-F5-15 | ESC-F5-10 | — | Pendiente |
| HU-26 Explorador de promociones activas de la sede | ZARU-45 | 3 | Could | — | F5 | RF-F5-09 | ESC-F5-07 | — | Pendiente |
| HU-27 Ver el detalle y condiciones de una promoción | ZARU-46 | 2 | Could | — | F5 | RF-F5-10 | — | — | Pendiente |

**Total de la épica: 42 puntos.**

## Épica 3 — Notificaciones y comunicación (ZARU-15) · Sprint 2

| HU | Jira | Pts | MoSCoW | Responsable | Fase | Requisitos | Escenarios | Prueba | Estado |
|---|---|---|---|---|---|---|---|---|---|
| HU-28 Notificación automática por cambio de estado del vehículo | ZARU-17 | 8 | Must | — | F3, F6 | RF-F3-07, 08, RF-F6-01 a 05 | ESC-F3-05, ESC-F6-01 a 04 | — | Pendiente |
| HU-29 Selección del canal de notificación preferido | ZARU-18 | 5 | Should | — | F6 | RF-F6-07 a 10 | ESC-F6-05, 06 | — | Pendiente |
| HU-30 Autorización y revocación del tratamiento de datos para notificaciones (ley 1581 de 2012) | ZARU-19 | 5 | Must | — | F2, F6, F7 | RF-F2-03 a 05, RF-F6-24, 25 | ESC-F2-03, ESC-F6-14 | — | Pendiente |
| HU-31 Configuración de los estados que generan notificación | ZARU-20 | 3 | Should | — | F6 | RF-F6-12 a 14 | ESC-F6-07, 08 | — | Pendiente |
| HU-32 Personalización de plantillas de mensajes con la marca de la sede | ZARU-21 | 5 | Could | — | F7 | RF-F7-01 a 05 | ESC-F7-01 a 03 | — | Pendiente |
| HU-33 Reintento y canal alterno ante fallas de envío | ZARU-22 | 8 | Should | — | F6 | RF-F6-16 a 19 | ESC-F6-09 a 11 | — | Pendiente |
| HU-34 Bitácora de notificaciones enviadas | ZARU-23 | 5 | Should | — | F6 | RF-F6-20, 21 | ESC-F6-12 | — | Pendiente |
| HU-35 Envío de promociones a clientes del establecimiento | ZARU-24 | 8 | Could | — | F7 | RF-F7-06 a 10 | ESC-F7-04, 05 | — | Pendiente |
| HU-36 Recordatorio de próximo lavado | ZARU-25 | 5 | Could | — | F7 | RF-F7-11 a 14 | ESC-F7-06, 07 | — | Pendiente |
| HU-37 Mensaje manual del operario durante el lavado | ZARU-26 | 5 | Should | — | F7 | RF-F7-15 a 18 | ESC-F7-08, 09 | — | Pendiente |
| HU-38 Centro de notificaciones en la app | ZARU-27 | 3 | Should | — | F6 | RF-F6-22, 23 | ESC-F6-13 | — | Pendiente |
| HU-39 Control de consumo de notificaciones por plan | ZARU-28 | 5 | Could | — | F7 | RF-F7-19 a 23 | ESC-F7-10, 11 | — | Pendiente |
| HU-40 Registrar el dispositivo para recibir notificaciones push | ZARU-70 | 5 | Should | — | F6 | RF-F6-11 | — | — | Pendiente |

**Total de la épica: 70 puntos.**

---

## Resumen

| | Puntos |
|---|---|
| Sprint 1 (Épicas 1 y 4) | 174 |
| Sprint 2 (Épicas 2 y 3) | 112 |
| **Backlog total** | **286** |

Requisitos especificados: 150 RF y 36 RNF, con 82 escenarios de aceptación distribuidos en las fases F0 a F8.

