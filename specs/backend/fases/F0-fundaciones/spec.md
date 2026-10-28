# F0 — Fundaciones técnicas: Especificación

| Campo | Valor |
|---|---|
| Estado | Aprobada |
| Épicas | ZARU-48 (Arquitectura y Backend) |
| Historias | HU-58 Spike (ZARU-64), HU-42 CA2 (ZARU-49), HU-43 (ZARU-50), HU-48 CA3 (ZARU-55), HU-56 CA1–CA2 (ZARU-62) |
| Depende de | Estructura inicial del repositorio |
| Puntos | 21 (Jira) · Sprint 1 |

## 1. Objetivo
Dejar el backend listo para construir funcionalidades de forma segura y verificable: arquitectura en capas, contrato OpenAPI como fuente de verdad, validación y errores estandarizados, logs estructurados, pruebas automatizadas contra una base de datos local y migraciones versionadas ejecutadas en CI.

## 2. Requisitos funcionales

| ID | Requisito | Origen |
|---|---|---|
| RF-F0-01 | La API se expone bajo el prefijo versionado `/api/v1`. | HU-43 CA3 |
| RF-F0-02 | La documentación de todos los endpoints está disponible en `/api/docs` generada desde `openapi.yaml`. | HU-43 CA1 |
| RF-F0-03 | Una petición con datos inválidos recibe `400` con código `VALIDACION` y la lista de campos a corregir. | HU-43 CA2 |
| RF-F0-04 | Todas las respuestas de error siguen el formato único de `04-contrato-api.md`. | HU-43 CA2 |
| RF-F0-05 | Cada error del servidor queda registrado con fecha, hora, `requestId`, ruta y detalle técnico. | HU-48 CA3 |
| RF-F0-06 | `GET /health` responde el estado del servicio y `GET /health/ready` verifica la conexión con la base de datos. | HU-48 |
| RF-F0-07 | Los cambios de esquema se aplican mediante migraciones versionadas reproducibles en cualquier ambiente. | HU-42 CA2 |
| RF-F0-08 | Cada integración al repositorio ejecuta lint, pruebas y validación del contrato; si fallan, el PR no puede integrarse. | HU-56 CA1, CA2 |
| RF-F0-09 | Spike con time-box de 2 días: documento con la arquitectura elegida y las alternativas descartadas (Supabase, AWS, Google Cloud), prototipo con dos establecimientos que demuestre aislamiento y propagación en tiempo real, y comparación de costos para 81 establecimientos frente a $800.000 mensuales. | HU-58 CA1, CA2, CA3 |

## 3. Requisitos no funcionales

| ID | Requisito | Medida |
|---|---|---|
| RNF-F0-01 | El servidor no arranca si falta o es inválida una variable de entorno obligatoria. | Mensaje de error explícito al iniciar |
| RNF-F0-02 | Los logs no contienen tokens, contraseñas ni datos personales. | Revisión con prueba de redacción de `pino` |
| RNF-F0-03 | Los errores 500 no exponen trazas al cliente. | Prueba de integración |
| RNF-F0-04 | Encabezados de seguridad HTTP activos. | `helmet` habilitado; prueba de encabezados |
| RNF-F0-05 | El pipeline de CI termina en menos de 10 minutos. | Duración del workflow |

## 4. Escenarios de aceptación

**ESC-F0-01 — Documentación disponible** (RF-F0-02)
- **Dado** que el servidor está en ejecución
- **Cuando** abro `/api/docs`
- **Entonces** veo todos los endpoints definidos en `openapi.yaml`, con parámetros, respuestas y ejemplos.

**ESC-F0-02 — Datos inválidos** (RF-F0-03, RF-F0-04)
- **Dado** un endpoint que exige un campo `nombre` obligatorio
- **Cuando** envío el cuerpo sin `nombre`
- **Entonces** recibo `400`, código `VALIDACION` y un detalle con `campo: "nombre"`.

**ESC-F0-03 — Error interno registrado** (RF-F0-05, RNF-F0-03)
- **Dado** que un servicio lanza un error no controlado
- **Cuando** proceso la petición
- **Entonces** el cliente recibe `500` con `ERROR_INTERNO` y un `requestId`, y el log contiene ese `requestId` con la traza completa.

**ESC-F0-04 — Base de datos no disponible** (RF-F0-06)
- **Dado** que la base de datos no responde
- **Cuando** consulto `/health/ready`
- **Entonces** recibo `503` y `/health` sigue respondiendo `200`.

**ESC-F0-05 — Migraciones reproducibles** (RF-F0-07)
- **Dado** un ambiente vacío
- **Cuando** ejecuto `supabase db reset`
- **Entonces** se aplican todas las migraciones y el seed, y el esquema coincide con el de producción.

**ESC-F0-06 — PR bloqueado por pruebas** (RF-F0-08)
- **Dado** un PR con una prueba fallando
- **Cuando** se ejecuta el pipeline
- **Entonces** el check falla y la rama protegida impide el merge.

## 5. Fuera de alcance
- Funcionalidades de negocio nuevas (se conservan los módulos existentes, migrados a la nueva estructura).
- Ambientes de pruebas y producción separados y despliegue continuo (F8).
- Monitoreo y alertas externas (F8).

## 6. Decisiones abiertas relacionadas
- Ninguna bloqueante.
