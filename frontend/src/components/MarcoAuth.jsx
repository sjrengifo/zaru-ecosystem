// Marco común de las pantallas sin sesión (login, recuperar, restablecer, activar cuenta).
// A la izquierda la marca y lo que hace Zaru; a la derecha el formulario de cada pantalla.
import { ShieldCheck } from 'lucide-react';
import MarcaZaru from './MarcaZaru.jsx';

const PASOS = ['Recibido', 'En lavado', 'Listo', 'Entregado'];

export default function MarcoAuth({ children }) {
  return (
    <div className="login">
      <section className="login-marca" aria-label="Zaru">
        <div className="login-burbujas" aria-hidden="true">
          <span /><span /><span /><span /><span />
        </div>

        <MarcaZaru claro tamano={40} gota={false} />

        <div className="login-mensaje">
          <p className="login-titular">
            Cada carro, a tiempo y <em>reluciente</em>.
          </p>
          <p className="login-bajada">
            Controla el ingreso, el lavado y la entrega de cada vehículo en un solo tablero, en tiempo real.
          </p>
        </div>

        {/* Tarjeta de muestra: evoca el tablero sin usar datos reales. */}
        <div className="login-muestra" aria-hidden="true">
          <div className="login-muestra-cabecera">
            <span className="placa placa-grande">ZRU 024</span>
            <span className="estado-etiqueta estado-etiqueta-en_lavado">En lavado</span>
          </div>
          <ol className="login-muestra-pasos">
            {PASOS.map((paso, i) => (
              <li key={paso} className={i < 2 ? 'hecho' : ''}>{paso}</li>
            ))}
          </ol>
          <p className="login-muestra-nota">Lavado premium · listo en 18 min</p>
        </div>

        <p className="login-legal">
          <ShieldCheck size={16} aria-hidden="true" />
          Datos protegidos y cifrados · Ley 1581 de Habeas Data
        </p>
      </section>

      <div className="login-panel">{children}</div>
    </div>
  );
}
