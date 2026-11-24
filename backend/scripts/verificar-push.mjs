// Verifica que el ambiente tenga Web Push configurado sin imprimir la llave privada.
// Uso: npm run verificar:push
import { clavePublicaPush, proveedorPush, pushConfigurado } from '../src/shared/proveedorPush.js';

const configurado = pushConfigurado();
const publicaDisponible = Boolean(clavePublicaPush());
const proveedor = proveedorPush();

console.log(`pushConfigurado=${configurado}`);
console.log(`clavePublicaDisponible=${publicaDisponible}`);
console.log(`proveedor=${proveedor.nombre}`);
console.log(`subject=${process.env.VAPID_SUBJECT ?? '(sin definir)'}`);

if (!configurado || !publicaDisponible) {
  console.error(
    '\nWeb Push no está listo. Defina PUSH_PROVEEDOR=webpush, VAPID_PUBLIC_KEY, '
    + 'VAPID_PRIVATE_KEY y VAPID_SUBJECT (https://… o mailto:…). Vea docs/despliegue/configurar-web-push.md',
  );
  process.exit(1);
}
