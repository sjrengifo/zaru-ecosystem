# F8 — Producción y operación: Tareas y validación

Rama sugerida: `feature/ZARU-62-produccion`. **Prerrequisitos:** DA-06, DA-07 y DA-08 confirmadas; cuentas en el servicio de monitoreo y de almacenamiento de copias.

## Tareas

### T8.1 — Ambiente de pruebas
**Cubre:** RF-F8-01
1. Crear el proyecto `zaru-staging` en la organización de Supabase y aplicar todas las migraciones con `supabase db push`.
2. Crear el servicio `zaru-api-staging` en Render (agregar al `render.yaml`) y configurar Vercel para usar staging en *preview*.
3. Crear los *environments* `staging` y `produccion` en GitHub con sus secretos.

**Hecho cuando:** staging funciona de punta a punta con su propia base.

### T8.2 — Pipeline de despliegue
**Cubre:** RF-F8-02 a RF-F8-04
1. Escribir `deploy.yml` y las pruebas de humo.
2. Desactivar `autoDeploy` en Render y usar *deploy hooks*.
3. Copia de seguridad previa a migraciones en producción.
4. Verificar ESC-F8-01 con una migración inválida en una rama de prueba, y ESC-F8-02.

### T8.3 — Monitoreo y alertas
**Cubre:** RF-F8-05 a RF-F8-07
1. Integrar Sentry y el *log drain*.
2. Endpoint `GET /metricas` (rol plataforma) con pruebas.
3. Configurar monitores, umbrales y destinatarios; armar el tablero.
4. Verificar ESC-F8-03 deteniendo staging.

### T8.4 — Copias de seguridad
**Cubre:** RF-F8-08 a RF-F8-11
1. Generar el par de claves `age` y entregar la privada a los custodios.
2. Escribir `backup.yml` y ejecutar una corrida manual.
3. Escribir `restauracion.md` y `verificar-restauracion.sql`.
4. Ejecutar ESC-F8-04 y registrar el resultado.

### T8.5 — Cifrado
**Cubre:** RF-F8-12, RF-F8-13, RNF-F8-04
1. Migración para cifrar `clientes.correo` con Vault/`pgsodium` y ajustar el repositorio de clientes.
2. HSTS y verificación de ESC-F8-05 en staging.
3. Revisar que ningún secreto esté fuera del gestor (gitleaks sobre todo el historial).

### T8.6 — Protocolo de incidentes
**Cubre:** RF-F8-14 a RF-F8-16
1. Escribir `incidentes.md` con plantillas.
2. Escribir `impacto-incidente.sql` y verificar ESC-F8-06.
3. Realizar un simulacro con el equipo y registrar los tiempos.

### T8.7 — Publicación en la nube (HU-47)
**Cubre:** RF-F8-17 a RF-F8-19 · Rama: `feature/ZARU-54-despliegue-nube`
1. Integrar `develop` en `main`: Render y Vercel construyen desde `main`.
2. Crear el servicio en Render desde el Blueprint y el proyecto en Vercel, en el orden del README (sección 10): `FRONTEND_URL` debe ser `https://` desde el primer arranque.
3. Configurar Site URL y Redirect URLs en Supabase Auth con el dominio del panel.
4. Crear las variables `URL_API_PRODUCCION` y `URL_PANEL_PRODUCCION` en GitHub y verificar ESC-F8-07 y ESC-F8-08.
5. Registrar las URLs públicas en el README.

**Hecho cuando:** un merge a `main` aparece publicado en ambas URLs y la prueba de humo pasa.

## Compuerta de validación de la fase

### Verificaciones generales
- [ ] G1 Pruebas en verde
- [ ] G2 Cobertura ≥ 80 %
- [ ] G3 Contrato OpenAPI válido y alineado
- [ ] G4 Respuestas validadas contra el contrato
- [ ] G5 `supabase db reset` sin errores, y `supabase db push` limpio en staging y producción
- [ ] G6 Asesores de Supabase sin alertas WARN en **ambos** proyectos
- [ ] G7 Suite de aislamiento en verde contra staging
- [ ] G8 Todos los CA con prueba o evidencia enlazada en `05-trazabilidad.md`
- [ ] G9 CI y pipeline de despliegue en verde
- [ ] G10 Demostración al PO

### Verificaciones específicas
- [ ] Un merge a `develop` despliega en staging sin intervención; uno a `main` exige aprobación.
- [ ] Una migración rota detiene el pipeline y notifica al equipo.
- [ ] Detener staging dispara una alerta en menos de 5 minutos.
- [ ] Existe una copia cifrada de las últimas 24 h fuera de Supabase, y la restauración de prueba está registrada.
- [ ] `curl -I http://…` es redirigido o rechazado; `Strict-Transport-Security` presente.
- [ ] El correo de un cliente no es legible con un `select` directo sobre la tabla.
- [ ] Simulacro de incidente completado y documentado.
- [ ] Panel y API accesibles en sus URLs públicas; un administrador inicia sesión desde el navegador.
- [ ] Un merge a `main` queda publicado sin pasos manuales y la prueba de humo pasa.

### Cierre
- [ ] Estado de `spec.md` cambiado a `Validada`
- [ ] HU-47 a HU-50, HU-53 y HU-56 movidas a "Listo" en Jira
- [ ] **Hito H4 (Producción) alcanzado**
