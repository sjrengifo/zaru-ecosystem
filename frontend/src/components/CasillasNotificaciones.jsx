// HU-30 CA1 — Dos autorizaciones separadas, desmarcadas por defecto, con enlace a la política.
//
// Se usan al registrar un cliente (FormularioCliente) y al registrar un ingreso con cliente nuevo
// (FormularioIngreso). Son opcionales: el registro sigue sin ellas, pero sin la casilla de
// promociones el cliente nunca entra en una campaña (CA2).
import { ExternalLink } from 'lucide-react';

export const AUTORIZACIONES_INICIALES = Object.freeze({ notificaciones: false, comerciales: false });

const CASILLAS = [
  {
    clave: 'notificaciones',
    texto: 'Avisos del servicio: recibir por correo cuándo ingresa y cuándo está listo su vehículo.',
  },
  {
    clave: 'comerciales',
    texto: 'Promociones: recibir ofertas y campañas del establecimiento.',
  },
];

export default function CasillasNotificaciones({ prefijo, valores, onCambio, deshabilitado = false, politicaVersion }) {
  return (
    <fieldset className="autorizaciones-notificaciones">
      <legend>
        Comunicaciones <span className="texto-suave">(opcional)</span>
      </legend>
      <p className="texto-suave">
        Cada autorización es independiente y el cliente la puede retirar cuando quiera.{' '}
        <a href="/politica-datos" target="_blank" rel="noopener noreferrer" className="enlace-politica">
          Ver la política de tratamiento de datos{politicaVersion ? ` (versión ${politicaVersion})` : ''}
          <ExternalLink size={14} aria-hidden="true" />
          <span className="solo-lectores"> (se abre en otra pestaña)</span>
        </a>
      </p>
      {CASILLAS.map(({ clave, texto }) => (
        <div className="casilla" key={clave}>
          <input
            id={`${prefijo}-${clave}`}
            type="checkbox"
            checked={valores[clave]}
            disabled={deshabilitado}
            onChange={(e) => onCambio({ ...valores, [clave]: e.target.checked })}
          />
          <label htmlFor={`${prefijo}-${clave}`}>{texto}</label>
        </div>
      ))}
    </fieldset>
  );
}

/** Campos que espera la API (POST /clientes y nuevoVehiculo.cliente en POST /ordenes). */
export const camposAutorizacion = (valores) => ({
  autorizaNotificaciones: valores.notificaciones === true,
  autorizaComerciales: valores.comerciales === true,
});
