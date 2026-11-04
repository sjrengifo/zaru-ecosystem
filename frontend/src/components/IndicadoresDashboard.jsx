// HU-09 CA3 — Indicadores del día.
// "Vehículos atendidos" usa `entregada_at` (la entrega real) y "Vehículos
// ingresados" usa `created_at` (la hora de ingreso). Ambos son conteos de
// vehículos, no de dinero: HU-09 no mide recaudo.
export default function IndicadoresDashboard({
  atendidos,
  ingresados,
  cargando,
  actualizando,
}) {
  return (
    <div className="indicadores" aria-busy={cargando || actualizando}>
      <article className="tarjeta indicador">
        <p className="indicador-titulo">Vehículos atendidos hoy</p>
        <p className="indicador-valor">{cargando ? '—' : atendidos}</p>
        <p className="indicador-nota">
          Órdenes entregadas hoy, según la hora real de entrega registrada.
        </p>
      </article>

      <article className="tarjeta indicador">
        <p className="indicador-titulo">Vehículos ingresados hoy</p>
        <p className="indicador-valor">{cargando ? '—' : ingresados}</p>
        <p className="indicador-nota">
          Órdenes registradas hoy en el establecimiento, según su hora de ingreso.
        </p>
      </article>
    </div>
  );
}
