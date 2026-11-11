// Punto de entrada: valida la configuración y enciende el servidor.
import { validarEntorno } from './config/env.js';

let env;
try {
  env = validarEntorno();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const { default: app } = await import('./app.js');

// HU-34: la cola de notificaciones se procesa en el servidor, nunca en el frontend ni con las
// claves del proveedor expuestas. Se apaga con NOTIFICACIONES_WORKER=off.
let detenerWorker = null;
if (env.NOTIFICACIONES_WORKER !== 'off') {
  const { iniciarWorkerNotificaciones } = await import('./shared/workerNotificaciones.js');
  detenerWorker = iniciarWorkerNotificaciones();
}

const servidor = app.listen(env.PORT, () => {
  console.log(`API de Zaru corriendo en http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

for (const senal of ['SIGTERM', 'SIGINT']) {
  process.on(senal, () => {
    detenerWorker?.();
    servidor.close(() => process.exit(0));
  });
}
