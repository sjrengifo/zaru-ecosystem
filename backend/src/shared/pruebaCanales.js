// HU-31/HU-39 — Prueba real de envío por canal con fallback y contabilidad de consumo.
//
// Envía un mensaje de prueba al correo/celular del administrador autenticado (nunca a un destino
// recibido del frontend), prueba los canales en el orden push → SMS → correo y se detiene en el
// primero que acepta el proveedor. Cada intento reserva y confirma (o libera) consumo HU-39 con una
// referencia estable por prueba y canal: no hay doble conteo ni cupos inventados en el backend.
import { randomUUID } from 'node:crypto';
import { conTiempoMaximo, crearProveedorCorreo } from './correo.js';
import { proveedorSms } from './proveedorSms.js';
import { proveedorPush } from './proveedorPush.js';
import { ORDEN_CANALES } from './notificaciones.js';
import {
  confirmarConsumo,
  liberarConsumo,
  mesBogota,
  notificarAlerta80,
  reservarConsumo,
} from './consumo.js';
import { armarPreferenciasCanales, proveedoresDeCanales } from './preferenciasCanales.js';
import { enmascararCelular, enmascararCorreo } from './mascaras.js';

const MOTIVO_SIN_DESTINO = {
  sms: 'El administrador no tiene un celular registrado en su cuenta',
  correo: 'El administrador no tiene un correo registrado en su cuenta',
  push: 'El canal push no tiene un dispositivo registrado (HU-40)',
};

const textoError = (error) => String(error?.message ?? error).slice(0, 300);

function proveedoresEfectivos(inyectados = {}) {
  return { ...proveedoresDeCanales(), ...inyectados };
}

/** Desde el canal elegido hacia delante: SMS → correo, push → SMS → correo, correo → correo. */
export function ordenDesde(canal) {
  const inicio = ORDEN_CANALES.indexOf(canal);
  return inicio < 0 ? [...ORDEN_CANALES] : ORDEN_CANALES.slice(inicio);
}

function celularValido(valor) {
  let digitos = String(valor ?? '').replace(/\D/g, '');
  if (digitos.length === 12 && digitos.startsWith('57')) digitos = digitos.slice(2);
  return /^3\d{9}$/.test(digitos) ? digitos : null;
}

/** Los destinos salen de Auth; el frontend nunca puede elegir a quién se envía la prueba. */
async function destinoAdministrador(db, usuarioId, canal) {
  if (canal === 'push') return { valor: null, visible: null };
  if (!db?.auth?.admin?.getUserById) throw new Error('La API de administración de Auth no está disponible');
  const { data, error } = await db.auth.admin.getUserById(usuarioId);
  if (error) throw error;
  const usuario = data?.user;
  if (canal === 'correo') {
    const valor = String(usuario?.email ?? '').trim() || null;
    return { valor, visible: enmascararCorreo(valor) };
  }
  const candidato = usuario?.phone ?? usuario?.user_metadata?.phone ?? usuario?.user_metadata?.telefono;
  const valor = celularValido(candidato);
  return { valor, visible: enmascararCelular(valor ?? candidato) };
}

function resultado(canal, proveedor, extra = {}) {
  return {
    canal,
    estado: 'fallido',
    aceptado: false,
    proveedor: proveedor?.nombre ?? null,
    destino: null,
    motivo: null,
    advertencia: null,
    idProveedor: null,
    consumo: { reservado: false, contado: false, liberado: false },
    ...extra,
  };
}

/**
 * Ejecuta la prueba. Devuelve el resultado de cada canal intentado y el estado global; no lanza
 * cuando un proveedor falla, porque esa información es precisamente lo que el panel debe mostrar.
 */
export async function enviarPruebaCanales({
  tenant,
  db,
  usuarioId,
  canal,
  ahora = new Date(),
  idPrueba = randomUUID(),
  proveedores,
  notificar80 = notificarAlerta80,
  tiempoMaximoMs,
} = {}) {
  const proveedoresDisponibles = proveedoresEfectivos(proveedores);
  const [{ data: filas, error: errorPreferencias }, { data: sede, error: errorSede }] = await Promise.all([
    tenant.listar('config_canales', 'canal, activo'),
    tenant.listar('establecimientos', 'nombre').maybeSingle(),
  ]);
  if (errorPreferencias) throw errorPreferencias;
  if (errorSede) throw errorSede;

  const preferencias = armarPreferenciasCanales(filas ?? [], { proveedores: proveedoresDisponibles });
  const porCanal = new Map(preferencias.map((item) => [item.canal, item]));
  const canalInicial = canal ?? preferencias.find((item) => item.activo && item.disponible)?.canal ?? 'correo';
  const orden = ordenDesde(canalInicial);
  const nombre = sede?.nombre ?? 'tu establecimiento';
  const asunto = `ZARU · Prueba de envío (${idPrueba.slice(0, 8)})`;
  const texto = [
    `Esta es una prueba real de notificación de ${nombre}.`,
    `Referencia: ${idPrueba}.`,
    'Si recibes este mensaje, el canal y su ruta de respaldo están funcionando.',
  ].join('\n');

  const resultados = [];
  for (const nombreCanal of orden) {
    const preferencia = porCanal.get(nombreCanal);
    const proveedor = proveedoresDisponibles[nombreCanal];
    if (!preferencia?.activo) {
      resultados.push(resultado(nombreCanal, proveedor, {
        estado: 'inactivo',
        motivo: `El canal ${nombreCanal} está desactivado en las preferencias de esta sede`,
      }));
      continue;
    }
    if (!preferencia.disponible || !proveedor || proveedor.configurado === false) {
      resultados.push(resultado(nombreCanal, proveedor, {
        estado: 'no_disponible',
        motivo: preferencia?.motivo ?? `El proveedor de ${nombreCanal} no está configurado`,
      }));
      continue;
    }

    let destino;
    try {
      destino = await destinoAdministrador(db, usuarioId, nombreCanal);
    } catch (error) {
      resultados.push(resultado(nombreCanal, proveedor, { motivo: `No se pudo consultar el destino: ${textoError(error)}` }));
      continue;
    }
    if (!destino.valor) {
      resultados.push(resultado(nombreCanal, proveedor, {
        estado: 'sin_destino',
        destino: destino.visible,
        motivo: MOTIVO_SIN_DESTINO[nombreCanal],
      }));
      continue;
    }

    const referencia = `prueba-${idPrueba}-${nombreCanal}`;
    let reserva;
    try {
      reserva = await reservarConsumo(tenant, { canal: nombreCanal, referencia, ahora });
    } catch (error) {
      resultados.push(resultado(nombreCanal, proveedor, {
        destino: destino.visible,
        motivo: `No se pudo reservar el consumo: ${textoError(error)}`,
      }));
      continue;
    }
    if (reserva?.degradado || reserva?.estado !== 'ok') {
      const sinCupo = reserva?.estado === 'sin_cupo';
      resultados.push(resultado(nombreCanal, proveedor, {
        estado: sinCupo ? 'sin_cupo' : 'fallido',
        destino: destino.visible,
        motivo: sinCupo
          ? `Cupo mensual de SMS agotado (${reserva.cantidad ?? 0}/${reserva.cupo ?? 0})`
          : 'No se pudo verificar el cupo antes del envío',
      }));
      continue;
    }

    try {
      const entrega = await conTiempoMaximo(
        Promise.resolve(proveedor.enviar({
          para: destino.valor,
          asunto,
          texto,
          referencia,
        })),
        tiempoMaximoMs,
      );
      const fila = resultado(nombreCanal, proveedor, {
        estado: 'enviado',
        aceptado: true,
        destino: destino.visible,
        idProveedor: entrega?.idProveedor ?? null,
        consumo: { reservado: true, contado: false, liberado: false },
      });

      try {
        const confirmacion = await confirmarConsumo(tenant, { canal: nombreCanal, referencia, ahora });
        fila.consumo.contado = confirmacion?.estado === 'ok' && !confirmacion?.degradado;
        if (!fila.consumo.contado) {
          fila.advertencia = 'El proveedor aceptó el mensaje, pero no se pudo registrar el consumo';
        } else if (confirmacion.alerta_80) {
          try {
            await notificar80(confirmacion.alerta_80);
          } catch (error) {
            fila.advertencia = `El consumo se registró, pero no se pudo enviar la alerta del 80 %: ${textoError(error)}`;
          }
        }
      } catch (error) {
        fila.advertencia = `El proveedor aceptó el mensaje, pero no se pudo registrar el consumo: ${textoError(error)}`;
      }

      resultados.push(fila);
      break;
    } catch (error) {
      let liberado = false;
      let advertencia = null;
      try {
        const respuesta = await liberarConsumo(tenant, { canal: nombreCanal, referencia, ahora });
        liberado = respuesta?.estado === 'ok' && !respuesta?.degradado;
      } catch (errorLiberacion) {
        advertencia = `No se pudo liberar la reserva: ${textoError(errorLiberacion)}`;
      }
      resultados.push(resultado(nombreCanal, proveedor, {
        destino: destino.visible,
        motivo: textoError(error),
        advertencia,
        consumo: { reservado: true, contado: false, liberado },
      }));
    }
  }

  const entregado = resultados.find((item) => item.estado === 'enviado');
  const sinCanales = resultados.length > 0
    && resultados.every((item) => ['inactivo', 'no_disponible', 'sin_destino'].includes(item.estado));
  return {
    id: idPrueba,
    mes: mesBogota(ahora),
    canalInicial,
    orden,
    estado: entregado ? 'entregado' : sinCanales ? 'sin_canales' : 'fallido',
    canalEntregado: entregado?.canal ?? null,
    resultados,
  };
}
