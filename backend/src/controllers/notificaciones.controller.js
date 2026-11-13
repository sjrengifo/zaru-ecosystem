// HU-34 (RF-F6-20, RF-F6-21) — Bitácora de notificaciones del establecimiento.
//
// Solo el administrador de la sede consulta esta bitácora. Todo se lee con req.tenant (HU-41), así
// que nunca aparecen notificaciones de otra sede. Los destinos (correo/celular) están cifrados en la
// base y se enmascaran aquí: el panel recibe `yel****@gmail.com` o `300****567`, nunca el dato real.
//
// La respuesta distingue:
//   - "aceptada": el proveedor recibió el mensaje (estado enviada).
//   - "entregada": el proveedor confirmó la entrega (estado entregada o contenido.entregaConfirmada).
import { enmascararDestino } from '../shared/mascaras.js';
import { AppError } from '../shared/errores.js';
import { finDiaBogotaExclusivo, inicioDiaBogota } from '../shared/reportes.js';

const COLUMNAS = [
  'id, created_at, tipo, evento, canal, estado, intentos, error, destino, contenido,',
  'programada_para, proximo_intento_at,',
  'cliente:clientes(nombre),',
  'orden:ordenes(id, codigo_seguimiento, vehiculo:vehiculos(placa))',
].join(' ');

const COLUMNAS_INTENTOS =
  'intento, canal, resultado, proveedor, id_proveedor, entregado, recuperable, error, created_at';

const numero = (valor) => Number(valor ?? 0);
const bool = (valor) => valor === true;

/** Ordena ids de órdenes de las placas que coinciden (búsqueda parcial, como en vehículos). */
async function ordenesDePlaca(tenant, placa) {
  const { data: vehiculos, error } = await tenant.listar('vehiculos', 'id').ilike('placa', `%${placa}%`);
  if (error) throw error;
  if (!vehiculos?.length) return [];
  const { data: ordenes, error: errorOrdenes } = await tenant
    .listar('ordenes', 'id')
    .in('vehiculo_id', vehiculos.map((v) => v.id));
  if (errorOrdenes) throw errorOrdenes;
  return (ordenes ?? []).map((o) => o.id);
}

/** Convierte una fila de la base en lo que ve el administrador, sin datos personales completos. */
function filaPublica(fila) {
  const contenido = fila.contenido ?? {};
  const aceptada = ['enviada', 'entregada'].includes(fila.estado);
  const entregada = fila.estado === 'entregada' || bool(contenido.entregaConfirmada);
  return {
    id: fila.id,
    fecha: fila.created_at,
    tipo: fila.tipo,
    evento: fila.evento,
    canal: fila.canal,
    estado: fila.estado,
    cliente: fila.cliente?.nombre ?? null,
    placa: fila.orden?.vehiculo?.placa ?? null,
    codigoSeguimiento: fila.orden?.codigo_seguimiento ?? null,
    destino: enmascararDestino(fila.canal, fila.destino),
    asunto: contenido.asunto ?? null,
    proveedor: contenido.proveedor ?? null,
    aceptadaPorProveedor: aceptada,
    entregada,
    entregadaAt: contenido.entregadaAt ?? null,
    totalIntentos: numero(fila.intentos),
    error: fila.error ?? null,
    programadaPara: fila.programada_para ?? null,
    proximoIntentoAt: fila.proximo_intento_at ?? null,
  };
}

/** GET /notificaciones — listado con filtros combinables y paginación. */
export async function listar(req, res, next) {
  try {
    const { placa, desde, hasta, canal, estado, tipo, pagina, porPagina } = req.query;

    // Filtro por placa: se resuelven primero las órdenes del vehículo dentro de la sede.
    // Si la placa no tiene órdenes, la respuesta es vacía (no se consulta la bitácora completa).
    let ordenIds = null;
    if (placa) {
      ordenIds = await ordenesDePlaca(req.tenant, placa);
      if (!ordenIds.length) {
        return res.json({
          notificaciones: [],
          paginacion: { pagina, porPagina, total: 0, totalPaginas: 0 },
        });
      }
    }

    let consulta = req.tenant
      .listar('notificaciones', COLUMNAS, { count: 'exact' })
      .order('created_at', { ascending: false });

    if (ordenIds) consulta = consulta.in('orden_id', ordenIds);
    if (canal) consulta = consulta.eq('canal', canal);
    if (estado) consulta = consulta.eq('estado', estado);
    if (tipo) consulta = consulta.eq('tipo', tipo);
    if (desde) consulta = consulta.gte('created_at', inicioDiaBogota(desde));
    if (hasta) consulta = consulta.lt('created_at', finDiaBogotaExclusivo(hasta));

    const inicio = (pagina - 1) * porPagina;
    const { data, error, count } = await consulta.range(inicio, inicio + porPagina - 1);
    if (error) throw error;

    const total = numero(count);
    res.json({
      notificaciones: (data ?? []).map(filaPublica),
      paginacion: { pagina, porPagina, total, totalPaginas: Math.ceil(total / porPagina) },
    });
  } catch (err) {
    next(err);
  }
}

/** GET /notificaciones/:id — detalle con cada intento y el motivo real del proveedor. */
export async function obtener(req, res, next) {
  try {
    const fila = await req.tenant.obtener('notificaciones', req.params.id, COLUMNAS, 'Notificación');

    // La tabla de intentos puede no existir todavía si la migración no se aplicó: la bitácora
    // sigue mostrando la notificación y marca el detalle como no disponible.
    let intentos = [];
    let detalleIntentos = true;
    try {
      const { data, error } = await req.tenant
        .listar('notificacion_intentos', COLUMNAS_INTENTOS)
        .eq('notificacion_id', fila.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      intentos = (data ?? []).map((i) => ({
        intento: numero(i.intento),
        canal: i.canal,
        resultado: i.resultado,
        proveedor: i.proveedor,
        idProveedor: i.id_proveedor,
        entregado: bool(i.entregado),
        recuperable: i.recuperable,
        error: i.error,
        fecha: i.created_at,
      }));
    } catch (err) {
      detalleIntentos = false;
      console.warn('[HU-34] Detalle de intentos no disponible:', err?.message ?? err);
    }

    res.json({ ...filaPublica(fila), intentos, detalleIntentos });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// HU-33 CA3 — Alertas de avisos que fallaron en todos los canales
// ---------------------------------------------------------------------------
// Aquí el celular se muestra completo a propósito: el administrador necesita llamar al cliente
// para avisarle que su vehículo está listo. Solo lo ve el administrador de la misma sede (HU-41).

const COLUMNAS_FALLIDA = [
  'id, orden_id, canal, error, fallo_definitivo_at,',
  'cliente:clientes(nombre, telefono),',
  'orden:ordenes(id, codigo_seguimiento, total, vehiculo:vehiculos(placa))',
].join(' ');

const MAX_ALERTAS = 50;

/** GET /notificaciones/fallidas — alertas abiertas, de la más reciente a la más antigua. */
export async function fallidas(req, res, next) {
  try {
    const { data, error } = await req.tenant
      .listar('notificaciones', COLUMNAS_FALLIDA)
      .not('fallo_definitivo_at', 'is', null)
      .is('alerta_atendida_at', null)
      .order('fallo_definitivo_at', { ascending: false })
      .limit(MAX_ALERTAS);
    if (error) throw error;
    const filas = data ?? [];

    // Canales que se intentaron para cada orden (el original y sus alternos).
    const canalesPorOrden = new Map();
    const ordenIds = [...new Set(filas.map((f) => f.orden_id).filter(Boolean))];
    if (ordenIds.length) {
      const { data: intentadas, error: errorCanales } = await req.tenant
        .listar('notificaciones', 'orden_id, canal, created_at')
        .in('orden_id', ordenIds)
        .eq('evento', 'orden.lista')
        .order('created_at', { ascending: true });
      if (errorCanales) throw errorCanales;
      for (const f of intentadas ?? []) {
        const lista = canalesPorOrden.get(f.orden_id) ?? [];
        if (!lista.includes(f.canal)) lista.push(f.canal);
        canalesPorOrden.set(f.orden_id, lista);
      }
    }

    res.set('Cache-Control', 'no-store');
    res.json({
      alertas: filas.map((f) => ({
        id: f.id,
        ordenId: f.orden_id,
        codigoSeguimiento: f.orden?.codigo_seguimiento ?? null,
        placa: f.orden?.vehiculo?.placa ?? null,
        cliente: f.cliente?.nombre ?? null,
        celular: f.cliente?.telefono ?? null,
        total: f.orden?.total ?? null,
        canales: canalesPorOrden.get(f.orden_id) ?? [f.canal],
        motivo: f.error ?? null,
        falloAt: f.fallo_definitivo_at,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/** PATCH /notificaciones/fallidas/:id/atendida — el administrador ya contactó al cliente. */
export async function atenderFallida(req, res, next) {
  try {
    const fila = await req.tenant.obtener('notificaciones', req.params.id, 'id, fallo_definitivo_at, alerta_atendida_at', 'Alerta');
    if (!fila.fallo_definitivo_at) throw new AppError('NO_ENCONTRADO', 'Alerta no encontrada');
    if (fila.alerta_atendida_at) return res.json({ id: fila.id, atendidaAt: fila.alerta_atendida_at });

    const atendidaAt = new Date().toISOString();
    await req.tenant.actualizar(
      'notificaciones',
      fila.id,
      { alerta_atendida_at: atendidaAt, alerta_atendida_por: req.ctx?.usuarioId ?? null },
      'id',
      'Alerta',
    );
    res.json({ id: fila.id, atendidaAt });
  } catch (err) {
    next(err);
  }
}
