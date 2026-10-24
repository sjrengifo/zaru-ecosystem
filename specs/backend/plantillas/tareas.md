# F<n> — <Nombre>: Tareas y validación

Ejecutar en orden. Cada tarea es un commit o un PR pequeño que referencia su identificador (`T<n>.<m>`) y el RF que cubre.

## Tareas

### T<n>.1 — <Título>
**Cubre:** RF-F<n>-01
1. <Paso concreto>
2. <Paso concreto>

**Hecho cuando:** <Resultado verificable.>

## Compuerta de validación de la fase

### Verificaciones generales (G1–G10 del roadmap)
- [ ] G1 Pruebas en verde
- [ ] G2 Cobertura ≥ 80 %
- [ ] G3 Contrato OpenAPI válido y alineado
- [ ] G4 Respuestas validadas contra el contrato
- [ ] G5 `supabase db reset` sin errores
- [ ] G6 Asesores de Supabase sin alertas WARN
- [ ] G7 Suite de aislamiento multi-tenant incluye los endpoints nuevos
- [ ] G8 Todos los CA con prueba enlazada en `05-trazabilidad.md`
- [ ] G9 CI en verde
- [ ] G10 Demostración al PO

### Verificaciones específicas
- [ ] <Prueba manual o automatizada propia de la fase>

### Cierre
- [ ] Estado de `spec.md` cambiado a `Validada`
- [ ] HUs movidas a "Listo" en Jira
