// HU-46 — Plantillas de los dos correos al cliente: ingreso del vehículo (CA1) y vehículo listo (CA2).
// Cada plantilla devuelve { asunto, html, texto }. El texto plano acompaña al HTML para los clientes
// de correo que no lo muestran y para mejorar la entrega (menos probabilidad de spam).
// Todo dato que viene de la base se escapa: un nombre como "<script>" se muestra tal cual, no se ejecuta.

const ZONA = 'America/Bogota';

export function escaparHtml(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const formatoPesos = (valor) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(valor ?? 0));

export const formatoFechaHora = (valor) =>
  new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, dateStyle: 'long', timeStyle: 'short' }).format(new Date(valor ?? Date.now()));

const COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;
const colorSeguro = (color) => (COLOR_HEX.test(color ?? '') ? color : '#2563EB');
const primerNombre = (nombre) => String(nombre ?? '').trim().split(/\s+/)[0] || 'cliente';

function marco({ establecimiento, titulo, cuerpoHtml }) {
  const color = colorSeguro(establecimiento?.color_primario);
  const nombreSede = escaparHtml(establecimiento?.nombre ?? 'Zaru');
  const encabezado = establecimiento?.logo_url
    ? `<img src="${escaparHtml(establecimiento.logo_url)}" alt="${nombreSede}" style="max-height:48px;max-width:180px">`
    : `<span style="font-size:20px;font-weight:700;color:#fff">${nombreSede}</span>`;
  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#f5f7fb;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb;padding:24px 0">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
<tr><td style="background:${color};padding:20px 24px">${encabezado}</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 12px;font-size:20px">${escaparHtml(titulo)}</h1>
${cuerpoHtml}
</td></tr>
<tr><td style="padding:16px 24px;background:#f9fafb;color:#6b7280;font-size:12px">
Recibes este correo porque dejaste tu vehículo en ${nombreSede}. Es un mensaje automático: por favor no respondas.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function placaHtml(placa) {
  return `<span style="display:inline-block;padding:4px 10px;background:#ffd400;border:2px solid #111827;border-radius:6px;font-weight:700;letter-spacing:2px">${escaparHtml(placa)}</span>`;
}

/**
 * CA1: confirmación de ingreso con los servicios solicitados.
 * @param {{ establecimiento, cliente, orden, vehiculo, servicios: Array<{nombre, precio}> }} datos
 */
export function plantillaIngreso({ establecimiento, cliente, orden, vehiculo, servicios = [] }) {
  const sede = establecimiento?.nombre ?? 'el car wash';
  const filas = servicios
    .map((s) => `<tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9">${escaparHtml(s.nombre)}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #f1f5f9">${formatoPesos(s.precio)}</td></tr>`)
    .join('');
  const descuento = Number(orden?.descuento ?? 0) > 0
    ? `<tr><td style="padding:8px 0;color:#166534">Descuento</td><td align="right" style="padding:8px 0;color:#166534">−${formatoPesos(orden.descuento)}</td></tr>`
    : '';

  const cuerpoHtml = `
<p style="margin:0 0 16px">Hola ${escaparHtml(primerNombre(cliente?.nombre))}, recibimos tu vehículo ${placaHtml(vehiculo?.placa)} el ${escaparHtml(formatoFechaHora(orden?.created_at))}.</p>
<p style="margin:0 0 8px;font-weight:600">Servicios solicitados</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
${filas}
${descuento}
<tr><td style="padding:10px 0;font-weight:700">Total a pagar en el punto</td><td align="right" style="padding:10px 0;font-weight:700">${formatoPesos(orden?.total)}</td></tr>
</table>
<p style="margin:16px 0 0">Te escribiremos de nuevo cuando esté listo para recoger. Mientras tanto, aprovecha tu tiempo.</p>`;

  const texto = [
    `Hola ${primerNombre(cliente?.nombre)}, recibimos tu vehículo ${vehiculo?.placa} en ${sede} el ${formatoFechaHora(orden?.created_at)}.`,
    '',
    'Servicios solicitados:',
    ...servicios.map((s) => `- ${s.nombre}: ${formatoPesos(s.precio)}`),
    ...(Number(orden?.descuento ?? 0) > 0 ? [`Descuento: -${formatoPesos(orden.descuento)}`] : []),
    `Total a pagar en el punto: ${formatoPesos(orden?.total)}`,
    '',
    'Te escribiremos de nuevo cuando esté listo para recoger.',
  ].join('\n');

  return {
    asunto: `Recibimos tu vehículo ${vehiculo?.placa ?? ''} en ${sede}`.replace(/\s+/g, ' ').trim(),
    html: marco({ establecimiento, titulo: 'Tu vehículo ya está con nosotros', cuerpoHtml }),
    texto,
  };
}

/** CA2: aviso de que el vehículo está listo para recoger. */
export function plantillaListo({ establecimiento, cliente, orden, vehiculo }) {
  const sede = establecimiento?.nombre ?? 'el car wash';
  const cuerpoHtml = `
<p style="margin:0 0 16px">Hola ${escaparHtml(primerNombre(cliente?.nombre))}, tu vehículo ${placaHtml(vehiculo?.placa)} está <strong>listo para recoger</strong> en ${escaparHtml(sede)}.</p>
<p style="margin:0 0 16px">Valor a pagar en el punto: <strong>${formatoPesos(orden?.total)}</strong></p>
<p style="margin:0">¡Gracias por confiar en nosotros!</p>`;

  return {
    asunto: `Tu vehículo ${vehiculo?.placa ?? ''} está listo para recoger`.replace(/\s+/g, ' ').trim(),
    html: marco({ establecimiento, titulo: '¡Tu vehículo está listo!', cuerpoHtml }),
    texto: [
      `Hola ${primerNombre(cliente?.nombre)}, tu vehículo ${vehiculo?.placa} está listo para recoger en ${sede}.`,
      `Valor a pagar en el punto: ${formatoPesos(orden?.total)}`,
      '',
      '¡Gracias por confiar en nosotros!',
    ].join('\n'),
  };
}

export const PLANTILLAS = {
  'orden.recibida': plantillaIngreso,
  'orden.lista': plantillaListo,
};
