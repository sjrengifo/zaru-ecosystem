// HU-17 — Reglas de la pantalla de acceso del cliente final, sin React.
// Mismos formatos que valida la API (backend/src/shared/accesoCliente.js).

const FORMATO_PLACA = /^[A-Z0-9]{5,7}$/;

/** Lo que se muestra mientras el cliente escribe: mayúsculas, sin espacios ni guiones, máximo 7. */
export const limpiarPlaca = (valor) => String(valor ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 7);

/** Solo dígitos, máximo 10 (el +57 se quita si viene pegado). */
export function limpiarCelular(valor) {
  let digitos = String(valor ?? '').replace(/\D/g, '');
  if (digitos.length > 10 && digitos.startsWith('57')) digitos = digitos.slice(2);
  return digitos.slice(0, 10);
}

/** Celular en grupos para leerlo mejor: 300 123 4567. */
export function formatoCelular(digitos) {
  const d = limpiarCelular(digitos);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join(' ');
}

/** Mensaje de validación antes de llamar a la API, o '' si el dato sirve. */
export function errorBusqueda(modo, valor) {
  if (modo === 'placa') {
    const placa = limpiarPlaca(valor);
    if (!placa) return 'Escribe la placa de tu vehículo.';
    return FORMATO_PLACA.test(placa) ? '' : 'La placa debe tener entre 5 y 7 letras y números, por ejemplo ABC123.';
  }
  const celular = limpiarCelular(valor);
  if (!celular) return 'Escribe tu número de celular.';
  return /^3\d{9}$/.test(celular) ? '' : 'El celular debe tener 10 dígitos y empezar por 3, por ejemplo 300 123 4567.';
}

/** Cuerpo de la búsqueda para la API. */
export const cuerpoBusqueda = (modo, valor) =>
  modo === 'placa' ? { placa: limpiarPlaca(valor) } : { celular: limpiarCelular(valor) };

/** Enlace público de la sede que el administrador comparte o imprime como QR (CA2). */
export function enlaceSede(slug, origen = typeof window !== 'undefined' ? window.location.origin : '') {
  return `${origen}/s/${encodeURIComponent(slug)}`;
}
