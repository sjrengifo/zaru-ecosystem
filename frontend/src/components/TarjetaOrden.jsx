// HU-09 CA1 — Tarjeta de un vehículo en el tablero.
// Muestra los datos obligatorios (placa, servicio, hora de ingreso y estado) y
// conserva la acción de HU-10 para avanzar la orden al siguiente estado.
import { formatoMoneda } from '../lib/formato.js';
import {
  ESTADOS_ORDEN,
  SIGUIENTE_ESTADO,
  horaBogota,
  nombresServicios,
} from '../lib/dashboard.js';

export default function TarjetaOrden({ orden, onAvanzar, avanzando }) {
  const placa = orden.vehiculos?.placa ?? 'Sin placa';
  const estado = ESTADOS_ORDEN[orden.estado] ?? orden.estado;
  const siguiente = SIGUIENTE_ESTADO[orden.estado];

  return (
    <article
      className={`tarjeta tarjeta-vehiculo tarjeta-vehiculo-${orden.estado}`}
      aria-label={`Orden del vehículo ${placa}, estado ${estado}`}
    >
      <div className="tarjeta-vehiculo-encabezado">
        <span className="placa">{placa}</span>
        <span className={`estado-etiqueta estado-etiqueta-${orden.estado}`}>{estado}</span>
      </div>

      <dl className="tarjeta-vehiculo-datos">
        <div>
          <dt>Servicio</dt>
          <dd>{nombresServicios(orden)}</dd>
        </div>
        <div>
          <dt>Ingreso</dt>
          <dd>{horaBogota(orden.created_at)}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{formatoMoneda(orden.total)}</dd>
        </div>
        {orden.codigo_seguimiento && (
          <div>
            <dt>Código</dt>
            <dd>{orden.codigo_seguimiento}</dd>
          </div>
        )}
        {orden.estado === 'entregado' && orden.entregada_at ? (
          <div>
            <dt>Entregado</dt>
            <dd>{horaBogota(orden.entregada_at)}</dd>
          </div>
        ) : (
          orden.entrega_estimada_at && (
            <div>
              <dt>Entrega estimada</dt>
              <dd>{horaBogota(orden.entrega_estimada_at)}</dd>
            </div>
          )
        )}
      </dl>

      {siguiente && (
        <button
          type="button"
          className="boton tarjeta-vehiculo-accion"
          onClick={() => onAvanzar(orden)}
          disabled={avanzando !== null}
          aria-busy={avanzando === orden.id}
        >
          {avanzando === orden.id ? 'Guardando…' : `Avanzar a ${ESTADOS_ORDEN[siguiente]}`}
        </button>
      )}
    </article>
  );
}
