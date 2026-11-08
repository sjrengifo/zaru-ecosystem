// HU-18 — Seguimiento en tiempo real del estado del lavado (cliente final, sin sesión).
//
// CA1: GET /publico/seguimiento/{codigo} devuelve la etapa actual con un texto claro
//      (en cola, lavado iniciado, secado, listo…) y el recorrido completo.
// CA2: GET /publico/seguimiento/{codigo}/eventos abre un flujo Server-Sent Events. Cada vez que el
//      operario cambia el estado en el panel, la conexión recibe `event: estado` con el seguimiento
//      completo, sin que el cliente recargue la página (ADR-04).
import { bus, cargarSeguimiento, escucharCambiosDeOrdenes } from '../shared/seguimiento.js';
import { crearLimiteIntentos } from '../shared/limiteIntentos.js';
import { AppError } from '../shared/errores.js';

/** Tiempos del flujo SSE. Se exportan para que las pruebas puedan acortarlos. */
export const CONFIG_SSE = {
  reintentoMs: 5_000, // el navegador reconecta solo tras este tiempo (RF-F5-06)
  pingMs: 25_000, // comentario de mantenimiento para que los proxies no corten la conexión (RNF-F5-05)
  revisionMs: 15_000, // revisión de respaldo por si el canal de Realtime se cayó
};

/** Conexiones abiertas a la vez desde un mismo origen. */
export const MAX_CONEXIONES_POR_ORIGEN = 10;

export const limiteCodigos = crearLimiteIntentos();
const abiertasPorOrigen = new Map();
const origenDe = (req) => req.ip ?? 'desconocido';

/** Busca el seguimiento contando los códigos no válidos del origen (RNF-F5-01). */
async function seguimientoDe(req) {
  const origen = origenDe(req);
  limiteCodigos.verificar(origen);
  try {
    return await cargarSeguimiento(req.params.codigo);
  } catch (err) {
    if (err?.codigo === 'NO_ENCONTRADO') limiteCodigos.registrarFallo(origen);
    throw err;
  }
}

/** CA1: estado actual del lavado. */
export async function obtener(req, res, next) {
  try {
    const { seguimiento } = await seguimientoDe(req);
    res.set('Cache-Control', 'no-store');
    res.json(seguimiento);
  } catch (err) {
    next(err);
  }
}

/** CA2: flujo de cambios de estado de una sola orden. */
export async function eventos(req, res, next) {
  const origen = origenDe(req);
  let inicial;
  try {
    if ((abiertasPorOrigen.get(origen) ?? 0) >= MAX_CONEXIONES_POR_ORIGEN) {
      throw new AppError('LIMITE_EXCEDIDO', 'Hay demasiados seguimientos abiertos desde esta conexión');
    }
    inicial = await seguimientoDe(req);
  } catch (err) {
    return next(err);
  }

  const { ordenId } = inicial;
  const codigo = inicial.seguimiento.codigo;
  abiertasPorOrigen.set(origen, (abiertasPorOrigen.get(origen) ?? 0) + 1);

  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // evita que un proxy acumule los eventos
  });
  res.flushHeaders?.();
  res.write(`retry: ${CONFIG_SSE.reintentoMs}\n\n`);

  let ultimaVersion = null;
  let cerrado = false;
  let consultando = false;
  let repetir = false;

  /** Envía el seguimiento solo si cambió. `id` es la versión de la orden (Last-Event-ID al reconectar). */
  const enviar = (seguimiento) => {
    if (cerrado || seguimiento.version === ultimaVersion) return;
    ultimaVersion = seguimiento.version;
    res.write(`id: ${seguimiento.version}\nevent: estado\ndata: ${JSON.stringify(seguimiento)}\n\n`);
  };

  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;
    clearInterval(ping);
    clearInterval(revision);
    dejarDeEscuchar();
    const abiertas = (abiertasPorOrigen.get(origen) ?? 1) - 1;
    if (abiertas > 0) abiertasPorOrigen.set(origen, abiertas);
    else abiertasPorOrigen.delete(origen);
    res.end();
  };

  /** Vuelve a leer la orden. Si llegan varios avisos seguidos, se hace una sola lectura extra. */
  const refrescar = async () => {
    if (cerrado) return;
    if (consultando) {
      repetir = true;
      return;
    }
    consultando = true;
    try {
      enviar((await cargarSeguimiento(codigo)).seguimiento);
    } catch (err) {
      if (err?.codigo === 'NO_ENCONTRADO') {
        // El código venció (24 h después de la entrega) o la sede fue suspendida.
        res.write('event: fin\ndata: {}\n\n');
        cerrar();
      } else {
        console.error('[HU-18] No se pudo actualizar el seguimiento:', err?.message ?? err);
      }
    } finally {
      consultando = false;
      if (repetir && !cerrado) {
        repetir = false;
        refrescar();
      }
    }
  };

  const dejarDeEscuchar = bus.suscribir(ordenId, refrescar);
  try {
    escucharCambiosDeOrdenes();
  } catch (err) {
    console.error('[HU-18] No se pudo abrir el canal de Realtime:', err?.message ?? err);
  }
  const ping = setInterval(() => !cerrado && res.write(': ping\n\n'), CONFIG_SSE.pingMs);
  const revision = setInterval(refrescar, CONFIG_SSE.revisionMs);
  req.on('close', cerrar);

  // Al conectar (o reconectar con Last-Event-ID) siempre se envía el estado actual (RF-F5-06).
  enviar(inicial.seguimiento);
}
