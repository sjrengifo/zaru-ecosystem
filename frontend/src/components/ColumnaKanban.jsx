// HU-09 CA1 — Una columna del tablero con su estado vacío propio.
import TarjetaOrden from './TarjetaOrden.jsx';

export default function ColumnaKanban({ columna, ordenes, onAvanzar, avanzando, ahora }) {
  const tituloId = `columna-${columna.id}`;

  return (
    <section className={`columna columna-${columna.id}`} aria-labelledby={tituloId}>
      <header className="columna-encabezado">
        <h3 id={tituloId} className="columna-titulo">
          {columna.titulo}
        </h3>
        <span
          className="columna-cuenta"
          aria-label={`${ordenes.length} ${ordenes.length === 1 ? 'vehículo' : 'vehículos'}`}
        >
          {ordenes.length}
        </span>
      </header>

      {ordenes.length === 0 ? (
        <p className="columna-vacia">Sin vehículos en este estado.</p>
      ) : (
        <div className="columna-tarjetas">
          {ordenes.map((orden) => (
            <TarjetaOrden
              key={orden.id}
              orden={orden}
              onAvanzar={onAvanzar}
              avanzando={avanzando}
              ahora={ahora}
            />
          ))}
        </div>
      )}
    </section>
  );
}
