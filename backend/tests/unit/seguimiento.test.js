// HU-18 — Seguimiento en tiempo real del estado del lavado.
// Reglas de la vista pública (CA1), reparto de cambios por orden y flujo SSE (CA2), sin Supabase.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  armarSeguimiento,
  codigoVigente,
  construirEtapas,
  normalizarCodigo,
  NOTA_PAGO,
} from '../../src/shared/etapasSeguimiento.js';
import { crearLimiteIntentos } from '../../src/shared/limiteIntentos.js';
import { enlaceSeguimiento, plantillaIngreso } from '../../src/shared/plantillasCorreo.js';

const cargarSeguimiento = vi.fn();
const escucharCambiosDeOrdenes = vi.fn();
const { crearBus } = await vi.importActual('../../src/shared/seguimiento.js');
const bus = crearBus();
vi.mock('../../src/shared/seguimiento.js', () => ({
  cargarSeguimiento: (...a) => cargarSeguimiento(...a),
  escucharCambiosDeOrdenes: (...a) => escucharCambiosDeOrdenes(...a),
  get bus() {
    return bus;
  },
}));

const { obtener, eventos, CONFIG_SSE, limiteCodigos } = await import('../../src/controllers/seguimiento.controller.js');

const ORDEN_ID = '55555555-5555-4555-8555-555555555555';

const ordenBase = (cambios = {}) => ({
  id: ORDEN_ID,
  codigo_seguimiento: '7KQ2M9XH4P',
  estado: 'recibido',
  estado_desde: '2026-11-08T14:00:00Z',
  created_at: '2026-11-08T14:00:00Z',
  entrega_estimada_at: '2026-11-08T14:40:00Z',
  entregada_at: null,
  subtotal: '30000.00',
  descuento: '5000.00',
  total: '25000.00',
  version: 1,
  vehiculo: { placa: 'ABC123', tipo: 'carro', marca: 'Mazda', color: 'Rojo' },
  servicios: [{ precio: '30000.00', servicio: { nombre: 'Lavado general' } }],
  historial: [],
  ...cambios,
});

const sede = { nombre: 'Lavadero Norte', logo_url: 'https://x/logo.png', color_primario: '#0F766E', color_secundario: 'rojo' };

describe('HU-18 · código de seguimiento', () => {
  it('acepta el código sin importar mayúsculas, espacios o guiones', () => {
    expect(normalizarCodigo(' 7kq2-m9xh 4p ')).toBe('7KQ2M9XH4P');
  });

  it('rechaza valores que no pueden ser un código', () => {
    for (const valor of [undefined, '', 'abc', "7KQ2M9XH4P' or 1=1", '../../etc', 'Ñ'.repeat(10)]) {
      expect(normalizarCodigo(valor)).toBeNull();
    }
  });

  it('deja de dar acceso 24 horas después de la entrega (RF-F5-08)', () => {
    const entregada = { estado: 'entregado', entregada_at: '2026-11-08T10:00:00Z' };
    expect(codigoVigente(entregada, new Date('2026-11-09T09:59:00Z'))).toBe(true);
    expect(codigoVigente(entregada, new Date('2026-11-09T10:01:00Z'))).toBe(false);
    expect(codigoVigente({ estado: 'en_lavado' }, new Date('2030-01-01'))).toBe(true);
  });
});

describe('HU-18 CA1 · indicador de la etapa actual', () => {
  it('en cola: la orden recibida muestra "En cola" como paso 1 de 5', () => {
    const s = armarSeguimiento(ordenBase(), sede);
    expect(s.etapa).toMatchObject({ estado: 'recibido', titulo: 'En cola', paso: 1, totalPasos: 5 });
    expect(s.etapas.map((e) => e.titulo)).toEqual(['En cola', 'Lavado iniciado', 'Secado', 'Listo para recoger', 'Entregado']);
  });

  it('lavado iniciado y secado se muestran con su hora real', () => {
    const orden = ordenBase({
      estado: 'secado',
      historial: [
        { estado: 'en_lavado', created_at: '2026-11-08T14:05:00Z', revertido: false },
        { estado: 'secado', created_at: '2026-11-08T14:20:00Z', revertido: false },
      ],
    });
    const s = armarSeguimiento(orden, sede);
    expect(s.etapa).toMatchObject({ titulo: 'Secado', paso: 3 });
    expect(s.etapas[0]).toMatchObject({ completada: true, at: '2026-11-08T14:00:00Z' });
    expect(s.etapas[1]).toMatchObject({ completada: true, at: '2026-11-08T14:05:00Z' });
    expect(s.etapas[2]).toMatchObject({ actual: true, completada: false, at: '2026-11-08T14:20:00Z' });
    expect(s.etapas[3]).toMatchObject({ actual: false, completada: false, at: null });
  });

  it('el secado se marca como omitido si la orden pasó de lavado a listo', () => {
    const etapas = construirEtapas(ordenBase({
      estado: 'listo',
      historial: [
        { estado: 'en_lavado', created_at: '2026-11-08T14:05:00Z' },
        { estado: 'listo', created_at: '2026-11-08T14:25:00Z' },
      ],
    }));
    expect(etapas[2]).toMatchObject({ estado: 'secado', omitida: true, completada: false, at: null });
    expect(etapas[3]).toMatchObject({ actual: true, at: '2026-11-08T14:25:00Z' });
  });

  it('al entregar el vehículo, todas las etapas quedan completadas, incluida "Entregado"', () => {
    const etapas = construirEtapas(ordenBase({
      estado: 'entregado',
      historial: [
        { estado: 'en_lavado', created_at: '2026-11-08T14:05:00Z' },
        { estado: 'secado', created_at: '2026-11-08T14:20:00Z' },
        { estado: 'listo', created_at: '2026-11-08T14:30:00Z' },
        { estado: 'entregado', created_at: '2026-11-08T14:45:00Z' },
      ],
    }));
    expect(etapas.every((e) => e.completada)).toBe(true);
    expect(etapas[4]).toMatchObject({ actual: true, completada: true, at: '2026-11-08T14:45:00Z' });
  });

  it('un cambio revertido por el operario no aparece en el recorrido', () => {
    const etapas = construirEtapas(ordenBase({
      estado: 'recibido',
      historial: [{ estado: 'en_lavado', created_at: '2026-11-08T14:05:00Z', revertido: true }],
    }));
    expect(etapas[0].actual).toBe(true);
    expect(etapas[1]).toMatchObject({ completada: false, at: null });
  });

  it('incluye servicios, total, nota de pago y marca de la sede, con colores seguros', () => {
    const s = armarSeguimiento(ordenBase(), sede);
    expect(s.servicios).toEqual([{ nombre: 'Lavado general', precio: 30000 }]);
    expect(s).toMatchObject({ subtotal: 30000, descuento: 5000, total: 25000, notaPago: NOTA_PAGO });
    expect(s.establecimiento).toEqual({
      nombre: 'Lavadero Norte',
      logoUrl: 'https://x/logo.png',
      colorPrimario: '#0F766E',
      colorSecundario: '#0EA5E9',
    });
  });

  it('no expone datos personales del cliente ni identificadores internos (RNF-F5-04)', () => {
    const orden = ordenBase({
      vehiculo: { placa: 'ABC123', cliente: { nombre: 'Ana Pérez', telefono: '3001234567', correo: 'ana@correo.com' } },
      establecimiento_id: '00000000-0000-0000-0000-00000000a058',
    });
    const json = JSON.stringify(armarSeguimiento(orden, sede));
    for (const dato of ['Ana', '3001234567', 'ana@correo.com', ORDEN_ID, '00000000-0000-0000-0000-00000000a058']) {
      expect(json).not.toContain(dato);
    }
  });
});

describe('HU-18 · límite de códigos no válidos', () => {
  it('bloquea el origen tras los fallos permitidos y lo libera al pasar la ventana', () => {
    let reloj = 0;
    const limite = crearLimiteIntentos({ maximo: 2, ventanaMs: 1000, ahora: () => reloj });
    limite.registrarFallo('1.1.1.1');
    limite.registrarFallo('1.1.1.1');
    expect(() => limite.verificar('1.1.1.1')).toThrow(expect.objectContaining({ codigo: 'LIMITE_EXCEDIDO', status: 429 }));
    expect(() => limite.verificar('2.2.2.2')).not.toThrow();
    reloj = 1500;
    expect(() => limite.verificar('1.1.1.1')).not.toThrow();
  });
});

describe('HU-18 · enlace en el correo de ingreso', () => {
  it('arma el enlace con la URL del panel', () => {
    expect(enlaceSeguimiento('7KQ2M9XH4P', 'https://zaru-panel.vercel.app/')).toBe('https://zaru-panel.vercel.app/seguimiento/7KQ2M9XH4P');
    expect(enlaceSeguimiento(null)).toBeNull();
  });

  it('el correo de ingreso invita a seguir el lavado en tiempo real', () => {
    const correo = plantillaIngreso({
      establecimiento: sede,
      cliente: { nombre: 'Ana' },
      orden: { created_at: '2026-11-08T14:00:00Z', total: 25000, codigo_seguimiento: '7KQ2M9XH4P' },
      vehiculo: { placa: 'ABC123' },
      servicios: [],
    });
    expect(correo.html).toContain('/seguimiento/7KQ2M9XH4P');
    expect(correo.texto).toContain('/seguimiento/7KQ2M9XH4P');
  });
});

describe('HU-18 · reparto de cambios por orden', () => {
  it('cada conexión solo recibe los avisos de su orden (RF-F5-07)', () => {
    const b = crearBus();
    const a = vi.fn();
    const otra = vi.fn();
    const quitar = b.suscribir('orden-a', a);
    b.suscribir('orden-b', otra);
    b.publicar('orden-a');
    expect(a).toHaveBeenCalledTimes(1);
    expect(otra).not.toHaveBeenCalled();
    quitar();
    b.publicar('orden-a');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b.conexiones('orden-a')).toBe(0);
  });
});

/** Respuesta falsa de Express que acumula lo escrito en el flujo. */
function respuestaSse() {
  const res = new EventEmitter();
  res.escrito = '';
  res.status = vi.fn(() => res);
  res.set = vi.fn(() => res);
  res.json = vi.fn();
  res.flushHeaders = vi.fn();
  res.write = vi.fn((texto) => {
    res.escrito += texto;
    return true;
  });
  res.end = vi.fn();
  return res;
}

const eventosEstado = (texto) =>
  texto
    .split('\n\n')
    .filter((bloque) => bloque.includes('event: estado'))
    .map((bloque) => JSON.parse(bloque.split('data: ')[1]));

/** Deja correr las promesas pendientes sin adelantar los intervalos del flujo. */
const esperar = () => vi.advanceTimersByTimeAsync(0);

describe('HU-18 CA1 · GET /publico/seguimiento/{codigo}', () => {
  beforeEach(() => {
    cargarSeguimiento.mockReset();
    limiteCodigos.reiniciar();
  });

  it('responde el seguimiento sin guardarlo en caché', async () => {
    cargarSeguimiento.mockResolvedValue({ ordenId: ORDEN_ID, seguimiento: armarSeguimiento(ordenBase(), sede) });
    const res = respuestaSse();
    const next = vi.fn();
    await obtener({ params: { codigo: '7KQ2M9XH4P' }, ip: '1.1.1.1' }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.json.mock.calls[0][0].etapa.titulo).toBe('En cola');
  });

  it('tras 10 códigos no válidos desde el mismo origen responde 429', async () => {
    const { noEncontrado } = await import('../../src/shared/errores.js');
    cargarSeguimiento.mockRejectedValue(noEncontrado('Seguimiento'));
    const next = vi.fn();
    for (let i = 0; i < 11; i += 1) await obtener({ params: { codigo: 'XXXXXXXXXX' }, ip: '9.9.9.9' }, respuestaSse(), next);
    expect(next.mock.calls.slice(0, 10).every(([e]) => e.codigo === 'NO_ENCONTRADO')).toBe(true);
    expect(next.mock.calls[10][0].codigo).toBe('LIMITE_EXCEDIDO');
  });
});

describe('HU-18 CA2 · flujo de eventos en tiempo real', () => {
  const original = { ...CONFIG_SSE };

  beforeEach(() => {
    cargarSeguimiento.mockReset();
    escucharCambiosDeOrdenes.mockReset();
    limiteCodigos.reiniciar();
    vi.useFakeTimers();
  });

  const abiertas = [];

  afterEach(() => {
    for (const req of abiertas.splice(0)) req.emit('close');
    vi.useRealTimers();
    Object.assign(CONFIG_SSE, original);
  });

  async function conectar(ip = '1.1.1.1') {
    const req = new EventEmitter();
    Object.assign(req, { params: { codigo: '7KQ2M9XH4P' }, ip });
    const res = respuestaSse();
    const next = vi.fn();
    await eventos(req, res, next);
    abiertas.push(req);
    return { req, res, next };
  }

  it('al conectar envía encabezados SSE, el reintento y el estado actual', async () => {
    cargarSeguimiento.mockResolvedValue({ ordenId: ORDEN_ID, seguimiento: armarSeguimiento(ordenBase(), sede) });
    const { req, res, next } = await conectar();
    expect(next).not.toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ 'Content-Type': 'text/event-stream; charset=utf-8' }));
    expect(res.escrito).toMatch(/^retry: 5000\n\n/);
    expect(res.escrito).toContain('id: 1\nevent: estado\n');
    expect(eventosEstado(res.escrito)[0].etapa.titulo).toBe('En cola');
    expect(escucharCambiosDeOrdenes).toHaveBeenCalled();
    req.emit('close');
  });

  it('cuando el operario cambia el estado, la pantalla recibe la nueva etapa sin recargar', async () => {
    cargarSeguimiento.mockResolvedValueOnce({ ordenId: ORDEN_ID, seguimiento: armarSeguimiento(ordenBase(), sede) });
    const { req, res } = await conectar();

    cargarSeguimiento.mockResolvedValueOnce({
      ordenId: ORDEN_ID,
      seguimiento: armarSeguimiento(ordenBase({ estado: 'en_lavado', version: 2 }), sede),
    });
    bus.publicar(ORDEN_ID); // aviso de Realtime: la orden cambió
    await esperar();
    expect(eventosEstado(res.escrito)).toHaveLength(2);

    const [, nuevo] = eventosEstado(res.escrito);
    expect(nuevo.etapa.titulo).toBe('Lavado iniciado');
    expect(res.escrito).toContain('id: 2\nevent: estado\n');
    req.emit('close');
  });

  it('un aviso de otra orden no genera eventos (RF-F5-07)', async () => {
    cargarSeguimiento.mockResolvedValue({ ordenId: ORDEN_ID, seguimiento: armarSeguimiento(ordenBase(), sede) });
    const { req, res } = await conectar();
    bus.publicar('otra-orden');
    await esperar();
    expect(cargarSeguimiento).toHaveBeenCalledTimes(1);
    expect(eventosEstado(res.escrito)).toHaveLength(1);
    req.emit('close');
  });

  it('si la versión no cambió, no repite el evento', async () => {
    cargarSeguimiento.mockResolvedValue({ ordenId: ORDEN_ID, seguimiento: armarSeguimiento(ordenBase(), sede) });
    const { req, res } = await conectar();
    bus.publicar(ORDEN_ID);
    await esperar();
    expect(cargarSeguimiento).toHaveBeenCalledTimes(2);
    expect(eventosEstado(res.escrito)).toHaveLength(1);
    req.emit('close');
  });

  it('la revisión periódica entrega el cambio aunque Realtime no avise', async () => {
    cargarSeguimiento.mockResolvedValueOnce({ ordenId: ORDEN_ID, seguimiento: armarSeguimiento(ordenBase(), sede) });
    const { req, res } = await conectar();
    cargarSeguimiento.mockResolvedValue({
      ordenId: ORDEN_ID,
      seguimiento: armarSeguimiento(ordenBase({ estado: 'listo', version: 4 }), sede),
    });
    await vi.advanceTimersByTimeAsync(CONFIG_SSE.revisionMs);
    expect(eventosEstado(res.escrito).at(-1).etapa.titulo).toBe('Listo para recoger');
    req.emit('close');
  });

  it('envía un comentario de mantenimiento cada 25 s (RNF-F5-05)', async () => {
    cargarSeguimiento.mockResolvedValue({ ordenId: ORDEN_ID, seguimiento: armarSeguimiento(ordenBase(), sede) });
    const { req, res } = await conectar();
    await vi.advanceTimersByTimeAsync(25_000);
    expect(res.escrito).toContain(': ping\n\n');
    req.emit('close');
  });

  it('al cerrar la pestaña deja de escuchar la orden', async () => {
    cargarSeguimiento.mockResolvedValue({ ordenId: ORDEN_ID, seguimiento: armarSeguimiento(ordenBase(), sede) });
    const { req, res } = await conectar();
    expect(bus.conexiones(ORDEN_ID)).toBe(1);
    req.emit('close');
    expect(bus.conexiones(ORDEN_ID)).toBe(0);
    expect(res.end).toHaveBeenCalled();
  });

  it('si el código vence mientras está abierto, avisa el fin y cierra', async () => {
    const { noEncontrado } = await import('../../src/shared/errores.js');
    cargarSeguimiento.mockResolvedValueOnce({ ordenId: ORDEN_ID, seguimiento: armarSeguimiento(ordenBase(), sede) });
    const { res } = await conectar();
    cargarSeguimiento.mockRejectedValueOnce(noEncontrado('Seguimiento'));
    bus.publicar(ORDEN_ID);
    await esperar();
    expect(res.end).toHaveBeenCalled();
    expect(res.escrito).toContain('event: fin');
  });

  it('un código inexistente responde 404 sin abrir el flujo', async () => {
    const { noEncontrado } = await import('../../src/shared/errores.js');
    cargarSeguimiento.mockRejectedValue(noEncontrado('Seguimiento'));
    const { res, next } = await conectar();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'NO_ENCONTRADO' }));
    expect(res.write).not.toHaveBeenCalled();
  });

  it('limita las conexiones abiertas a la vez desde un mismo origen', async () => {
    cargarSeguimiento.mockResolvedValue({ ordenId: ORDEN_ID, seguimiento: armarSeguimiento(ordenBase(), sede) });
    const mismas = [];
    for (let i = 0; i < 10; i += 1) mismas.push(await conectar('3.3.3.3'));
    const extra = await conectar('3.3.3.3');
    expect(extra.next).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'LIMITE_EXCEDIDO' }));
    for (const { req } of mismas) req.emit('close');
    const otraVez = await conectar('3.3.3.3');
    expect(otraVez.next).not.toHaveBeenCalled();
    otraVez.req.emit('close');
  });
});
