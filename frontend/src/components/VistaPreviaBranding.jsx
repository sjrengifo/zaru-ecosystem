// HU-13 CA1 · Simulación del seguimiento que verá el cliente final, con el branding elegido.
// Es solo visual: los datos del vehículo son de ejemplo. La vista real del cliente es la HU-18.
const PASOS = ['Recibido', 'En lavado', 'Listo', 'Entregado'];
const PASO_ACTUAL = 1;

export default function VistaPreviaBranding({ nombre, logoUrl, colorPrimario, colorSecundario, sinGuardar }) {
  return (
    <aside className="vista-previa" aria-label="Vista previa del seguimiento del cliente">
      <div className="vista-previa-titulo">
        <h3>Vista previa</h3>
        {sinGuardar && <span className="etiqueta-sin-guardar">Sin guardar</span>}
      </div>

      <div className="vista-previa-pantalla" style={{ '--marca-primario': colorPrimario, '--marca-secundario': colorSecundario }}>
        <header className="vista-previa-encabezado">
          {logoUrl ? <img src={logoUrl} alt={`Logo de ${nombre}`} /> : <span className="vista-previa-inicial" aria-hidden="true">{nombre?.[0]}</span>}
          <span>{nombre}</span>
        </header>

        <div className="vista-previa-cuerpo">
          <p className="texto-suave">Tu vehículo</p>
          <p>
            <span className="placa">ABC123</span>
          </p>
          <ol className="vista-previa-pasos">
            {PASOS.map((paso, i) => (
              <li key={paso} className={i <= PASO_ACTUAL ? 'hecho' : undefined} aria-current={i === PASO_ACTUAL ? 'step' : undefined}>
                {paso}
              </li>
            ))}
          </ol>
          <button type="button" className="vista-previa-boton" tabIndex={-1}>
            Ver promociones
          </button>
        </div>
      </div>
    </aside>
  );
}
