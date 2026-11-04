// HU-16 — Cálculos de reportes, sin Supabase ni Express.
// El controlador solo consulta las órdenes del establecimiento y delega aquí el
// ranking de servicios y la afluencia por día/franja. Así las reglas se prueban
// sin base de datos y una orden nunca se cuenta dos veces por tener varios servicios.

const ZONA_BOGOTA = 'America/Bogota';
// Colombia no aplica horario de verano: el día siempre empieza a las 00:00 -05:00.
const DESFASE_BOGOTA = '-05:00';

export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const DIA_DE_INGLES = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

const dosDigitos = (n) => String(n).padStart(2, '0');

/** Franjas fijas de dos horas que cubren el día completo, de 00:00 a 24:00. */
export const FRANJAS = Array.from({ length: 12 }, (_, indice) => {
  const inicio = indice * 2;
  const fin = inicio + 2;
  return {
    inicio,
    fin,
    etiqueta: `${dosDigitos(inicio)}:00–${dosDigitos(fin)}:00`,
  };
});

const FORMATO_PARTES = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_BOGOTA,
  weekday: 'short',
  hour: '2-digit',
  hourCycle: 'h23',
});

/** Día de la semana (0 = lunes) y hora local de Bogotá de una fecha. */
export function posicionBogota(fecha) {
  const partes = FORMATO_PARTES.formatToParts(new Date(fecha));
  const valor = (tipo) => partes.find((parte) => parte.type === tipo)?.value;
  const dia = DIA_DE_INGLES[valor('weekday')] ?? 0;
  const hora = Number(valor('hour'));
  return { dia, hora, franja: Math.min(FRANJAS.length - 1, Math.floor(hora / 2)) };
}

/** Instante UTC en que empieza un día AAAA-MM-DD en Bogotá. */
export function inicioDiaBogota(dia) {
  return new Date(`${dia}T00:00:00${DESFASE_BOGOTA}`).toISOString();
}

/** Día calendario siguiente a un AAAA-MM-DD (sin depender de la zona del servidor). */
export function diaSiguiente(dia) {
  const [anio, mes, numero] = dia.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, numero + 1)).toISOString().slice(0, 10);
}

/** Límite superior exclusivo del rango: las 00:00 del día siguiente a `hasta`. */
export function finDiaBogotaExclusivo(dia) {
  return inicioDiaBogota(diaSiguiente(dia));
}

const numero = (valor) => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

/**
 * CA1: ranking de servicios por cantidad de órdenes e ingresos.
 *
 * - Cada orden suma una sola vez por servicio (aunque la fila se repita por una
 *   relación anidada), evitando duplicar el conteo.
 * - Los ingresos usan el precio y el descuento guardados en `orden_servicios` al
 *   crear la orden, no el precio actual del catálogo.
 */
export function resumirServicios(ordenes = []) {
  const acumulado = new Map();

  ordenes.forEach((orden, indice) => {
    const claveOrden = orden?.id ?? `orden-${indice}`;
    // La llave primaria (orden_id, servicio_id) impide repetir un servicio en la
    // misma orden; este conjunto protege el conteo aun si el join lo duplicara.
    const serviciosDeLaOrden = new Set();
    for (const linea of orden?.orden_servicios ?? []) {
      const servicio = linea?.servicio ?? linea?.servicios ?? {};
      const id = servicio.id ?? linea?.servicio_id ?? 'sin-servicio';
      if (serviciosDeLaOrden.has(id)) continue;
      serviciosDeLaOrden.add(id);
      if (!acumulado.has(id)) {
        acumulado.set(id, {
          servicioId: id,
          nombre: servicio.nombre ?? 'Servicio sin nombre',
          ordenes: new Set(),
          ingresos: 0,
        });
      }
      const fila = acumulado.get(id);
      fila.ordenes.add(claveOrden);
      fila.ingresos += numero(linea?.precio) - numero(linea?.descuento);
    }
  });

  const servicios = [...acumulado.values()]
    .map(({ ordenes: ids, ingresos, ...resto }) => ({
      ...resto,
      ordenes: ids.size,
      ingresos: Math.round(ingresos * 100) / 100,
    }))
    .sort((a, b) => b.ordenes - a.ordenes || b.ingresos - a.ingresos || a.nombre.localeCompare(b.nombre, 'es'));

  return { totalOrdenes: ordenes.length, servicios };
}

/**
 * CA2: número de vehículos por día de la semana y franja horaria.
 *
 * Cada orden representa un ingreso de vehículo, así que un mismo vehículo que
 * vuelve otro día cuenta como una visita nueva. La matriz tiene 7 filas
 * (lunes a domingo) por 12 franjas de dos horas, en hora de Bogotá.
 */
export function resumirAfluencia(ordenes = []) {
  const matriz = Array.from({ length: DIAS_SEMANA.length }, () => Array(FRANJAS.length).fill(0));
  let totalVehiculos = 0;

  for (const orden of ordenes) {
    if (!orden?.created_at) continue;
    const fecha = new Date(orden.created_at);
    if (Number.isNaN(fecha.getTime())) continue;

    const { dia, franja } = posicionBogota(fecha);
    matriz[dia][franja] += 1;
    totalVehiculos += 1;
  }

  return {
    totalVehiculos,
    dias: DIAS_SEMANA,
    franjas: FRANJAS.map((franja) => franja.etiqueta),
    matriz,
    porDia: DIAS_SEMANA.map((dia, indice) => ({
      dia,
      vehiculos: matriz[indice].reduce((total, valor) => total + valor, 0),
    })),
    porFranja: FRANJAS.map((franja, indice) => ({
      franja: franja.etiqueta,
      vehiculos: matriz.reduce((total, fila) => total + fila[indice], 0),
    })),
  };
}
