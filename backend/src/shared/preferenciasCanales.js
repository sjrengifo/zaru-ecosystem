// HU-31/HU-39 — Preferencia de canales para la prueba de envío.
//
// Estos interruptores NO son un bloqueo operativo: los avisos de la sede siguen usando el fallback
// push → SMS → correo (HU-33) y correo/push nunca impiden un aviso (HU-39). La preferencia solo decide
// qué canales se ofrecen y se prueban desde el panel.
//
// Una sede sin filas tiene todos los canales activos: la migración siembra la tabla, pero un dato
// faltante no debe dejar la prueba sin canales.
import { CANALES } from './consumo.js';
import { crearProveedorCorreo } from './correo.js';
import { proveedorSms } from './proveedorSms.js';
import { proveedorPush } from './proveedorPush.js';

export const CANALES_PREFERENCIA = CANALES;

export const ETIQUETA_CANAL = Object.freeze({
  sms: 'SMS',
  correo: 'Correo',
  push: 'Push',
});

/** Proveedores reales del ambiente. Se inyectan en las pruebas para no depender de variables de entorno. */
export function proveedoresDeCanales() {
  const correo = crearProveedorCorreo();
  return {
    correo: { ...correo, configurado: true },
    sms: proveedorSms(),
    push: proveedorPush(),
  };
}

const MOTIVO_NO_DISPONIBLE = {
  sms: 'El proveedor de SMS no está configurado en este ambiente',
  correo: null,
  push: 'El canal push está pendiente de HU-40',
};

/** Combina lo guardado con los tres canales, dejando visible si el proveedor existe. */
export function armarPreferenciasCanales(filas = [], { proveedores = proveedoresDeCanales() } = {}) {
  const guardados = new Map(filas.map((fila) => [fila.canal, fila.activo]));
  return CANALES_PREFERENCIA.map((canal) => {
    const proveedor = proveedores[canal];
    const disponible = proveedor?.configurado !== false;
    return {
      canal,
      etiqueta: ETIQUETA_CANAL[canal],
      activo: guardados.get(canal) ?? true,
      disponible,
      proveedor: proveedor?.nombre ?? null,
      motivo: disponible ? null : MOTIVO_NO_DISPONIBLE[canal],
    };
  });
}
