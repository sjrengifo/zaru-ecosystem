// HU-08 y HU-10 — Lógica de órdenes.
// TODO HU-08: crear orden con servicios, calcular subtotal, aplicar promoción vigente (HU-12 CA3) y total.
// TODO HU-10: avanzar estado (recibido → en_lavado → listo → entregado),
//   actualizar "estado_desde", guardar fila en historial_estados con usuario y hora.
//   Al quedar "entregado", guardar entregada_at (queda en el historial del vehículo).
import { pendiente } from './pendiente.js';

export const listarActivas = pendiente('HU-09');
export const crear = pendiente('HU-08');
export const cambiarEstado = pendiente('HU-10');
