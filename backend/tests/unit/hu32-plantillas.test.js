// HU-32 — Plantillas de notificación con la marca de la sede (ZARU-21 · RF-F7-01 a 05), sin Supabase.
//   CA1: variables permitidas y guardado por estado y canal.
//   CA2 / ESC-F7-02: caracteres y partes del SMS (GSM-7 y UCS-2) y el aviso de mayor costo.
//   CA3 / ESC-F7-03: vista previa en push, SMS y correo con datos de ejemplo y la marca de la sede.
//   CA4 / ESC-F7-01: una variable inválida bloquea el guardado y el error dice cuál y dónde.
//   RF-F7-05: sin plantilla propia se usa la de la plataforma (armarMensaje).
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validarPlantilla,
  contarSms,
  renderizar,
  valoresDesde,
  DATOS_EJEMPLO,
  LIMITES,
  ESTADOS,
  CANALES,
  guardarPlantilla,
  restaurarPlantilla,
  vistaPrevia,
  listarPlantillas,
  armarMensaje,
} from '../../src/shared/plantillasNotificacion.js';

const SEDE = { nombre: 'Lavadero Norte', logo_url: 'https://cdn.zaru.test/norte.png', color_primario: '#B91C1C', color_secundario: '#F59E0B' };

const plataforma = (estado, canal, asunto, cuerpo) => ({
  estado, canal, asunto, cuerpo, personalizada: false, updated_at: '2026-11-17T00:00:00Z', asunto_plataforma: asunto, cuerpo_plataforma: cuerpo,
});
const FILAS = [
  plataforma('listo', 'push', '¡Tu vehículo está listo!', '{nombre_cliente}, tu vehículo {placa} está listo en {sede}.'),
  plataforma('listo', 'sms', null, '{sede}: tu carro {placa} ya puede ser recogido.'),
  plataforma('listo', 'correo', 'Tu vehículo {placa} está listo', 'Hola {nombre_cliente},\n\ntu vehículo {placa} está {estado} desde las {hora}.'),
];

/** Tenant falso con consultarFuncion (filtrable con .eq), rpc, listar y eliminar. */
function tenantFalso({ filas = FILAS, sede = SEDE, propia = null } = {}) {
  const llamadas = { rpc: [], funciones: [], eliminar: [] };
  const builder = (datos, registro) => {
    const filtros = [];
    const b = {
      eq(col, v) { filtros.push([col, v]); registro?.push([col, v]); return b; },
      maybeSingle: async () => ({ data: datos.filter((f) => filtros.every(([c, v]) => f[c] === v))[0] ?? null, error: null }),
      then(ok, mal) { return Promise.resolve({ data: datos.filter((f) => filtros.every(([c, v]) => f[c] === v)), error: null }).then(ok, mal); },
    };
    return b;
  };
  return {
    establecimientoId: 'eeeeeeee-0000-4000-8000-000000000001',
    llamadas,
    consultarFuncion: vi.fn((funcion) => {
      const registro = [];
      llamadas.funciones.push({ funcion, filtros: registro });
      return builder(filas, registro);
    }),
    rpc: vi.fn(async (funcion, args) => { llamadas.rpc.push({ funcion, args }); return {}; }),
    listar: vi.fn((tabla) => builder(tabla === 'establecimientos' ? [sede] : propia ? [propia] : [])),
    eliminar: vi.fn(async (tabla, id) => { llamadas.eliminar.push({ tabla, id }); }),
  };
}

describe('CA4 / ESC-F7-01 · variables inválidas', () => {
  it('"Hola {nombre_clente}" señala la variable, su posición, línea, columna y una sugerencia', () => {
    expect(validarPlantilla('Hola {nombre_clente}')).toEqual([
      expect.objectContaining({ variable: '{nombre_clente}', posicion: 5, longitud: 15, linea: 1, columna: 6, sugerencia: '{nombre_cliente}' }),
    ]);
  });

  it('las cinco variables permitidas son válidas', () => {
    expect(validarPlantilla('{nombre_cliente} {placa} {estado} {sede} {hora}')).toEqual([]);
  });

  it('marca cada inválida: mayúsculas, inexistentes, llave sin cerrar y llave sin abrir', () => {
    const errores = validarPlantilla('Hola {Placa}\ntotal {total} y {sede\nfin }');
    expect(errores.map((e) => [e.variable, e.linea, e.columna])).toEqual([
      ['{Placa}', 1, 6],
      ['{total}', 2, 7],
      ['{sede', 2, 17],
      ['}', 3, 5],
    ]);
    expect(errores[0].sugerencia).toBe('{placa}');
    expect(errores[1].sugerencia).toBeNull();
  });

  it('guardar con una variable inválida responde 400 con el detalle y no toca la base', async () => {
    const tenant = tenantFalso();
    const error = await guardarPlantilla(tenant, 'u1', { estado: 'listo', canal: 'sms', cuerpo: 'Hola {nombre_clente}' }).catch((e) => e);
    expect(error).toMatchObject({ codigo: 'VALIDACION', status: 400 });
    expect(error.detalles).toEqual([expect.objectContaining({ campo: 'cuerpo', variable: '{nombre_clente}', posicion: 5 })]);
    expect(tenant.rpc).not.toHaveBeenCalled();
  });

  it('también valida el asunto del correo y el largo por canal', async () => {
    const tenant = tenantFalso();
    const errAsunto = await guardarPlantilla(tenant, 'u1', { estado: 'listo', canal: 'correo', asunto: 'Listo {placas}', cuerpo: 'ok' }).catch((e) => e);
    expect(errAsunto.detalles).toEqual([expect.objectContaining({ campo: 'asunto', variable: '{placas}', sugerencia: '{placa}' })]);
    const errLargo = await guardarPlantilla(tenant, 'u1', { estado: 'listo', canal: 'push', cuerpo: 'a'.repeat(LIMITES.push + 1) }).catch((e) => e);
    expect(errLargo.detalles[0].mensaje).toContain('hasta 240 caracteres');
    expect(tenant.rpc).not.toHaveBeenCalled();
  });
});

describe('CA2 / ESC-F7-02 · caracteres y partes del SMS', () => {
  it('200 caracteres GSM-7 → 2 partes con el aviso de mayor costo', () => {
    const conteo = contarSms('a'.repeat(200));
    expect(conteo).toMatchObject({ caracteres: 200, segmentos: 2, codificacion: 'GSM-7', limitePorParte: 153 });
    expect(conteo.advertencias).toEqual(['El mensaje se enviará en 2 partes y tendrá mayor costo: cada parte se cobra como un SMS.']);
  });

  it('160 caracteres caben en 1 parte; 161 pasan a 2; 307 a 3', () => {
    expect(contarSms('a'.repeat(160))).toMatchObject({ segmentos: 1, advertencias: [] });
    expect(contarSms('a'.repeat(161)).segmentos).toBe(2);
    expect(contarSms('a'.repeat(307)).segmentos).toBe(3);
  });

  it('una tilde fuera de GSM-7 cambia a UCS-2: 70 por parte, y se explica por qué en palabras simples', () => {
    const conteo = contarSms(`Tu vehículo ${'a'.repeat(59)}`); // 71 caracteres
    expect(conteo).toMatchObject({ caracteres: 71, segmentos: 2, codificacion: 'UCS-2', limitePorParte: 67, caracteresEspeciales: ['í'] });
    expect(conteo.advertencias[0]).toBe('El mensaje se enviará en 2 partes y tendrá mayor costo: cada parte se cobra como un SMS.');
    expect(conteo.advertencias[1]).toContain('«í»');
    expect(conteo.advertencias[1]).toContain('70 caracteres por parte, en lugar de 160');
  });

  it('con tildes pero en una sola parte explica el límite de 70 sin hablar de varias partes', () => {
    const conteo = contarSms('Tu vehículo está listo');
    expect(conteo.segmentos).toBe(1);
    expect(conteo.advertencias).toHaveLength(1);
    expect(conteo.advertencias[0]).toContain('70 caracteres por parte');
  });

  it('é, ñ y ü sí son GSM-7; los caracteres extendidos ({ } [ ] € ~) ocupan 2', () => {
    expect(contarSms('Café niño pingüino').codificacion).toBe('GSM-7');
    expect(contarSms('€'.repeat(80))).toMatchObject({ caracteres: 80, segmentos: 1 });
    expect(contarSms('€'.repeat(81)).segmentos).toBe(2);
  });

  it('guardar un SMS largo devuelve caracteres, segmentos y advertencias', async () => {
    const cuerpo = `{sede}: ${'a'.repeat(192)}`; // 200 caracteres
    const tenant = tenantFalso({ filas: [{ ...FILAS[1], cuerpo, personalizada: true }] });
    const respuesta = await guardarPlantilla(tenant, 'u1', { estado: 'listo', canal: 'sms', asunto: 'se ignora', cuerpo });
    expect(respuesta).toMatchObject({ caracteres: 200, segmentos: 2, codificacion: 'GSM-7', personalizada: true, asunto: null });
    expect(respuesta.advertencias[0]).toContain('2 partes');
    expect(tenant.llamadas.rpc[0]).toEqual({
      funcion: 'guardar_plantilla_notificacion',
      args: { p_estado: 'listo', p_canal: 'sms', p_asunto: null, p_cuerpo: cuerpo, p_usuario_id: 'u1' },
    });
  });
});

describe('CA1 · listar, guardar y restaurar', () => {
  it('lista las plantillas con variables, estados, límites y el conteo de los SMS', async () => {
    const respuesta = await listarPlantillas(tenantFalso());
    expect(respuesta.variables.map((v) => v.nombre)).toEqual(['nombre_cliente', 'placa', 'estado', 'sede', 'hora']);
    expect(respuesta.estados.map((e) => e.valor)).toEqual(['recibido', 'en_lavado', 'secado', 'listo', 'entregado']);
    expect(respuesta.canales).toEqual(['push', 'sms', 'correo']);
    const sms = respuesta.plantillas.find((p) => p.canal === 'sms');
    expect(sms).toMatchObject({ personalizada: false, asunto: null, sms: { segmentos: 1, codificacion: 'GSM-7' } });
    expect(sms.plataforma.cuerpo).toBe(FILAS[1].cuerpo);
  });

  it('restaurar borra la propia de la sede (con el tenant) y devuelve la de la plataforma', async () => {
    const tenant = tenantFalso({ propia: { id: 'p-1', estado: 'listo', canal: 'sms' } });
    const respuesta = await restaurarPlantilla(tenant, { estado: 'listo', canal: 'sms' });
    expect(tenant.llamadas.eliminar).toEqual([{ tabla: 'plantillas_notificacion', id: 'p-1' }]);
    expect(respuesta).toMatchObject({ personalizada: false, cuerpo: FILAS[1].cuerpo });
  });

  it('restaurar sin plantilla propia no falla ni borra nada', async () => {
    const tenant = tenantFalso();
    await restaurarPlantilla(tenant, { estado: 'listo', canal: 'sms' });
    expect(tenant.eliminar).not.toHaveBeenCalled();
  });
});

describe('CA3 / ESC-F7-03 · vista previa', () => {
  it('devuelve push, SMS y correo con datos de ejemplo y la marca de la sede', async () => {
    const tenant = tenantFalso();
    const previa = await vistaPrevia(tenant, { estado: 'listo', canal: 'sms', cuerpo: '{sede}: hola {nombre_cliente}, {placa} esta {estado} ({hora}).' });
    expect(previa.sede).toEqual({ nombre: 'Lavadero Norte', logoUrl: SEDE.logo_url, colorPrimario: '#B91C1C', colorSecundario: '#F59E0B' });
    expect(previa.datosEjemplo).toEqual({ nombre_cliente: 'Laura', placa: 'ABC123', estado: 'listo para recoger', sede: 'Lavadero Norte', hora: '3:45 p. m.' });
    // SMS: el texto editado (sin guardar).
    expect(previa.sms).toMatchObject({ texto: 'Lavadero Norte: hola Laura, ABC123 esta listo para recoger (3:45 p. m.).', segmentos: 1 });
    // Push y correo: los guardados del mismo estado.
    expect(previa.push).toEqual({ titulo: '¡Tu vehículo está listo!', texto: 'Laura, tu vehículo ABC123 está listo en Lavadero Norte.' });
    expect(previa.correo.asunto).toBe('Tu vehículo ABC123 está listo');
    expect(previa.correo.html).toContain('background:#B91C1C');
    expect(previa.correo.html).toContain(`src="${SEDE.logo_url}"`);
    expect(previa.correo.html).toContain('<p style="margin:0 0 16px;line-height:1.5">Hola Laura,</p>');
    expect(previa.correo.texto).toBe('Hola Laura,\n\ntu vehículo ABC123 está listo para recoger desde las 3:45 p. m..');
    expect(tenant.rpc).not.toHaveBeenCalled(); // la vista previa no guarda
  });

  it('el correo escapa el HTML del texto y de los datos', async () => {
    const tenant = tenantFalso({ sede: { ...SEDE, nombre: '<b>Sede</b>' } });
    const previa = await vistaPrevia(tenant, { estado: 'listo', canal: 'correo', asunto: 'Hola', cuerpo: '<script>alert(1)</script> {sede}' });
    expect(previa.correo.html).not.toContain('<script>');
    expect(previa.correo.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &lt;b&gt;Sede&lt;/b&gt;');
  });

  it('sin logo muestra el nombre; un color inválido usa el de Zaru', async () => {
    const tenant = tenantFalso({ sede: { nombre: 'Sur', logo_url: null, color_primario: 'rojo' } });
    const previa = await vistaPrevia(tenant, { estado: 'listo', canal: 'push', cuerpo: 'Hola' });
    expect(previa.sede).toMatchObject({ logoUrl: null, colorPrimario: null });
    expect(previa.correo.html).toContain('background:#2563EB');
    expect(previa.correo.html).toContain('>Sur</span>');
    expect(previa.push.titulo).toBe('Sur'); // push sin asunto: título = nombre de la sede
  });

  it('una variable inválida también bloquea la vista previa', async () => {
    await expect(vistaPrevia(tenantFalso(), { estado: 'listo', canal: 'push', cuerpo: '{nombre}' })).rejects.toMatchObject({ codigo: 'VALIDACION' });
  });
});

describe('RF-F7-05 · armarMensaje para el envío (HU-46 / HU-28)', () => {
  const datos = { cliente: { nombre: 'Carlos Pérez' }, vehiculo: { placa: 'xyz789' }, momento: '2026-11-17T14:05:00Z' };

  it('sin plantilla propia usa la de la plataforma y lo indica en `origen`', async () => {
    const mensaje = await armarMensaje(tenantFalso(), { estado: 'listo', canal: 'sms', datos });
    expect(mensaje).toMatchObject({ origen: 'plataforma', canal: 'sms', texto: 'Lavadero Norte: tu carro XYZ789 ya puede ser recogido.', segmentos: 1 });
  });

  it('con plantilla propia usa la de la sede; acepta el evento de la cola y filtra por estado y canal', async () => {
    const propia = { ...FILAS[1], cuerpo: 'Listo {placa}, {nombre_cliente}! ({hora})', personalizada: true };
    const tenant = tenantFalso({ filas: [FILAS[0], propia, FILAS[2]] });
    const mensaje = await armarMensaje(tenant, { estado: 'orden.lista', canal: 'sms', datos });
    expect(mensaje).toMatchObject({ origen: 'sede', texto: 'Listo XYZ789, Carlos! (9:05 a. m.)' });
    expect(tenant.llamadas.funciones[0]).toEqual({ funcion: 'plantillas_notificacion_de', filtros: [['estado', 'listo'], ['canal', 'sms']] });
  });

  it('el correo agrega los bloques extra de quien envía (tabla de servicios, enlaces)', async () => {
    const mensaje = await armarMensaje(tenantFalso(), {
      estado: 'listo', canal: 'correo', datos: { ...datos, establecimiento: SEDE },
      extra: { html: '<table id="servicios"></table>', texto: 'Total: $30.000' },
    });
    expect(mensaje.html).toContain('<table id="servicios"></table>');
    expect(mensaje.texto.endsWith('\n\nTotal: $30.000')).toBe(true);
  });

  it('estado o canal desconocido es un error de programación', async () => {
    await expect(armarMensaje(tenantFalso(), { estado: 'lavando', canal: 'sms' })).rejects.toThrow('Estado de plantilla desconocido');
    await expect(armarMensaje(tenantFalso(), { estado: 'listo', canal: 'whatsapp' })).rejects.toThrow('Canal de plantilla desconocido');
  });
});

describe('render y valores', () => {
  it('renderizar reemplaza solo variables válidas y deja el resto igual', () => {
    expect(renderizar('{placa} {otra} {placa}', { placa: 'ABC123' })).toBe('ABC123 {otra} ABC123');
  });

  it('valoresDesde usa el primer nombre, la placa en mayúsculas y la hora de Bogotá', () => {
    expect(valoresDesde({ ...DATOS_EJEMPLO, establecimiento: SEDE, estado: 'en_lavado' })).toEqual({
      nombre_cliente: 'Laura', placa: 'ABC123', estado: 'en lavado', sede: 'Lavadero Norte', hora: '3:45 p. m.',
    });
    expect(valoresDesde({ estado: 'recibido' })).toMatchObject({ nombre_cliente: 'cliente', sede: 'tu car wash' });
  });
});

describe('RF-F7-05 · plantillas de la plataforma sembradas en la migración', () => {
  const migraciones = join(dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations');
  const archivo = readdirSync(migraciones).find((n) => n.endsWith('_hu32_plantillas_notificacion.sql'));
  const sql = readFileSync(join(migraciones, archivo), 'utf8');
  const filas = [...sql.matchAll(/\(null, '(\w+)', '(\w+)', (null|'[^']*'),\s*(E?)'([^']*)'\)/g)].map(([, estado, canal, asunto, e, cuerpo]) => ({
    estado,
    canal,
    asunto: asunto === 'null' ? null : asunto.slice(1, -1),
    cuerpo: e ? cuerpo.replaceAll('\\n', '\n') : cuerpo,
  }));

  it('hay una por cada estado y canal (15)', () => {
    expect(filas).toHaveLength(15);
    for (const estado of Object.keys(ESTADOS)) {
      for (const canal of CANALES) expect(filas.some((f) => f.estado === estado && f.canal === canal), `${estado}/${canal}`).toBe(true);
    }
  });

  it('todas usan solo variables válidas y respetan los límites', () => {
    for (const f of filas) {
      expect(validarPlantilla(f.cuerpo), `${f.estado}/${f.canal}`).toEqual([]);
      if (f.asunto) expect(validarPlantilla(f.asunto)).toEqual([]);
      expect(f.cuerpo.length).toBeLessThanOrEqual(LIMITES[f.canal]);
    }
  });

  it('los SMS de la plataforma caben en una parte GSM-7 aun con datos de ejemplo', () => {
    const valores = valoresDesde({ ...DATOS_EJEMPLO, establecimiento: { nombre: 'Lavadero Norte Express' }, estado: 'listo' });
    for (const f of filas.filter((x) => x.canal === 'sms')) {
      expect(contarSms(f.cuerpo).codificacion, f.estado).toBe('GSM-7');
      expect(contarSms(renderizar(f.cuerpo, valores)).segmentos, f.estado).toBe(1);
    }
  });
});
