// HU-18 — Vista pública del seguimiento de una orden, sin acceso a datos.
//
// Convierte la orden (con su historial, servicios y la sede) en lo que ve el cliente final:
// la etapa actual con un texto claro (CA1) y el recorrido completo del lavado.
// Solo expone datos operativos: nunca nombre, teléfono ni correo del cliente (RNF-F5-04).

/** Formato del código de seguimiento: 10 caracteres de un alfabeto sin ambigüedades (HU-08). */
const FORMATO_CODIGO = /^[0-9A-Z]{6,16}$/;

/** El código deja de dar acceso 24 horas después de la entrega (RF-F5-08). */
export const VIGENCIA_TRAS_ENTREGA_MS = 24 * 60 * 60 * 1000;

export const NOTA_PAGO = 'El pago se realiza en el establecimiento';

/** Etapas del lavado en el orden en que las vive el cliente (enum public.estado_orden). */
export const ETAPAS = [
  { estado: 'recibido', titulo: 'En cola', descripcion: 'Recibimos tu vehículo y está en la fila para entrar a lavado.' },
  { estado: 'en_lavado', titulo: 'Lavado iniciado', descripcion: 'Tu vehículo se está lavando en este momento.' },
  { estado: 'secado', titulo: 'Secado', descripcion: 'Estamos secando y dando los últimos detalles.' },
  { estado: 'listo', titulo: 'Listo para recoger', descripcion: 'Tu vehículo está listo. Puedes pasar a recogerlo.' },
  { estado: 'entregado', titulo: 'Entregado', descripcion: 'Entregamos tu vehículo. ¡Gracias por tu visita!' },
];

const POSICION = new Map(ETAPAS.map((etapa, i) => [etapa.estado, i]));

/** Normaliza el código que llega en la URL: sin espacios ni guiones y en mayúsculas. Null si no es válido. */
export function normalizarCodigo(valor) {
  const codigo = String(valor ?? '').replace(/[\s-]/g, '').toUpperCase();
  return FORMATO_CODIGO.test(codigo) ? codigo : null;
}

/** ¿El código sigue dando acceso? Una orden entregada hace más de 24 h ya no se consulta. */
export function codigoVigente(orden, ahora = new Date()) {
  if (orden?.estado !== 'entregado') return true;
  const entregada = new Date(orden.entregada_at ?? orden.estado_desde ?? NaN).getTime();
  if (Number.isNaN(entregada)) return true;
  return new Date(ahora).getTime() - entregada <= VIGENCIA_TRAS_ENTREGA_MS;
}

/** Hora en que la orden llegó a cada estado, según el historial vigente (sin los cambios revertidos). */
function horasPorEstado(orden) {
  const horas = new Map([['recibido', orden.created_at ?? null]]);
  const historial = [...(orden.historial ?? [])]
    .filter((h) => !h.revertido)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  for (const h of historial) horas.set(h.estado, h.created_at);
  return horas;
}

/**
 * Línea de tiempo del lavado (HU-18 CA1, HU-19).
 * - `completada`, `actual` y pendiente (ninguna de las dos) para pintar cada etapa (HU-19 CA1).
 * - `at`: hora en que la orden llegó a la etapa; `terminadaAt`: hora en que terminó (HU-19 CA2).
 *   Una etapa termina cuando la orden llega a la siguiente que sí vivió; "Entregado" termina al entregar.
 * - `secado` es opcional: si la orden pasó de lavado a listo sin secado, ese paso queda `omitida`.
 * - Al llegar a "Entregado" todas las etapas quedan completadas, también un secado omitido (HU-19 CA3).
 */
export function construirEtapas(orden) {
  const actual = POSICION.get(orden.estado) ?? 0;
  const terminado = orden.estado === 'entregado';
  const horas = horasPorEstado(orden);
  // Si el historial no trae la entrega, se usa la hora registrada en la orden.
  if (terminado && !horas.has('entregado') && orden.entregada_at) horas.set('entregado', orden.entregada_at);

  const etapas = ETAPAS.map((etapa, i) => {
    const omitida = i < actual && etapa.estado === 'secado' && !horas.has('secado');
    return {
      estado: etapa.estado,
      titulo: etapa.titulo,
      completada: terminado || (i < actual && !omitida),
      actual: i === actual,
      omitida,
      at: i <= actual && !omitida ? horas.get(etapa.estado) ?? null : null,
      terminadaAt: null,
    };
  });

  // Cada etapa vivida termina cuando empieza la siguiente que también se vivió.
  let fin = terminado ? etapas[actual].at : null;
  for (let i = actual; i >= 0; i -= 1) {
    const etapa = etapas[i];
    if (etapa.omitida) continue;
    if (etapa.completada) etapa.terminadaAt = fin;
    fin = etapa.at ?? fin;
  }
  return etapas;
}

const COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;
const color = (valor, porDefecto) => (COLOR_HEX.test(valor ?? '') ? valor : porDefecto);

/** Respuesta pública del seguimiento (CA1). */
export function armarSeguimiento(orden, establecimiento = {}) {
  const posicion = POSICION.get(orden.estado) ?? 0;
  const etapa = ETAPAS[posicion];
  const vehiculo = orden.vehiculo ?? {};
  return {
    codigo: orden.codigo_seguimiento,
    estado: orden.estado,
    etapa: {
      estado: etapa.estado,
      titulo: etapa.titulo,
      descripcion: etapa.descripcion,
      paso: posicion + 1,
      totalPasos: ETAPAS.length,
    },
    etapas: construirEtapas(orden),
    estadoDesde: orden.estado_desde ?? null,
    ingresoAt: orden.created_at ?? null,
    entregaEstimadaAt: orden.entrega_estimada_at ?? null,
    entregadaAt: orden.entregada_at ?? null,
    vehiculo: {
      placa: vehiculo.placa ?? null,
      tipo: vehiculo.tipo ?? null,
      marca: vehiculo.marca ?? null,
      color: vehiculo.color ?? null,
    },
    servicios: (orden.servicios ?? []).map((s) => ({
      nombre: s.servicio?.nombre ?? 'Servicio',
      precio: Number(s.precio ?? 0),
    })),
    subtotal: Number(orden.subtotal ?? 0),
    descuento: Number(orden.descuento ?? 0),
    total: Number(orden.total ?? 0),
    notaPago: NOTA_PAGO,
    establecimiento: {
      nombre: establecimiento.nombre ?? 'Zaru',
      logoUrl: establecimiento.logo_url ?? null,
      colorPrimario: color(establecimiento.color_primario, '#2563EB'),
      colorSecundario: color(establecimiento.color_secundario, '#0EA5E9'),
    },
    version: Number(orden.version ?? 1),
  };
}
