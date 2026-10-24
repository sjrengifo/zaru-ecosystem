# Especificaciones del backend — Spec Driven Development

Este directorio contiene el plan de desarrollo del backend de ZARU Ecosystem siguiendo **Spec Driven Development (SDD)**: primero se especifica *qué* debe hacer el sistema y *cómo se va a comprobar*, después se diseña *cómo* se construye y solo al final se escribe el código.

La fuente de los requisitos son las historias de usuario de las cuatro épicas registradas en Jira (espacio **Zaru**).

---

## Estructura

```
specs/backend/
├── README.md                    Este archivo: cómo usar el directorio
├── 00-constitucion.md           Principios no negociables del backend
├── 01-roadmap.md                Fases, dependencias, alcance y compuertas de validación
├── 02-arquitectura.md           Capas, convenciones y decisiones técnicas (ADR)
├── 03-modelo-de-datos.md        Esquema objetivo y migraciones por fase
├── 04-contrato-api.md           Convenciones REST y catálogo de endpoints v1
├── 05-trazabilidad.md           Matriz HU → fase → requisito → endpoint → prueba
├── 06-decisiones-abiertas.md    Ambigüedades del backlog y decisiones por confirmar con el PO
├── plantillas/                  Plantillas para especificar nuevas funcionalidades
│   ├── spec.md
│   ├── plan.md
│   └── tareas.md
└── fases/
    ├── F0-fundaciones/
    ├── F1-identidad-y-tenants/
    ├── F2-clientes-vehiculos-catalogo/
    ├── F3-ordenes-y-operacion/
    ├── F4-promociones-y-branding/
    ├── F5-api-cliente-final/
    ├── F6-notificaciones-nucleo/
    ├── F7-comunicacion-avanzada/
    └── F8-produccion-y-operacion/
```

Cada fase contiene tres documentos:

| Documento | Responde a | Contenido |
|---|---|---|
| `spec.md` | **¿Qué** y **para qué**? | Objetivo, HUs cubiertas, requisitos funcionales (RF) y no funcionales (RNF), escenarios de aceptación, fuera de alcance |
| `plan.md` | **¿Cómo?** | Diseño técnico: migraciones, endpoints, servicios, reglas de negocio, riesgos |
| `tareas.md` | **¿En qué orden?** | Guía de implementación paso a paso y **compuerta de validación** de la fase |

---

## Flujo de trabajo SDD

Cada fase se ejecuta con el mismo ciclo. No se avanza a un paso sin cerrar el anterior.

```
 1. Especificar ──▶ 2. Clarificar ──▶ 3. Planificar ──▶ 4. Contrato ──▶ 5. Pruebas ──▶ 6. Implementar ──▶ 7. Validar
    spec.md          decisiones-        plan.md          openapi.yaml     (en rojo)       (a verde)        compuerta
                     abiertas.md
```

1. **Especificar.** Revisar `spec.md` de la fase contra las HUs de Jira. Si una HU cambia en Jira, se actualiza primero la especificación.
2. **Clarificar.** Toda ambigüedad se registra en `06-decisiones-abiertas.md`. Una decisión abierta que bloquee la fase debe resolverse con el Product Owner antes de planificar.
3. **Planificar.** Revisar `plan.md`: migraciones, endpoints y reglas. Cualquier cambio de arquitectura se registra como ADR en `02-arquitectura.md`.
4. **Contrato primero.** Escribir o actualizar los endpoints de la fase en `backend/openapi/openapi.yaml` **antes** de implementarlos. El contrato es la especificación ejecutable que comparten backend y frontend.
5. **Pruebas primero.** Cada escenario de aceptación (Dado / Cuando / Entonces) se traduce a una prueba automatizada que inicialmente falla.
6. **Implementar.** Seguir `tareas.md` en orden. Cada tarea termina con su criterio "Hecho cuando".
7. **Validar.** Ejecutar la **compuerta de validación** al final de `tareas.md`. La fase solo se cierra si todos los puntos están marcados.

---

## Reglas de uso

- **La especificación manda.** Si el código y la especificación difieren, se corrige uno de los dos en el mismo Pull Request; nunca se dejan desalineados.
- **Un requisito, un identificador.** Los requisitos usan el formato `RF-F<fase>-<nn>` (funcional) y `RNF-F<fase>-<nn>` (no funcional), y se citan en pruebas, commits y PRs.
- **Trazabilidad obligatoria.** Al cerrar una tarea se actualiza `05-trazabilidad.md` con el endpoint y la prueba que cubren cada criterio de aceptación.
- **Nuevas funcionalidades.** Se especifican copiando `plantillas/` en una nueva carpeta dentro de `fases/` o de la fase correspondiente.
- **Estado de una fase.** Se indica en la cabecera de su `spec.md`: `Borrador` → `Aprobada` → `En desarrollo` → `Validada`.
