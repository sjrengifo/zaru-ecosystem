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

app.listen(env.PORT, () => {
  console.log(`API de Zaru corriendo en http://localhost:${env.PORT} (${env.NODE_ENV})`);
});
