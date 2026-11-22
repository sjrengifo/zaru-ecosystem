// HU-32 — Plantillas de notificación con la marca de la sede (ZARU-21 · RF-F7-01 a RF-F7-05).
//
// Motor de plantillas, sin Express:
//   CA1 / RF-F7-01: cada sede edita el texto de cada estado de la orden y cada canal, con las
//        variables {nombre_cliente}, {placa}, {estado}, {sede} y {hora}.
//   CA2 / RF-F7-02: para SMS se cuentan caracteres y partes (GSM-7: 160 en una parte, 153 por parte;
//        con tildes u otros caracteres fuera de GSM-7 se usa UCS-2: 70 y 67) y se advierte el costo.
//   CA3 / RF-F7-03: vista previa en push, SMS y correo con datos de ejemplo y la marca de la sede.
//   CA4 / RF-F7-04: una variable inexistente o mal escrita bloquea el guardado; el error dice cuál
//        es y en qué posición, línea y columna.
//   RF-F7-05: si la sede no personalizó una plantilla, se usa la de la plataforma (función SQL
//        plantillas_notificacion_de).
//
// Envío real: `armarMensaje` arma el mensaje de un estado y un canal con la plantilla de la sede o la
// de la plataforma. La usarán HU-46 y HU-28 (ver specs/backend/fases/F7-comunicacion-avanzada/plan.md).
// Todo se lee y escribe con el acceso del tenant (HU-41): nunca se ve ni se cambia otra sede.
import { AppError } from './errores.js';
import { escaparHtml } from './plantillasCorreo.js';

export const CANALES = ['push', 'sms', 'correo'];

/** Estados de la orden (enum estado_orden) y cómo se leen dentro de una frase ({estado}). */
export const ESTADOS = Object.freeze({
  recibido: { etiqueta: 'Recibido', enFrase: 'recibido' },
  en_lavado: { etiqueta: 'En lavado', enFrase: 'en lavado' },
  secado: { etiqueta: 'Secado', enFrase: 'en secado' },
  listo: { etiqueta: 'Listo', enFrase: 'listo para recoger' },
  entregado: { etiqueta: 'Entregado', enFrase: 'entregado' },
});

/** Eventos de la cola de F6 (HU-46) y el estado de la orden que les corresponde. */
export const ESTADO_DE_EVENTO = Object.freeze({ 'orden.recibida': 'recibido', 'orden.lista': 'listo' });

export const VARIABLES = Object.freeze([
  { nombre: 'nombre_cliente', descripcion: 'Primer nombre del cliente' },
  { nombre: 'placa', descripcion: 'Placa del vehículo' },
  { nombre: 'estado', descripcion: 'Estado del vehículo, p. ej. "listo para recoger"' },
  { nombre: 'sede', descripcion: 'Nombre de tu sede' },
  { nombre: 'hora', descripcion: 'Hora del cambio de estado' },
]);
const NOMBRES_VARIABLES = new Set(VARIABLES.map((v) => v.nombre));

/** Máximo de caracteres del texto por canal (igual que los checks de la base). */
export const LIMITES = Object.freeze({ push: 240, sms: 640, correo: 2000, asunto: 120 });

const ZONA = 'America/Bogota';
const COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;
const colorSeguro = (color, defecto = '#2563EB') => (COLOR_HEX.test(color ?? '') ? color : defecto);

// ---------------------------------------------------------------------------------------------
// CA4 · Validación de variables
// ---------------------------------------------------------------------------------------------

function distancia(a, b) {
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const arriba = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = arriba;
    }
  }
  return fila[b.length];
}

/** La variable válida más parecida (para "¿quisiste decir…?"), o null si ninguna se parece. */
export function sugerirVariable(nombre) {
  const limpio = String(nombre ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  let mejor = null;
  for (const valida of NOMBRES_VARIABLES) {
    const d = distancia(limpio, valida);
    if (d <= 2 && (!mejor || d < mejor.d)) mejor = { nombre: valida, d };
  }
  return mejor ? `{${mejor.nombre}}` : null;
}

function lineaYColumna(texto, posicion) {
  const antes = texto.slice(0, posicion);
  const linea = antes.split('\n').length;
  const columna = posicion - antes.lastIndexOf('\n');
  return { linea, columna };
}

/**
 * Variables inválidas del texto. Vacío si todo está bien.
 * Inválido: {algo} que no está en la lista, o una llave que no abre o no cierra en la misma línea.
 * @returns {Array<{ variable: string, posicion: number, linea: number, columna: number, longitud: number, sugerencia: string|null, mensaje: string }>}
 */
export function validarPlantilla(texto) {
  const errores = [];
  const t = String(texto ?? '');
  let i = 0;
  while (i < t.length) {
    const c = t[i];
    if (c === '{') {
      let fin = i + 1;
      while (fin < t.length && !['{', '}', '\n'].includes(t[fin])) fin += 1;
      if (t[fin] === '}') {
        const nombre = t.slice(i + 1, fin);
        if (!NOMBRES_VARIABLES.has(nombre)) {
          const variable = t.slice(i, fin + 1);
          const sugerencia = sugerirVariable(nombre);
          errores.push({
            variable,
            posicion: i,
            longitud: variable.length,
            ...lineaYColumna(t, i),
            sugerencia,
            mensaje: `La variable ${variable} no existe.${sugerencia ? ` ¿Quisiste decir ${sugerencia}?` : ''}`,
          });
        }
        i = fin + 1;
        continue;
      }
      const pedazo = t.slice(i, fin).split(/\s/)[0] || '{';
      errores.push({
        variable: pedazo,
        posicion: i,
        longitud: pedazo.length,
        ...lineaYColumna(t, i),
        sugerencia: sugerirVariable(pedazo.slice(1)),
        mensaje: `Falta cerrar la llave en ${pedazo}. Las variables se escriben así: {placa}.`,
      });
      i += 1;
      continue;
    }
    if (c === '}') {
      errores.push({
        variable: '}',
        posicion: i,
        longitud: 1,
        ...lineaYColumna(t, i),
        sugerencia: null,
        mensaje: 'Hay una llave "}" sin abrir. Las variables se escriben así: {placa}.',
      });
    }
    i += 1;
  }
  return errores;
}

// ---------------------------------------------------------------------------------------------
// CA2 · Caracteres y partes del SMS
// ---------------------------------------------------------------------------------------------

// Alfabeto GSM-7 (3GPP TS 23.038): cada uno ocupa 1 de los 160 espacios. Las tildes á, í, ó, ú no están.
const GSM_BASICO = new Set(Array.from(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
));
// Extensión GSM-7: caben, pero cada uno ocupa 2 espacios.
const GSM_EXTENDIDO = new Set(Array.from('^{}\\[~]|€\f'));

export const SMS = Object.freeze({
  'GSM-7': { unaParte: 160, porParte: 153 },
  'UCS-2': { unaParte: 70, porParte: 67 },
});

/**
 * Cuenta el SMS como lo cobra el operador.
 * @returns {{ caracteres: number, segmentos: number, codificacion: 'GSM-7'|'UCS-2', limitePorParte: number, caracteresEspeciales: string[], advertencias: string[] }}
 */
export function contarSms(texto) {
  const t = String(texto ?? '');
  const simbolos = Array.from(t);
  const especiales = [...new Set(simbolos.filter((s) => !GSM_BASICO.has(s) && !GSM_EXTENDIDO.has(s)))];
  const codificacion = especiales.length ? 'UCS-2' : 'GSM-7';
  const unidades = codificacion === 'UCS-2'
    ? t.length // UTF-16: un emoji ocupa 2
    : simbolos.reduce((total, s) => total + (GSM_EXTENDIDO.has(s) ? 2 : 1), 0);
  const { unaParte, porParte } = SMS[codificacion];
  const segmentos = unidades === 0 ? 0 : unidades <= unaParte ? 1 : Math.ceil(unidades / porParte);
  return {
    caracteres: simbolos.length,
    segmentos,
    codificacion,
    limitePorParte: segmentos > 1 ? porParte : unaParte,
    caracteresEspeciales: especiales.slice(0, 5),
    advertencias: advertenciasSms({ segmentos, codificacion, especiales }),
  };
}

/** Explicación en palabras simples (CA2): cuántas partes, que cuesta más y por qué el límite es 70. */
export function advertenciasSms({ segmentos, codificacion, especiales = [] }) {
  const avisos = [];
  if (segmentos > 1) {
    avisos.push(`El mensaje se enviará en ${segmentos} partes y tendrá mayor costo: cada parte se cobra como un SMS.`);
  }
  if (codificacion === 'UCS-2') {
    const ejemplos = especiales.slice(0, 3).map((s) => `«${s === '\n' ? '↵' : s}»`).join(', ');
    avisos.push(
      `El texto tiene caracteres como ${ejemplos} que el SMS básico no admite. Por eso se envía en un formato especial que solo permite 70 caracteres por parte, en lugar de 160. Si los cambias (por ejemplo «á» por «a»), caben más letras en cada parte.`,
    );
  }
  return avisos;
}

// ---------------------------------------------------------------------------------------------
// Render por canal
// ---------------------------------------------------------------------------------------------

const VARIABLE = /\{(nombre_cliente|placa|estado|sede|hora)\}/g;

/** Reemplaza las variables. Con `escapar`, el texto y los valores se escapan para HTML. */
export function renderizar(texto, valores, { escapar = (v) => v } = {}) {
  const t = String(texto ?? '');
  let salida = '';
  let ultimo = 0;
  for (const coincidencia of t.matchAll(VARIABLE)) {
    salida += escapar(t.slice(ultimo, coincidencia.index));
    salida += escapar(String(valores?.[coincidencia[1]] ?? ''));
    ultimo = coincidencia.index + coincidencia[0].length;
  }
  return salida + escapar(t.slice(ultimo));
}

const HORA = new Intl.DateTimeFormat('es-CO', { timeZone: ZONA, hour: 'numeric', minute: '2-digit', hour12: true });
export const formatoHora = (momento) => HORA.format(new Date(momento ?? Date.now())).replace(/\s+/g, ' ');
const primerNombre = (nombre) => String(nombre ?? '').trim().split(/\s+/)[0] || 'cliente';

/**
 * Valores de las variables a partir de los datos de la orden.
 * @param {{ cliente?: {nombre}, vehiculo?: {placa}, establecimiento?: {nombre}, estado: string, momento?: string|Date }} datos
 */
export function valoresDesde({ cliente, vehiculo, establecimiento, estado, momento } = {}) {
  return {
    nombre_cliente: primerNombre(cliente?.nombre),
    placa: String(vehiculo?.placa ?? '').toUpperCase(),
    estado: ESTADOS[estado]?.enFrase ?? '',
    sede: establecimiento?.nombre ?? 'tu car wash',
    hora: formatoHora(momento),
  };
}

/** Datos de ejemplo de la vista previa (CA3): 3:45 p. m. en Bogotá. */
export const DATOS_EJEMPLO = Object.freeze({
  cliente: { nombre: 'Laura Gómez' },
  vehiculo: { placa: 'ABC123' },
  momento: '2026-11-17T20:45:00Z',
});

/** Párrafos HTML a partir del texto ya escapado: línea en blanco = párrafo, salto simple = <br>. */
function parrafos(htmlEscapado) {
  return htmlEscapado
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.5">${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/** Correo con la marca de la sede: logo (o nombre) sobre el color primario. Todo dato se escapa. */
export function correoHtml({ establecimiento, titulo, cuerpoHtml, extraHtml = '' }) {
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
${extraHtml}
</td></tr>
<tr><td style="padding:16px 24px;background:#f9fafb;color:#6b7280;font-size:12px">
Recibes este correo porque dejaste tu vehículo en ${nombreSede}. Es un mensaje automático: por favor no respondas.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/**
 * Mensaje de un canal con una plantilla ya elegida.
 * @param {{ canal, asunto, cuerpo }} plantilla
 * @param {object} valores de valoresDesde()
 * @param {object} establecimiento { nombre, logo_url, color_primario, color_secundario }
 * @param {{ html?: string, texto?: string }} [extra] bloques que agrega quien envía (p. ej. HU-46:
 *        tabla de servicios, enlace de seguimiento o de baja). Ya deben venir escapados en `html`.
 */
export function mensajeDeCanal(plantilla, valores, establecimiento, extra = {}) {
  const texto = renderizar(plantilla.cuerpo, valores);
  const asunto = plantilla.asunto ? renderizar(plantilla.asunto, valores) : null;
  if (plantilla.canal === 'sms') {
    return { canal: 'sms', texto, ...contarSms(texto) };
  }
  if (plantilla.canal === 'push') {
    return { canal: 'push', titulo: asunto || establecimiento?.nombre || 'Zaru', texto };
  }
  const titulo = asunto || `Novedades de tu vehículo ${valores.placa}`.trim();
  return {
    canal: 'correo',
    asunto: titulo,
    html: correoHtml({
      establecimiento,
      titulo,
      cuerpoHtml: parrafos(renderizar(plantilla.cuerpo, valores, { escapar: escaparHtml })),
      extraHtml: extra.html ?? '',
    }),
    texto: extra.texto ? `${texto}\n\n${extra.texto}` : texto,
  };
}

// ---------------------------------------------------------------------------------------------
// Acceso a datos (siempre con el tenant de la sesión o de la orden)
// ---------------------------------------------------------------------------------------------

const FUNCION_PLANTILLAS = 'plantillas_notificacion_de';
const COLUMNAS_SEDE = 'nombre, logo_url, color_primario, color_secundario';

async function cargarSede(tenant) {
  const { data, error } = await tenant.listar('establecimientos', COLUMNAS_SEDE).maybeSingle();
  if (error) throw error;
  return data ?? {};
}

export const sedeConMarca = (sede) => ({
  nombre: sede?.nombre ?? null,
  logoUrl: sede?.logo_url ?? null,
  colorPrimario: COLOR_HEX.test(sede?.color_primario ?? '') ? sede.color_primario : null,
  colorSecundario: COLOR_HEX.test(sede?.color_secundario ?? '') ? sede.color_secundario : null,
});

/** Lo que el panel recibe de una plantilla. */
function plantillaPublica(fila) {
  const base = {
    estado: fila.estado,
    canal: fila.canal,
    asunto: fila.canal === 'sms' ? null : fila.asunto ?? null,
    cuerpo: fila.cuerpo,
    personalizada: Boolean(fila.personalizada),
    actualizadaEn: fila.updated_at ?? null,
    plataforma: { asunto: fila.canal === 'sms' ? null : fila.asunto_plataforma ?? null, cuerpo: fila.cuerpo_plataforma ?? null },
  };
  return fila.canal === 'sms' ? { ...base, sms: contarSms(fila.cuerpo) } : base;
}

async function plantillasDe(tenant, filtros = {}) {
  let consulta = tenant.consultarFuncion(FUNCION_PLANTILLAS);
  for (const [columna, valor] of Object.entries(filtros)) consulta = consulta.eq(columna, valor);
  const { data, error } = await consulta;
  if (error) throw error;
  return data ?? [];
}

/** GET /plantillas: las 15 plantillas (5 estados × 3 canales), las variables y los estados. */
export async function listarPlantillas(tenant) {
  const filas = await plantillasDe(tenant);
  return {
    variables: VARIABLES,
    estados: Object.entries(ESTADOS).map(([valor, { etiqueta }]) => ({ valor, etiqueta })),
    canales: CANALES,
    limites: LIMITES,
    plantillas: filas.map(plantillaPublica),
  };
}

/**
 * CA4: valida el texto (y el asunto) y lanza 400 con cada variable inválida, su posición, línea y
 * columna. También valida el largo por canal.
 */
export function validarParaGuardar({ canal, asunto, cuerpo }) {
  const detalles = [];
  const largo = Array.from(String(cuerpo ?? '')).length;
  if (!String(cuerpo ?? '').trim()) detalles.push({ campo: 'cuerpo', mensaje: 'Escribe el texto del mensaje' });
  if (largo > LIMITES[canal]) detalles.push({ campo: 'cuerpo', mensaje: `El texto puede tener hasta ${LIMITES[canal]} caracteres (tiene ${largo})` });
  for (const error of validarPlantilla(cuerpo)) detalles.push({ campo: 'cuerpo', ...error });
  if (canal !== 'sms' && asunto) {
    if (asunto.length > LIMITES.asunto) detalles.push({ campo: 'asunto', mensaje: `El asunto puede tener hasta ${LIMITES.asunto} caracteres` });
    for (const error of validarPlantilla(asunto)) detalles.push({ campo: 'asunto', ...error });
  }
  if (detalles.length) {
    const hayVariables = detalles.some((d) => d.variable);
    throw new AppError('VALIDACION', hayVariables ? 'La plantilla tiene variables que no existen o están mal escritas' : 'La plantilla tiene datos inválidos', detalles);
  }
}

/** PUT /plantillas/{estado}/{canal}: guarda la plantilla de la sede (crea o reemplaza). */
export async function guardarPlantilla(tenant, usuarioId, { estado, canal, asunto, cuerpo }) {
  const asuntoFinal = canal === 'sms' ? null : asunto?.trim() || null;
  validarParaGuardar({ canal, asunto: asuntoFinal, cuerpo });
  await tenant.rpc('guardar_plantilla_notificacion', {
    p_estado: estado,
    p_canal: canal,
    p_asunto: asuntoFinal,
    p_cuerpo: cuerpo,
    p_usuario_id: usuarioId ?? null,
  });
  const [fila] = await plantillasDe(tenant, { estado, canal });
  const plantilla = plantillaPublica(fila);
  const conteo = canal === 'sms' ? contarSms(cuerpo) : null;
  return {
    ...plantilla,
    ...(conteo ? { caracteres: conteo.caracteres, segmentos: conteo.segmentos, codificacion: conteo.codificacion } : {}),
    advertencias: conteo?.advertencias ?? [],
  };
}

/** DELETE /plantillas/{estado}/{canal}: la sede vuelve al texto de la plataforma. */
export async function restaurarPlantilla(tenant, { estado, canal }) {
  const { data, error } = await tenant
    .listar('plantillas_notificacion', 'id')
    .eq('estado', estado)
    .eq('canal', canal)
    .maybeSingle();
  if (error) throw error;
  if (data) await tenant.eliminar('plantillas_notificacion', data.id, 'Plantilla');
  const [fila] = await plantillasDe(tenant, { estado, canal });
  return plantillaPublica(fila);
}

/**
 * CA3 / RF-F7-03: vista previa en los tres canales con datos de ejemplo y la marca de la sede.
 * El canal que se está editando usa el texto recibido (aún sin guardar); los otros dos, el guardado.
 */
export async function vistaPrevia(tenant, { estado, canal, asunto, cuerpo }) {
  const asuntoFinal = canal === 'sms' ? null : asunto?.trim() || null;
  validarParaGuardar({ canal, asunto: asuntoFinal, cuerpo });
  const [filas, sede] = await Promise.all([plantillasDe(tenant, { estado }), cargarSede(tenant)]);
  const porCanal = Object.fromEntries(filas.map((f) => [f.canal, f]));
  porCanal[canal] = { canal, asunto: asuntoFinal, cuerpo };

  const valores = valoresDesde({ ...DATOS_EJEMPLO, establecimiento: sede, estado });
  const mensaje = (c) => (porCanal[c] ? mensajeDeCanal({ ...porCanal[c], canal: c }, valores, sede) : null);
  const push = mensaje('push');
  const sms = mensaje('sms');
  const correo = mensaje('correo');
  return {
    estado,
    canalEditado: canal,
    sede: sedeConMarca(sede),
    datosEjemplo: valores,
    push: push && { titulo: push.titulo, texto: push.texto },
    sms,
    correo: correo && { asunto: correo.asunto, html: correo.html, texto: correo.texto },
  };
}

/**
 * Envío real (para HU-46 y HU-28): arma el mensaje de un estado y un canal con la plantilla de la
 * sede o, si no la personalizó, la de la plataforma (RF-F7-05).
 *
 * @param tenant acceso del tenant de la orden (crearAccesoTenant)
 * @param {{ estado: string, canal: 'push'|'sms'|'correo', datos: { cliente, vehiculo, establecimiento?, momento? }, extra?: { html?, texto? } }} opciones
 *        `estado` también acepta un evento de la cola ('orden.recibida', 'orden.lista').
 * @returns {Promise<{ canal, origen: 'sede'|'plataforma', asunto?, titulo?, texto, html?, caracteres?, segmentos?, codificacion? }>}
 */
export async function armarMensaje(tenant, { estado, canal, datos = {}, extra } = {}) {
  const estadoFinal = ESTADO_DE_EVENTO[estado] ?? estado;
  if (!ESTADOS[estadoFinal]) throw new Error(`Estado de plantilla desconocido: ${estado}`);
  if (!CANALES.includes(canal)) throw new Error(`Canal de plantilla desconocido: ${canal}`);
  const [[fila], sede] = await Promise.all([
    plantillasDe(tenant, { estado: estadoFinal, canal }),
    datos.establecimiento ? Promise.resolve(datos.establecimiento) : cargarSede(tenant),
  ]);
  if (!fila) throw new Error(`No hay plantilla de la plataforma para ${estadoFinal}/${canal}`);
  const valores = valoresDesde({ ...datos, establecimiento: sede, estado: estadoFinal });
  return { origen: fila.personalizada ? 'sede' : 'plataforma', ...mensajeDeCanal(fila, valores, sede, extra) };
}
