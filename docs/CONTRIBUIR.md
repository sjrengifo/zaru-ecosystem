# Cómo contribuir a Zaru

Reglas cortas para que 6 personas trabajen sin pisarse.

## 1. Ramas

| Rama | Para qué | ¿Quién la toca? |
|---|---|---|
| `main` | Versión publicada | Solo vía Pull Request desde `develop`, al cerrar el sprint |
| `develop` | Trabajo del sprint ya revisado | Solo vía Pull Request |
| `feature/ZARU-<n>-<descripcion>` | Una historia de usuario | Quien tenga la historia en Jira |
| `fix/ZARU-<n>-<descripcion>` | Corrección de un error | Quien lo corrija |

Ejemplo: `feature/ZARU-13-promociones`

## 2. Mensajes de commit

Empiezan con la clave de Jira y dicen **qué** se hizo, en presente:

```
ZARU-13: formulario para crear promociones
ZARU-10: tarjetas del dashboard agrupadas por estado
```

> Si el mensaje incluye la clave `ZARU-n`, Jira lo enlaza a la historia automáticamente (si se conecta GitHub a Jira).

## 3. Pull Requests

1. Un PR = una historia de usuario.
2. Llenar la plantilla (aparece sola).
3. **Mínimo 1 aprobación** antes de unir. Idealmente alguien de la otra carrera (DMI ↔ Sistemas).
4. Quien revisa prueba los criterios de aceptación de la historia.

## 4. Flujo en Jira

`Por hacer` → `En curso` (al crear la rama) → `En revisión` (al abrir el PR) → `Listo` (al hacer merge).

## 5. Estilo de código

- Nombres de archivos de páginas y componentes en **PascalCase**: `TarjetaVehiculo.jsx`.
- Variables y funciones en **camelCase**: `obtenerClientes()`.
- Nombres en **español**, igual que el dominio del negocio (cliente, vehículo, orden).
- Un componente por archivo.
- Antes de subir, formatear con Prettier (`Shift + Alt + F` en VS Code).

## 6. Seguridad

- **Nunca** subir archivos `.env`.
- La `service_role key` de Supabase **solo** va en el backend.
- Si una clave se sube por error, avisar de inmediato para cambiarla en Supabase.

## 7. Definition of Ready (DoR)

Una historia puede pasar a `En curso` solo si cumple todo esto:

1. Está escrita como **Como** … **deseo** … **para** …
2. Tiene criterios de aceptación en formato **Dado** … **cuando** … **entonces**, que se puedan comprobar.
3. Está estimada en puntos y tiene la justificación de la estimación.
4. Tiene prioridad MoSCoW (etiqueta `Must`, `Should` o `Could`).
5. Pertenece a una épica.
6. Sus dependencias con otras historias están identificadas y no la bloquean.
7. Está en el sprint activo y tiene responsable.
8. Cabe en un sprint; si no, se divide.

## 8. Definition of Done (DoD) de una historia

Una historia pasa a `Listo` solo si cumple todo esto. Los puntos marcados con (Art. 9) vienen de la definición de hecho de [`specs/backend/00-constitucion.md`](../specs/backend/00-constitucion.md).

1. Todos los criterios de aceptación están implementados.
2. Pruebas automatizadas que cubren los criterios de aceptación, en verde: unitarias, de integración contra Supabase y del frontend (Art. 9).
3. Contrato OpenAPI actualizado y validado con `npm run lint:openapi` (Art. 9).
4. Migraciones aplicadas en Supabase antes del merge a `main`, pruebas de `database/pruebas/` en verde y `database/schema.sql` regenerado (Art. 9).
5. `specs/backend/05-trazabilidad.md` y el README actualizados (Art. 9).
6. Revisada y aprobada en un Pull Request por al menos un integrante, que prueba los criterios de aceptación (Art. 9).
7. CI en verde: frontend, backend y búsqueda de secretos.
8. Desplegada en producción (Vercel y Render) y verificada allí.
9. Evidencia en Jira con capturas de cada criterio de aceptación.
10. Sin datos de prueba en producción.
