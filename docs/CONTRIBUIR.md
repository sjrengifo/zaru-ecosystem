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
