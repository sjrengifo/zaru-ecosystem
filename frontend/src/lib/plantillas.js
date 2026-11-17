// HU-32 — Reglas de las plantillas de notificación en el navegador, sin React.
// Son las mismas del backend (backend/src/shared/plantillasNotificacion.js): el panel avisa al
// instante y la API vuelve a validar al guardar (CA4), así que nunca se guarda una variable inválida.

export const VARIABLES = ['nombre_cliente', 'placa', 'estado', 'sede', 'hora'];
const NOMBRES = new Set(VARIABLES);

export const NOMBRE_CANAL = { push: 'Notificación push', sms: 'SMS', correo: 'Correo' };
export const ETIQUETA_ASUNTO = { push: 'Título de la notificación', correo: 'Asunto del correo' };

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

export function sugerirVariable(nombre) {
  const limpio = String(nombre ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  let mejor = null;
  for (const valida of NOMBRES) {
    const d = distancia(limpio, valida);
    if (d <= 2 && (!mejor || d < mejor.d)) mejor = { nombre: valida, d };
  }
  return mejor ? `{${mejor.nombre}}` : null;
}

function lineaYColumna(texto, posicion) {
  const antes = texto.slice(0, posicion);
  return { linea: antes.split('\n').length, columna: posicion - antes.lastIndexOf('\n') };
}

/** CA4: variables inválidas con su posición, línea, columna y sugerencia. */
export function validarPlantilla(texto) {
  const errores = [];
  const t = String(texto ?? '');
  let i = 0;
  while (i < t.length) {
    if (t[i] === '{') {
      let fin = i + 1;
      while (fin < t.length && !['{', '}', '\n'].includes(t[fin])) fin += 1;
      if (t[fin] === '}') {
        const nombre = t.slice(i + 1, fin);
        if (!NOMBRES.has(nombre)) {
          const variable = t.slice(i, fin + 1);
          const sugerencia = sugerirVariable(nombre);
          errores.push({
            variable, posicion: i, longitud: variable.length, ...lineaYColumna(t, i), sugerencia,
            mensaje: `La variable ${variable} no existe.${sugerencia ? ` ¿Quisiste decir ${sugerencia}?` : ''}`,
          });
        }
        i = fin + 1;
        continue;
      }
      const pedazo = t.slice(i, fin).split(/\s/)[0] || '{';
      errores.push({
        variable: pedazo, posicion: i, longitud: pedazo.length, ...lineaYColumna(t, i), sugerencia: sugerirVariable(pedazo.slice(1)),
        mensaje: `Falta cerrar la llave en ${pedazo}. Las variables se escriben así: {placa}.`,
      });
      i += 1;
      continue;
    }
    if (t[i] === '}') {
      errores.push({
        variable: '}', posicion: i, longitud: 1, ...lineaYColumna(t, i), sugerencia: null,
        mensaje: 'Hay una llave "}" sin abrir. Las variables se escriben así: {placa}.',
      });
    }
    i += 1;
  }
  return errores;
}

/** Corta el texto en pedazos normales y pedazos inválidos para resaltarlos (CA4). */
export function partesResaltadas(texto, errores) {
  const t = String(texto ?? '');
  const ordenados = [...errores].sort((a, b) => a.posicion - b.posicion);
  const partes = [];
  let cursor = 0;
  for (const e of ordenados) {
    if (e.posicion < cursor) continue;
    if (e.posicion > cursor) partes.push({ texto: t.slice(cursor, e.posicion), invalida: false });
    partes.push({ texto: t.slice(e.posicion, e.posicion + e.longitud), invalida: true });
    cursor = e.posicion + e.longitud;
  }
  if (cursor < t.length) partes.push({ texto: t.slice(cursor), invalida: false });
  return partes;
}

/** Inserta `{variable}` en la posición del cursor. Devuelve el texto nuevo y dónde queda el cursor. */
export function insertarVariable(texto, variable, inicio = String(texto ?? '').length, fin = inicio) {
  const t = String(texto ?? '');
  const marca = `{${variable}}`;
  return { texto: t.slice(0, inicio) + marca + t.slice(fin), cursor: inicio + marca.length };
}

// ---------------------------------------------------------------------------------------------
// CA2 · Caracteres y partes del SMS (GSM-7: 160 / 153 · UCS-2: 70 / 67)
// ---------------------------------------------------------------------------------------------
const GSM_BASICO = new Set(Array.from(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
));
const GSM_EXTENDIDO = new Set(Array.from('^{}\\[~]|€\f'));
const LIMITES_SMS = { 'GSM-7': { unaParte: 160, porParte: 153 }, 'UCS-2': { unaParte: 70, porParte: 67 } };

export function contarSms(texto) {
  const t = String(texto ?? '');
  const simbolos = Array.from(t);
  const especiales = [...new Set(simbolos.filter((s) => !GSM_BASICO.has(s) && !GSM_EXTENDIDO.has(s)))];
  const codificacion = especiales.length ? 'UCS-2' : 'GSM-7';
  const unidades = codificacion === 'UCS-2' ? t.length : simbolos.reduce((n, s) => n + (GSM_EXTENDIDO.has(s) ? 2 : 1), 0);
  const { unaParte, porParte } = LIMITES_SMS[codificacion];
  const segmentos = unidades === 0 ? 0 : unidades <= unaParte ? 1 : Math.ceil(unidades / porParte);
  return {
    caracteres: simbolos.length,
    segmentos,
    codificacion,
    limitePorParte: segmentos > 1 ? porParte : unaParte,
    caracteresEspeciales: especiales.slice(0, 5),
    // Cuántos caben antes de pasar a la parte siguiente.
    restantes: segmentos <= 1 ? unaParte - unidades : segmentos * porParte - unidades,
  };
}

/** "1 parte" / "3 partes". */
export const textoPartes = (n) => `${n} ${n === 1 ? 'parte' : 'partes'}`;

/** CA2: aviso de varias partes: siempre dice cuántas y que tendrá mayor costo. */
export const avisoPartes = (segmentos) =>
  segmentos > 1 ? `El mensaje se enviará en ${segmentos} partes y tendrá mayor costo: cada parte se cobra como un SMS.` : null;

/** CA2: por qué con tildes el límite por parte es 70 y no 160, en palabras simples. */
export function explicacionTildes(caracteresEspeciales = []) {
  if (!caracteresEspeciales.length) return null;
  const ejemplos = caracteresEspeciales.slice(0, 3).map((s) => `«${s}»`).join(', ');
  return `Tu texto tiene caracteres como ${ejemplos} que el SMS básico no admite. Por eso el mensaje se envía en un formato especial que solo permite 70 caracteres por parte, en lugar de 160. Si los cambias (por ejemplo «á» por «a»), caben más letras en cada parte.`;
}

/** Largo visible del texto (un emoji cuenta como 1). */
export const largo = (texto) => Array.from(String(texto ?? '')).length;
