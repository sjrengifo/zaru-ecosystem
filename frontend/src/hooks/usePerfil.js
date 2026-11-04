// HU-59 — Perfil de quien inició sesión (usuario, rol y módulos permitidos).
// RutaProtegida lo consulta una sola vez en GET /me y lo comparte con todas las páginas.
//   const perfil = usePerfil();   // { id, nombre, rol, permisos: { modulos, inicio } } o null
import { createContext, useContext } from 'react';

export const PerfilContext = createContext(null);

export function usePerfil() {
  return useContext(PerfilContext);
}
