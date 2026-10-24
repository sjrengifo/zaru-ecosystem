# F<n> — <Nombre>: Plan técnico

## 1. Resumen del enfoque
<Cómo se resuelve la especificación en dos o tres frases.>

## 2. Cambios en el modelo de datos
Migración: `supabase/migrations/<timestamp>_<nombre>.sql`

| Objeto | Cambio | Motivo (RF) |
|---|---|---|

## 3. Contrato de API

| Método | Ruta | Rol | Petición | Respuesta | RF |
|---|---|---|---|---|---|

## 4. Diseño de módulos
- **Servicio:** reglas de negocio y su orden de evaluación.
- **Repositorio:** consultas y filtros de tenant.
- **Middlewares:** autenticación, rol, idempotencia, auditoría.

## 5. Reglas de negocio

| Regla | Implementación | Error si se incumple |
|---|---|---|

## 6. Estrategia de pruebas

| Nivel | Qué se prueba |
|---|---|
| Unitarias | |
| Integración | |
| Aislamiento multi-tenant | |

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
