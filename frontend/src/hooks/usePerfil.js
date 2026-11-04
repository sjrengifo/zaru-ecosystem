// HU-59 — Perfil y permisos del usuario ya validados por SesionProvider mediante GET /me.
import { useSesion } from './useSesion.js';

export function usePerfil() {
  const { usuario } = useSesion();
  return usuario;
}
