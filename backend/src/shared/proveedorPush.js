// HU-33 · Canal push con la misma interfaz que el correo y el SMS:
//   enviar({ para, asunto, texto, referencia }) → { idProveedor }
//
// El registro del dispositivo y el envío con Web Push son de HU-40. Mientras no exista, el canal
// push responde con un error permanente: el aviso no se queda reintentando un canal que no existe
// y pasa de inmediato al canal alterno (HU-33 CA2). Cuando HU-40 conecte el proveedor real, los
// reintentos de 1, 2 y 4 minutos (CA1) aplican igual que en los demás canales.

export function proveedorPush(env = process.env) {
  const tipo = String(env.PUSH_PROVEEDOR ?? 'no_configurado').toLowerCase();
  return {
    nombre: tipo,
    configurado: false,
    async enviar() {
      const error = new Error('El canal push no está configurado en este ambiente (HU-40)');
      error.recuperable = false;
      throw error;
    },
  };
}
