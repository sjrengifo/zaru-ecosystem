// HU-16 CA1 — Ranking de servicios por órdenes e ingresos.
// Las dos barras usan escalas independientes: una orden puede ser poca cantidad
// pero muchos ingresos, y cada métrica se entiende mejor con su propio máximo.
import { formatoMoneda } from '../lib/formato.js';
import { anchoBarra, maximoDe } from '../lib/reportes.js';

function ListaRanking({ id, titulo, descripcion, elementos, campo, maximo, formatear, claseBarra }) {
  return (
    <section className="tarjeta reporte-panel" aria-labelledby={id}>
      <div>
        <h3 id={id}>{titulo}</h3>
        <p className="reporte-panel-descripcion">{descripcion}</p>
      </div>

      {elementos.length === 0 ? (
        <p className="texto-suave">No se registraron servicios en este periodo.</p>
      ) : (
        <ol className="ranking" aria-label={titulo}>
          {elementos.map((elemento, indice) => {
            const valor = Number(elemento[campo]) || 0;
            return (
              <li key={elemento.servicioId} className="ranking-item">
                <div className="ranking-fila">
                  <span className="ranking-puesto" aria-hidden="true">{indice + 1}</span>
                  <span className="ranking-nombre">{elemento.nombre}</span>
                  <span className="ranking-valor">{formatear(valor)}</span>
                </div>
                <div className={`ranking-barra ${claseBarra}`} aria-hidden="true">
                  <span style={{ width: anchoBarra(valor, maximo) }} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export default function RankingServicios({ servicios = [], totalOrdenes = 0 }) {
  const maxOrdenes = maximoDe(servicios, 'ordenes');
  const maxIngresos = maximoDe(servicios, 'ingresos');
  // La API entrega el ranking por órdenes; el panel de dinero se ordena por ingresos.
  const porIngresos = [...servicios].sort(
    (a, b) => (Number(b.ingresos) || 0) - (Number(a.ingresos) || 0)
      || (Number(b.ordenes) || 0) - (Number(a.ordenes) || 0)
      || a.nombre.localeCompare(b.nombre, 'es'),
  );

  return (
    <div className="reporte-ranking">
      <ListaRanking
        id="ranking-ordenes"
        titulo="Servicios más solicitados"
        descripcion="Cantidad de órdenes que incluyen cada servicio en el periodo."
        elementos={servicios}
        campo="ordenes"
        maximo={maxOrdenes}
        formatear={(valor) => `${valor} ${valor === 1 ? 'orden' : 'órdenes'}`}
        claseBarra="ordenes"
      />
      <ListaRanking
        id="ranking-ingresos"
        titulo="Servicios con más ingresos"
        descripcion={`Ingresos históricos por servicio (precio menos descuento guardados en cada orden). Total del periodo: ${formatoMoneda(
          servicios.reduce((total, servicio) => total + (Number(servicio.ingresos) || 0), 0),
        )}.`}
        elementos={porIngresos}
        campo="ingresos"
        maximo={maxIngresos}
        formatear={formatoMoneda}
        claseBarra="ingresos"
      />
      <p className="texto-suave reporte-ranking-nota">
        {totalOrdenes} {totalOrdenes === 1 ? 'orden registrada' : 'órdenes registradas'} en el periodo.
        Una orden con varios servicios cuenta una vez en cada servicio.
      </p>
    </div>
  );
}
