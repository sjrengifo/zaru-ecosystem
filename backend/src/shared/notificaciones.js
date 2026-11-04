// HU-46 — Notificaciones por correo al cliente.
//
// CA1: correo cuando se registra el ingreso del vehículo (HU-08).
// CA2: correo cuando el vehículo pasa a "Listo" (HU-10).
// CA3: si el cliente no tiene correo o el envío falla, la operación del establecimiento sigue igual:
//      el controlador ya respondió y aquí ningún error se propaga.
//
// Cada intento queda en la tabla `notificaciones` (HU-42) con su resultado. El destino se guarda
// cifrado, igual que el correo del cliente (HU-50). La clave de deduplicación evita enviar dos
// veces el mismo aviso de una orden (por ejemplo, si se revierte "Listo" y se vuelve a marcar).
import { enviarCorreo as enviarPorSmtp } from './correo.js';
import { cifrar, descifrar } from './cifrado.js';

const COLUMNAS_ORDEN = [
  'id, codigo_seguimiento, total, entrega_estimada_at,',
  'vehiculo:vehiculos(placa, cliente:clientes(id, nombre, correo)),',
  'servicios:orden_servicios(servicio:servicios(nombre))',
].join(' ');

export const EVENTOS = {
  ingreso: { evento: 'orden.ingreso', titulo: 'Recibimos tu vehículo' },
  listo: { evento: 'orden.listo', titulo: 'Tu vehículo está listo' },
};

const moneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const hora = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit' });

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Asunto, texto plano y HTML del correo. Se exporta para probarlo sin enviar nada. */
export function redactarCorreo(tipo, { establecimiento, cliente, placa, servicios, total, codigo, entregaEstimada }) {
  const primerNombre = String(cliente ?? '').trim().split(/\s+/)[0] || 'Hola';
  const lista = servicios.length ? servicios.join(', ') : 'Servicio';

  const lineas = tipo === 'ingreso'
    ? [
      `${primerNombre}, recibimos tu vehículo ${placa} en ${establecimiento}.`,
      `Servicios: ${lista}.`,
      `Total: ${moneda.format(Number(total ?? 0))}.`,
      ...(entregaEstimada ? [`Hora estimada de entrega: ${hora.format(new Date(entregaEstimada))}.`] : []),
      `Código de seguimiento: ${codigo}.`,
      'Te avisaremos por este medio cuando esté listo.',
    ]
    : [
      `${primerNombre}, tu vehículo ${placa} ya está listo en ${establecimiento}.`,
      'Puedes pasar a recogerlo cuando quieras.',
      `Código de seguimiento: ${codigo}.`,
    ];

  return {
    asunto: `${EVENTOS[tipo].titulo} · ${establecimiento}`,
    texto: lineas.join('\n'),
    html: [
      '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f2937">',
      `<h2 style="margin:0 0 12px">${escapar(EVENTOS[tipo].titulo)}</h2>`,
      ...lineas.map((linea) => `<p style="margin:0 0 8px">${escapar(linea)}</p>`),
      `<p style="margin:16px 0 0;color:#6b7280;font-size:13px">${escapar(establecimiento)} · Zaru</p>`,
      '</div>',
    ].join(''),
  };
}

/**
 * Envía el aviso de una orden y registra el resultado. Nunca lanza.
 * @param {object} tenant  req.tenant de la petición que originó el aviso
 * @param {string} ordenId
 * @param {'ingreso'|'listo'} tipo
 * @param {{ enviar?: Function }} [dependencias]  para las pruebas
 * @returns {Promise<{ estado: string, motivo?: string }>}
 */
export async function notificarOrden(tenant, ordenId, tipo, { enviar = enviarPorSmtp } = {}) {
  let registroId = null;
  try {
    if (!EVENTOS[tipo]) return { estado: 'omitida', motivo: `Tipo de aviso desconocido: ${tipo}` };

    const orden = await tenant.obtener('ordenes', ordenId, COLUMNAS_ORDEN, 'Orden');
    const cliente = orden.vehiculo?.cliente;
    if (!cliente?.id) return { estado: 'omitida', motivo: 'La orden no tiene cliente' };

    const { data: sede } = await tenant.listar('establecimientos', 'nombre').maybeSingle();
    const correo = cliente.correo ? descifrar(cliente.correo) : null;
    const contenido = redactarCorreo(tipo, {
      establecimiento: sede?.nombre ?? 'tu car wash',
      cliente: cliente.nombre,
      placa: orden.vehiculo?.placa,
      servicios: (orden.servicios ?? []).map((s) => s.servicio?.nombre).filter(Boolean),
      total: orden.total,
      codigo: orden.codigo_seguimiento,
      entregaEstimada: orden.entrega_estimada_at,
    });

    // CA3: sin correo no se intenta el envío, pero queda constancia.
    if (!correo) {
      await registrar(tenant, { orden, cliente, tipo, destino: null, contenido, estado: 'cancelada', error: 'El cliente no tiene correo registrado' });
      return { estado: 'cancelada', motivo: 'El cliente no tiene correo registrado' };
    }

    const registro = await registrar(tenant, { orden, cliente, tipo, destino: correo, contenido, estado: 'enviando' });
    if (!registro) return { estado: 'omitida', motivo: 'El aviso ya se había enviado' };
    registroId = registro.id;

    const resultado = await enviar({ para: correo, ...contenido });
    const estado = resultado.enviado ? 'enviada' : 'fallida';
    await tenant.actualizar('notificaciones', registroId, {
      estado,
      intentos: 1,
      error: resultado.enviado ? null : resultado.motivo,
    }, 'id', 'Notificación');
    if (!resultado.enviado) console.warn(`[HU-46] No se envió el aviso "${tipo}" de la orden ${ordenId}: ${resultado.motivo}`);
    return { estado, ...(resultado.motivo ? { motivo: resultado.motivo } : {}) };
  } catch (err) {
    console.error(`[HU-46] Error al notificar la orden ${ordenId}:`, err?.message ?? err);
    if (registroId) {
      await tenant.actualizar('notificaciones', registroId, { estado: 'fallida', error: String(err?.message ?? err) }, 'id', 'Notificación')
        .catch(() => {});
    }
    return { estado: 'fallida', motivo: err?.message ?? 'Error desconocido' };
  }
}

/** Inserta el registro del aviso. Devuelve null si ese aviso ya existía (clave de deduplicación). */
async function registrar(tenant, { orden, cliente, tipo, destino, contenido, estado, error = null }) {
  try {
    return await tenant.crear('notificaciones', {
      cliente_id: cliente.id,
      orden_id: orden.id,
      tipo: 'operativa',
      evento: EVENTOS[tipo].evento,
      canal: 'correo',
      destino: destino ? cifrar(destino) : 'sin-correo',
      contenido: { asunto: contenido.asunto, texto: contenido.texto },
      estado,
      error,
      clave_dedupe: `${orden.id}:${tipo}`,
    }, 'id');
  } catch (err) {
    // Solo la llave única (23505) significa "ya enviado"; otros conflictos sí son errores.
    if (err?.code === '23505' || (err?.codigo === 'CONFLICTO' && err?.message === 'El registro ya existe')) return null;
    throw err;
  }
}

/**
 * Lanza el aviso sin bloquear la respuesta HTTP (CA3). Se usa después de responder.
 * Devuelve la promesa para que las pruebas puedan esperarla.
 */
export function programarNotificacion(tenant, ordenId, tipo) {
  return notificarOrden(tenant, ordenId, tipo);
}
