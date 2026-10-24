# F2 — Clientes, vehículos, catálogo y datos personales: Tareas y validación

Rama sugerida: `feature/ZARU-4-clientes-y-datos-personales` (y una rama por bloque si se reparte el trabajo).

## Tareas

### T2.1 — Migración de datos personales
**Cubre:** RF-F2-04, RF-F2-09, RF-F2-10
1. Crear la migración del plan, incluida la copia de autorizaciones existentes a `consentimientos`.
2. Crear las funciones `crear_cliente_con_consentimiento` y `anonimizar_cliente` en `privado`.
3. Prueba SQL: `update consentimientos …` falla.
4. `supabase db reset` y asesores.

**Hecho cuando:** el cliente demo tiene su consentimiento migrado y los asesores están limpios.

### T2.2 — Contrato de F2
1. Agregar endpoints y esquemas (`Cliente`, `ClienteResumen`, `Consentimiento`, `Vehiculo`, `ServicioHistorial`, `Servicio`) a `openapi.yaml`.
2. Revisión en equipo del contrato con el frontend (los nombres de campos quedan fijados aquí).

### T2.3 — Registro de clientes con autorizaciones
**Cubre:** RF-F2-01 a RF-F2-06
1. Pruebas de ESC-F2-01 a ESC-F2-04.
2. Servicio `clientes.crear` que invoca la función SQL vía `supabase.rpc`.
3. Endpoints de consentimientos y `GET /politicas-datos/vigente`.

**Hecho cuando:** las cuatro pruebas pasan y la prueba de atomicidad confirma que no quedan clientes sin consentimiento.

### T2.4 — Consulta y edición de clientes
**Cubre:** RF-F2-07, RF-F2-08, RF-F2-14, RNF-F2-03
1. Prueba de ESC-F2-05.
2. Búsqueda combinada nombre / celular / placa con paginación.
3. Auditoría de `GET /clientes/{id}`.

### T2.5 — Vehículos
**Cubre:** RF-F2-11 a RF-F2-14
1. Pruebas unitarias de placa y prueba de ESC-F2-06.
2. Módulo `vehiculos`.

### T2.6 — Historial del vehículo
**Cubre:** RF-F2-15
1. Prueba de ESC-F2-07 y de un historial con órdenes (crear órdenes entregadas con la fábrica de pruebas).
2. Consulta paginada uniendo `ordenes` y `orden_servicios`.

### T2.7 — Catálogo de servicios
**Cubre:** RF-F2-16 a RF-F2-18
1. Pruebas de ESC-F2-08 y ESC-F2-09.
2. Completar `POST` y `PATCH /servicios` con Rain Insure.

### T2.8 — Anonimización
**Cubre:** RF-F2-09
1. Prueba de ESC-F2-10.
2. Endpoint `POST /clientes/{id}/anonimizar`.

### T2.9 — Aislamiento y rendimiento
1. Agregar los endpoints nuevos a la suite de aislamiento.
2. Ejecutar el script de 5 000 clientes y registrar el tiempo de búsqueda en el PR.

## Compuerta de validación de la fase

### Verificaciones generales
- [ ] G1 Pruebas en verde
- [ ] G2 Cobertura ≥ 80 %
- [ ] G3 Contrato OpenAPI válido y alineado
- [ ] G4 Respuestas validadas contra el contrato
- [ ] G5 `supabase db reset` sin errores
- [ ] G6 Asesores de Supabase sin alertas WARN
- [ ] G7 Suite de aislamiento con los endpoints de F2
- [ ] G8 Todos los CA con prueba enlazada en `05-trazabilidad.md`
- [ ] G9 CI en verde
- [ ] G10 Demostración al PO

### Verificaciones específicas
- [ ] Registrar sin autorización no crea filas en `clientes` (verificar con `select count(*)` antes y después).
- [ ] `GET /clientes/{id}/consentimientos` muestra fecha, hora, canal, IP y versión de la política.
- [ ] Un `update` sobre `consentimientos` es rechazado por la base.
- [ ] Buscar `abc-123`, `ABC123` y `abc 123` devuelve el mismo vehículo.
- [ ] Búsqueda con 5 000 clientes < 500 ms.
- [ ] Un cliente anonimizado no conserva su nombre, celular ni correo en ninguna tabla.
- [ ] El frontend del panel (páginas Clientes, Vehículos y Servicios) funciona contra los nuevos endpoints.

### Cierre
- [ ] Estado de `spec.md` cambiado a `Validada`
- [ ] HU-03 a HU-07 y HU-53 movidas a "Listo" en Jira (backend); HU-16 y HU-54 actualizadas con su avance parcial
