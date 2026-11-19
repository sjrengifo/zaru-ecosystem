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

/**
 * Fecha sin hora (AAAA-MM-DD) en hora de Colombia. Se arma en UTC para que el día no se corra:
 * las fechas de vigencia de una promoción son días completos, no instantes.
 */
export const formatoFecha = (valor) => {
  const [anio, mes, dia] = String(valor ?? '').slice(0, 10).split('-').map(Number);
  if (!anio || !mes || !dia) return '';
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(anio, mes - 1, dia)));
};

const COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;
const colorSeguro = (color) => (COLOR_HEX.test(color ?? '') ? color : '#2563EB');
const primerNombre = (nombre) => String(nombre ?? '').trim().split(/\s+/)[0] || 'cliente';

function marco({
  establecimiento,
  titulo,
  cuerpoHtml,
  enlaceBaja = null,
  textoBaja = 'Dejar de recibir estos avisos',
  motivo = null,
}) {
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
Recibes este correo porque ${motivo ?? `dejaste tu vehículo en ${nombreSede}`}. Es un mensaje automático: por favor no respondas.${enlaceBaja ? `<br><a href="${escaparHtml(enlaceBaja)}" style="color:#6b7280">${escaparHtml(textoBaja)}</a>` : ''}
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

/**
 * HU-31: avisos de los estados intermedios y de la entrega. Comparten el mismo marco que los
 * correos de ingreso y listo, e incluyen el enlace de seguimiento mientras la orden siga vigente.
 */
function plantillaCambioEstado(
  { establecimiento, cliente, orden, vehiculo, enlaceBaja = null },
  { titulo, asunto, fraseHtml, fraseTexto, cierreHtml, cierreTexto, conSeguimiento = true },
) {
  const enlace = conSeguimiento ? enlaceSeguimiento(orden?.codigo_seguimiento) : null;
  const cuerpoHtml = `
<p style="margin:0 0 16px">Hola ${escaparHtml(primerNombre(cliente?.nombre))}, ${fraseHtml}</p>
<p style="margin:0 0 16px">${cierreHtml}</p>
${botonSeguimiento(enlace, colorSeguro(establecimiento?.color_primario))}`;

  return {
    asunto: `${asunto} ${vehiculo?.placa ?? ''}`.replace(/\s+/g, ' ').trim(),
    html: marco({ establecimiento, titulo, cuerpoHtml, enlaceBaja }),
    texto: [
      `Hola ${primerNombre(cliente?.nombre)}, ${fraseTexto}`,
      cierreTexto,
      ...(enlace ? ['', `Sigue el estado de tu lavado en tiempo real: ${enlace}`] : []),
      ...pieTexto(enlaceBaja),
    ].join('\n'),
  };
}

/** HU-31: el vehículo empezó el lavado. */
export function plantillaEnLavado(datos) {
  const sede = datos.establecimiento?.nombre ?? 'el car wash';
  return plantillaCambioEstado(datos, {
    titulo: 'Tu vehículo ya está en lavado',
    asunto: 'Tu vehículo ya inició el lavado:',
    fraseHtml: `tu vehículo ${placaHtml(datos.vehiculo?.placa)} ya inició el lavado en ${escaparHtml(sede)}.`,
    fraseTexto: `tu vehículo ${datos.vehiculo?.placa} ya inició el lavado en ${sede}.`,
    cierreHtml: 'Te avisaremos cuando pase a secado.',
    cierreTexto: 'Te avisaremos cuando pase a secado.',
  });
}

/** HU-31: el vehículo está en secado. */
export function plantillaSecado(datos) {
  const sede = datos.establecimiento?.nombre ?? 'el car wash';
  return plantillaCambioEstado(datos, {
    titulo: 'Estamos secando tu vehículo',
    asunto: 'Tu vehículo está en secado:',
    fraseHtml: `estamos secando y dando los últimos detalles a tu vehículo ${placaHtml(datos.vehiculo?.placa)} en ${escaparHtml(sede)}.`,
    fraseTexto: `estamos secando y dando los últimos detalles a tu vehículo ${datos.vehiculo?.placa} en ${sede}.`,
    cierreHtml: 'Muy pronto estará listo para recoger.',
    cierreTexto: 'Muy pronto estará listo para recoger.',
  });
}

/** HU-31: el vehículo se entregó al cliente. */
export function plantillaEntregada(datos) {
  const sede = datos.establecimiento?.nombre ?? 'el car wash';
  return plantillaCambioEstado(datos, {
    titulo: 'Entregamos tu vehículo',
    asunto: 'Entregamos tu vehículo:',
    fraseHtml: `entregamos tu vehículo ${placaHtml(datos.vehiculo?.placa)} en ${escaparHtml(sede)}.`,
    fraseTexto: `entregamos tu vehículo ${datos.vehiculo?.placa} en ${sede}.`,
    cierreHtml: '¡Gracias por confiar en nosotros!',
    cierreTexto: '¡Gracias por confiar en nosotros!',
    conSeguimiento: false,
  });
}

/**
 * HU-35 (RF-F7-10) — correo de una promoción segmentada.
 * La promoción llega como foto guardada al confirmar la campaña (`promocion_snapshot`), no se
 * consulta de nuevo al enviar: así el mensaje dice lo mismo que vio el administrador.
 * @param {{ establecimiento, cliente, promocion: object, enlaceBaja?: string }} datos
 */
export function plantillaPromocion({ establecimiento, cliente, promocion = {}, enlaceBaja = null }) {
  const sede = establecimiento?.nombre ?? 'tu car wash';
  const titulo = promocion.nombre ?? 'Una promoción para ti';
  const descuento = Number(promocion.descuentoPct ?? 0);
  const servicios = (Array.isArray(promocion.servicios) ? promocion.servicios : []).filter(Boolean);
  const descripcion = promocion.descripcion ? String(promocion.descripcion) : '';
  const condiciones = promocion.condiciones ? String(promocion.condiciones) : '';
  const vigencia = promocion.fechaFin
    ? `Válida hasta el ${formatoFecha(promocion.fechaFin)}`
    : '';

  const descuentoHtml = descuento > 0
    ? `<p style="margin:0 0 16px;font-size:28px;font-weight:700;color:${colorSeguro(establecimiento?.color_primario)}">${descuento}% de descuento</p>`
    : '';
  const serviciosHtml = servicios.length
    ? `<p style="margin:16px 0 4px;font-weight:600">Aplica en</p>
<ul style="margin:0 0 16px;padding-left:20px">${servicios.map((s) => `<li>${escaparHtml(s)}</li>`).join('')}</ul>`
    : '';
  const condicionesHtml = condiciones
    ? `<p style="margin:0 0 16px;color:#4b5563;font-size:14px"><strong>Condiciones:</strong> ${escaparHtml(condiciones)}</p>`
    : '';

  const cuerpoHtml = `
<p style="margin:0 0 16px">Hola ${escaparHtml(primerNombre(cliente?.nombre))}, en ${escaparHtml(sede)} preparamos algo para tu vehículo.</p>
<h2 style="margin:0 0 8px;font-size:22px">${escaparHtml(titulo)}</h2>
${descuentoHtml}
${descripcion ? `<p style="margin:0 0 16px">${escaparHtml(descripcion)}</p>` : ''}
${serviciosHtml}
${condicionesHtml}
${vigencia ? `<p style="margin:0;font-weight:600">${escaparHtml(vigencia)}</p>` : ''}`;

  const lineas = [
    `Hola ${primerNombre(cliente?.nombre)}, en ${sede} preparamos algo para tu vehículo.`,
    '',
    titulo,
    ...(descuento > 0 ? [`${descuento}% de descuento`] : []),
    ...(descripcion ? ['', descripcion] : []),
    ...(servicios.length ? ['', 'Aplica en:', ...servicios.map((s) => `- ${s}`)] : []),
    ...(condiciones ? ['', `Condiciones: ${condiciones}`] : []),
    ...(vigencia ? ['', vigencia] : []),
    '',
    ...pieTexto(enlaceBaja),
  ];

  return {
    asunto: `${titulo} · ${sede}`.replace(/\s+/g, ' ').trim(),
    html: marco({
      establecimiento,
      titulo,
      cuerpoHtml,
      enlaceBaja,
      textoBaja: 'Dejar de recibir promociones',
      motivo: `autorizaste recibir promociones y ofertas de ${escaparHtml(sede)}`,
    }),
    texto: lineas.join('\n'),
  };
}

export const PLANTILLAS = {
  'orden.recibida': plantillaIngreso,
  'orden.en_lavado': plantillaEnLavado,
  'orden.secado': plantillaSecado,
  'orden.lista': plantillaListo,
  'orden.entregada': plantillaEntregada,
};
