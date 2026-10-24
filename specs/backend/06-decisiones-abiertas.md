# Decisiones abiertas

Ambigüedades e inconsistencias detectadas al especificar el backend a partir del backlog de Jira. Cada una tiene una **propuesta por defecto** con la que el plan avanza; el Product Owner debe confirmarla o cambiarla antes de la fase indicada.

| Estado | Significado |
|---|---|
| Abierta | Pendiente de respuesta del PO |
| Confirmada | El PO aceptó la propuesta |
| Cambiada | El PO decidió otra opción (se actualiza la especificación) |

---

## DA-01 — Historias duplicadas en la Épica 2
**Bloquea:** F5 · **Estado:** Abierta

En la Épica 2 hay pares de historias con el mismo objetivo:

| Historia | Duplicada con | Diferencia |
|---|---|---|
| HU-29 (ZARU-33) | HU-35 (ZARU-39) | Texto idéntico |
| HU-29 / HU-35 | HU-34 (ZARU-38) | HU-34 agrega acceso por QR y el caso de placa no registrada |
| HU-31 (ZARU-35) | HU-38 (ZARU-42) | HU-38 agrega filtro por placa |
| HU-32 (ZARU-36) | HU-41 (ZARU-45) | Mismo alcance |
| HU-33 (ZARU-37) | HU-40 (ZARU-44) | Mismo alcance |

**Propuesta:** Conservar HU-34, HU-38, HU-41 y HU-40 (las más completas), incorporar en ellas los criterios únicos de su par y cerrar HU-35, HU-31, HU-32 y HU-33 como duplicadas en Jira. El backend las especifica como un solo requisito por par.

## DA-02 — Estados del servicio
**Bloquea:** F3 · **Estado:** Abierta

El panel (Épica 1) usa `recibido → en_lavado → listo → entregado`. Las HUs de notificaciones mencionan además "lavado iniciado", "secado" y "listo para entrega" (HU-14, HU-17).

**Propuesta:** Estados oficiales `recibido → en_lavado → secado → listo → entregado`, donde `secado` es opcional (se puede pasar de `en_lavado` a `listo`). "Lavado iniciado" corresponde a `en_lavado` y "listo para entrega" a `listo`.

## DA-03 — Seguridad del acceso por placa
**Bloquea:** F5 · **Estado:** Abierta

HU-29 y HU-34 permiten entrar solo con la placa o el celular. La placa es visible para cualquiera, por lo que no puede dar acceso a datos personales ni al historial.

**Propuesta (ADR-05):** La placa y el código QR dan acceso únicamente al **seguimiento de la orden activa** (estado, servicios, valor, marca de la sede). El historial, las preferencias y los datos personales requieren un código OTP enviado al celular registrado.

## DA-04 — Descripción de HU-20
**Bloquea:** F6 · **Estado:** Abierta

La descripción "Como… deseo… para…" de HU-20 (Bitácora de notificaciones, ZARU-23) es una copia de la de HU-19. Sus criterios de aceptación sí corresponden a la bitácora.

**Propuesta:** Corregir en Jira: *"Como administrador del establecimiento, deseo consultar el historial de notificaciones enviadas a mis clientes, para verificar que recibieron los avisos y atender reclamos."*

## DA-05 — Contraseñas cifradas (HU-46 CA4)
**Bloquea:** F1 · **Estado:** Abierta

**Propuesta:** Las contraseñas las gestiona Supabase Auth, que las almacena con bcrypt. El backend nunca recibe ni guarda contraseñas. El criterio se valida verificando que ninguna tabla de `public` contiene contraseñas.

## DA-06 — Infraestructura de HU-49 (autoescalado en AWS o Google Cloud)
**Bloquea:** F8 · **Estado:** Abierta

El proyecto usa Render y Supabase en planes gratuitos, que no ofrecen autoescalado ni balanceo configurable.

**Propuesta:** En F8 se entrega (1) la arquitectura objetivo documentada en AWS o GCP con su estimación de costos, (2) la contenedorización del backend (Dockerfile) lista para esa plataforma y (3) pruebas de carga con el volumen de 81 establecimientos sobre la infraestructura actual. La migración real queda condicionada a presupuesto.

## DA-07 — Copias de seguridad (HU-51)
**Bloquea:** F8 · **Estado:** Abierta

El plan gratuito de Supabase no incluye copias diarias descargables ni restauración a un punto en el tiempo.

**Propuesta:** Un workflow programado de GitHub Actions ejecuta `pg_dump` diario, cifra el archivo con `age` y lo guarda fuera de Supabase (almacenamiento externo o artefacto privado). Se documenta y prueba el procedimiento de restauración en un proyecto de pruebas.

## DA-08 — Cifrado en reposo (HU-52 CA2)
**Bloquea:** F8 · **Estado:** Abierta

**Propuesta:** Supabase cifra los discos en reposo (AES-256). Adicionalmente, las columnas más sensibles que no se usan para búsqueda (correo) pueden cifrarse a nivel de columna con `pgsodium`/Vault. Teléfono y placa se mantienen sin cifrado de columna porque se usan para búsqueda y unicidad.

## DA-09 — Proveedores de notificaciones y costos
**Bloquea:** F6 · **Estado:** Abierta

**Propuesta:** Web Push (gratuito, sin proveedor) para push; Twilio (cuenta de prueba) para SMS; Resend (plan gratuito) para correo. En desarrollo y pruebas se usa el proveedor `consola`, que registra el mensaje sin enviarlo.

## DA-10 — Sedes de un mismo establecimiento
**Bloquea:** F1 · **Estado:** Abierta

Varias HUs hablan de "sede" y "establecimiento" como sinónimos; HU-20 CA3 menciona "otras sedes ni otros establecimientos".

**Propuesta:** En esta versión, cada sede es un establecimiento (tenant) independiente. Un dueño con varias sedes tiene un usuario por sede. La agrupación de sedes bajo una marca se evalúa como mejora futura.

## DA-12 — Criterio incompleto en HU-25
**Bloquea:** F7 · **Estado:** Abierta

El criterio CA3 de HU-25 (ZARU-28) está cortado en Jira: *"…entonces el sistema mostrará por establecimie"*. Tampoco están definidos los cupos de cada plan.

**Propuesta:** CA3 = *"…mostrará por establecimiento el plan, el cupo y el consumo del mes de SMS y correos, y el porcentaje usado"*. Cupos iniciales: básico 200 SMS / 1 000 correos; intermedio 600 / 3 000; empresarial 2 000 / 10 000.

## DA-11 — Estimación de las Épicas 3 y 4
**Bloquea:** Planeación de sprints · **Estado:** Abierta

Las HUs de las Épicas 3 (Notificaciones) y 4 (Arquitectura y Backend) no tienen story points ni etiqueta MoSCoW en Jira.

**Propuesta:** Estimarlas en el próximo refinamiento usando como referencia los puntos por fase de `01-roadmap.md`.
