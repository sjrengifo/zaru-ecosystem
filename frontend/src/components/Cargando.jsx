// Indicador de carga común: el círculo girando y un texto, centrados en el espacio que ocupan.
// `pantalla` lo centra en toda la ventana (primera carga de la sesión).
export default function Cargando({ texto = 'Cargando…', pantalla = false, className = '' }) {
  return (
    <div className={`cargando${pantalla ? ' cargando-pantalla' : ''}${className ? ` ${className}` : ''}`} role="status" aria-live="polite">
      <span className="spinner spinner-oscuro" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  );
}
