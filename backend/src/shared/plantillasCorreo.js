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

function marco({ establecimiento, titulo, cuerpoHtml, enlaceBaja = null, textoEnlaceBaja = 'Dejar de recibir estos avisos', notaPie = null }) {
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
${notaPie ?? `Recibes este correo porque dejaste tu vehículo en ${nombreSede}.`} Es un mensaje automático: por favor no respondas.${enlaceBaja ? `<br><a href="${escaparHtml(enlaceBaja)}" style="color:#6b7280">${escaparHtml(textoEnlaceBaja)}</a>` : ''}
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/**
 * HU-18: enlace a la página pública de seguimiento del lavado. Null si la orden no trae código.
 * Usa la URL del panel (FRONTEND_URL), que también sirve la vista móvil del cliente final.
 */
export function enlaceSeguimiento(codigo, base = process.env.FRONTEND_URL || 'http://localhost:5173') {
  if (!codigo) return null;
  return `${String(base).replace(/\/+$/, '')}/seguimiento/${encodeURIComponent(codigo)}`;
}

function botonSeguimiento(enlace, color) {
  if (!enlace) return '';
  return `<p style="margin:16px 0 0"><a href="${escaparHtml(enlace)}" style="display:inline-block;padding:10px 18px;background:${color};color:#fff;border-radius:8px;font-weight:600;text-decoration:none">Ver el estado de mi lavado</a></p>`;
}

/** HU-30 CA3: versión en texto plano del enlace "dejar de recibir". */
const pieTexto = (enlaceBaja) => (enlaceBaja ? ['', `¿No quieres recibir más estos avisos? ${enlaceBaja}`] : []);

function placaHtml(placa) {
  return `<span style="display:inline-block;padding:4px 10px;background:#ffd400;border:2px solid #111827;border-radius:6px;font-weight:700;letter-spacing:2px">${escaparHtml(placa)}</span>`;
}

/**
 * CA1: confirmación de ingreso con los servicios solicitados.
 * @param {{ establecimiento, cliente, orden, vehiculo, servicios: Array<{nombre, precio}> }} datos
 */
export function plantillaIngreso({ establecimiento, cliente, orden, vehiculo, servicios = [], enlaceBaja = null }) {
  const sede = establecimiento?.nombre ?? 'el car wash';
  const filas = servicios
    .map((s) => `<tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9">${escaparHtml(s.nombre)}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #f1f5f9">${formatoPesos(s.precio)}</td></tr>`)
    .join('');
  const enlace = enlaceSeguimiento(orden?.codigo_seguimiento);
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
<p style="margin:16px 0 0">Te escribiremos de nuevo cuando esté listo para recoger. Mientras tanto, aprovecha tu tiempo.</p>
${botonSeguimiento(enlace, colorSeguro(establecimiento?.color_primario))}`;

  const texto = [
    `Hola ${primerNombre(cliente?.nombre)}, recibimos tu vehículo ${vehiculo?.placa} en ${sede} el ${formatoFechaHora(orden?.created_at)}.`,
    '',
    'Servicios solicitados:',
    ...servicios.map((s) => `- ${s.nombre}: ${formatoPesos(s.precio)}`),
    ...(Number(orden?.descuento ?? 0) > 0 ? [`Descuento: -${formatoPesos(orden.descuento)}`] : []),
    `Total a pagar en el punto: ${formatoPesos(orden?.total)}`,
    '',
    'Te escribiremos de nuevo cuando esté listo para recoger.',
    ...(enlace ? ['', `Sigue el estado de tu lavado en tiempo real: ${enlace}`] : []),
    ...pieTexto(enlaceBaja),
  ].join('\n');

  return {
    asunto: `Recibimos tu vehículo ${vehiculo?.placa ?? ''} en ${sede}`.replace(/\s+/g, ' ').trim(),
    html: marco({ establecimiento, titulo: 'Tu vehículo ya está con nosotros', cuerpoHtml, enlaceBaja }),
    texto,
  };
}

/** CA2: aviso de que el vehículo está listo para recoger. */
export function plantillaListo({ establecimiento, cliente, orden, vehiculo, enlaceBaja = null }) {
  const sede = establecimiento?.nombre ?? 'el car wash';
  const cuerpoHtml = `
<p style="margin:0 0 16px">Hola ${escaparHtml(primerNombre(cliente?.nombre))}, tu vehículo ${placaHtml(vehiculo?.placa)} está <strong>listo para recoger</strong> en ${escaparHtml(sede)}.</p>
<p style="margin:0 0 16px">Valor a pagar en el punto: <strong>${formatoPesos(orden?.total)}</strong></p>
<p style="margin:0">¡Gracias por confiar en nosotros!</p>`;

  return {
    asunto: `Tu vehículo ${vehiculo?.placa ?? ''} está listo para recoger`.replace(/\s+/g, ' ').trim(),
    html: marco({ establecimiento, titulo: '¡Tu vehículo está listo!', cuerpoHtml, enlaceBaja }),
    texto: [
      `Hola ${primerNombre(cliente?.nombre)}, tu vehículo ${vehiculo?.placa} está listo para recoger en ${sede}.`,
      `Valor a pagar en el punto: ${formatoPesos(orden?.total)}`,
      '',
      '¡Gracias por confiar en nosotros!',
      ...pieTexto(enlaceBaja),
    ].join('\n'),
  };
}

/** RF-F7-18: aviso inmediato al cliente con el mensaje que escribió el operario. */
export function plantillaNovedad({ establecimiento, cliente, orden, vehiculo, novedad }) {
  const sede = establecimiento?.nombre ?? 'el car wash';
  const tipo = {
    demora: 'Actualización de la entrega estimada',
    dano_preexistente: 'Reporte de daño preexistente',
    objeto_encontrado: 'Objeto encontrado en tu vehículo',
    otro: 'Actualización sobre tu vehículo',
  }[novedad?.tipo] ?? 'Actualización sobre tu vehículo';
  const texto = novedad?.mensaje || tipo;
  const minutos = Number(novedad?.minutos_extra ?? novedad?.minutosExtra ?? 0);
  const fechaEstimada = orden?.entrega_estimada_at
    ? formatoFechaHora(orden.entrega_estimada_at)
    : null;
  const cuerpoHtml = `
<p style="margin:0 0 16px">Hola ${escaparHtml(primerNombre(cliente?.nombre))}, tenemos una novedad sobre tu vehículo ${placaHtml(vehiculo?.placa)} en ${escaparHtml(sede)}.</p>
<p style="margin:0 0 16px;white-space:pre-wrap">${escaparHtml(texto)}</p>
${minutos ? `<p style="margin:0 0 16px">Tiempo adicional estimado: <strong>${minutos} minutos</strong>${fechaEstimada ? ` · nueva hora estimada: <strong>${escaparHtml(fechaEstimada)}</strong>` : ''}</p>` : ''}
<p style="margin:0">Puedes consultar el estado de tu vehículo en el enlace de seguimiento que recibiste al ingresar.</p>`;
  return {
    asunto: `${tipo} · ${vehiculo?.placa ?? ''}`.trim(),
    html: marco({ establecimiento, titulo: tipo, cuerpoHtml }),
    texto: [
      `Hola ${primerNombre(cliente?.nombre)}, tenemos una novedad sobre tu vehículo ${vehiculo?.placa} en ${sede}.`,
      '',
      texto,
      ...(minutos ? [`Tiempo adicional estimado: ${minutos} minutos${fechaEstimada ? `; nueva hora estimada: ${fechaEstimada}` : ''}.`] : []),
    ].join('\n'),
  };
}

export const formatoDia = (valor) =>
  new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, dateStyle: 'long' }).format(new Date(`${valor}T12:00:00-05:00`));

/** HU-36: recordatorio del próximo lavado calculado con la frecuencia del vehículo. */
export function plantillaRecordatorio({ establecimiento, cliente, vehiculo, recordatorio, enlaceRecordatorio = null }) {
  const sede = establecimiento?.nombre ?? 'el car wash';
  const dia = formatoDia(recordatorio?.fecha_estimada);
  const telefono = String(establecimiento?.telefono ?? '').trim();
  const contacto = telefono ? ` Puedes agendar llamando al ${telefono}.` : ' Puedes agendar en el establecimiento.';
  const cuerpoHtml = `
<p style="margin:0 0 16px">Hola ${escaparHtml(primerNombre(cliente?.nombre))}, por el ritmo de tus lavados estimamos que tu vehículo ${placaHtml(vehiculo?.placa)} estará listo para un nuevo lavado el <strong>${escaparHtml(dia)}</strong>.</p>
<p style="margin:0">${escaparHtml(contacto.trim())}</p>`;

  return {
    asunto: `¿Cuándo lavamos tu ${vehiculo?.placa ?? 'vehículo'}?`.replace(/\s+/g, ' ').trim(),
    html: marco({
      establecimiento,
      titulo: 'Tu próximo lavado se acerca',
      cuerpoHtml,
      enlaceBaja: enlaceRecordatorio,
      textoEnlaceBaja: 'No volver a recordarme',
      notaPie: `Recibes este recordatorio porque lavaste tu vehículo en ${sede}.`,
    }),
    texto: [
      `Hola ${primerNombre(cliente?.nombre)}, por el ritmo de tus lavados estimamos que tu vehículo ${vehiculo?.placa} estará listo para un nuevo lavado el ${dia}.`,
      contacto.trim(),
      ...(enlaceRecordatorio ? ['', `No quiero recibir más recordatorios de este vehículo: ${enlaceRecordatorio}`] : []),
    ].join('\n'),
  };
}

export const PLANTILLAS = {
  'orden.recibida': plantillaIngreso,
  'orden.lista': plantillaListo,
  'orden.novedad': plantillaNovedad,
  'recordatorio.proximo_lavado': plantillaRecordatorio,
};
