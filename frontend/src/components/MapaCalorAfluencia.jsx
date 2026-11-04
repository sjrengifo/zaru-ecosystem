// HU-16 CA2 — Mapa de calor de afluencia: 7 días por 12 franjas de dos horas.
// Se construye con una tabla HTML y colores CSS; no necesita librerías de gráficos.
import { nivelCalor, totalColumna, totalFila } from '../lib/reportes.js';

const NIVELES = [0, 1, 2, 3, 4, 5];

export default function MapaCalorAfluencia({ reporte }) {
  const { matriz = [], dias = [], franjas = [], totalVehiculos = 0 } = reporte ?? {};
  const maximo = matriz.reduce(
    (mayor, fila) => fila.reduce((maximoFila, valor) => Math.max(maximoFila, Number(valor) || 0), mayor),
    0,
  );

  return (
    <section className="tarjeta reporte-panel reporte-mapa" aria-labelledby="mapa-afluencia">
      <div className="reporte-panel-encabezado">
        <div>
          <h3 id="mapa-afluencia">Afluencia por día y franja horaria</h3>
          <p className="reporte-panel-descripcion">
            Cada celda cuenta los vehículos que ingresaron en esa franja, en hora de Bogotá.
            Un mismo vehículo que vuelve cuenta como una visita nueva.
          </p>
        </div>
        <p className="reporte-total">
          <strong>{totalVehiculos}</strong> {totalVehiculos === 1 ? 'vehículo' : 'vehículos'}
        </p>
      </div>

      <div className="mapa-calor-contenedor">
        <table className="mapa-calor">
          <caption className="texto-suave">Vehículos ingresados por día de la semana y franja de dos horas.</caption>
          <thead>
            <tr>
              <th scope="col">Día</th>
              {franjas.map((franja) => (
                <th key={franja} scope="col">{franja}</th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {matriz.map((fila, indiceDia) => (
              <tr key={dias[indiceDia] ?? indiceDia}>
                <th scope="row">{dias[indiceDia] ?? `Día ${indiceDia + 1}`}</th>
                {fila.map((valor, indiceFranja) => (
                  <td key={`${indiceDia}-${indiceFranja}`}>
                    <span
                      className={`mapa-calor-celda nivel-${nivelCalor(valor, maximo)}`}
                      title={`${dias[indiceDia] ?? 'Día'}, ${franjas[indiceFranja] ?? 'franja'}: ${valor} vehículo(s)`}
                    >
                      {valor}
                    </span>
                  </td>
                ))}
                <td><strong>{totalFila(fila)}</strong></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              {franjas.map((franja, indice) => (
                <td key={franja}><strong>{totalColumna(matriz, indice)}</strong></td>
              ))}
              <td><strong>{totalVehiculos}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mapa-calor-leyenda">
        <span>Menos</span>
        {NIVELES.map((nivel) => (
          <span key={nivel} className={`mapa-calor-celda nivel-${nivel}`} aria-hidden="true" />
        ))}
        <span>Más</span>
      </p>
    </section>
  );
}
