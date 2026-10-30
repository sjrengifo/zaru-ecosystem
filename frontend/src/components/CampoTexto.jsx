// Campo de formulario con etiqueta, ayuda y error asociados para lectores de pantalla.
import MensajeError from './MensajeError.jsx';

export default function CampoTexto({ id, etiqueta, obligatorio, ayuda, error, ...propsInput }) {
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;
  const idError = error ? `${id}-error` : undefined;

  return (
    <div className="campo">
      <label htmlFor={id}>
        {etiqueta}
        {obligatorio ? (
          <span className="obligatorio" aria-hidden="true"> *</span>
        ) : (
          <span className="texto-suave"> (opcional)</span>
        )}
      </label>
      {ayuda && <p id={idAyuda} className="campo-ayuda">{ayuda}</p>}
      <input
        id={id}
        aria-required={obligatorio}
        aria-invalid={!!error}
        aria-describedby={[idAyuda, idError].filter(Boolean).join(' ') || undefined}
        {...propsInput}
      />
      {error && <MensajeError id={idError}>{error}</MensajeError>}
    </div>
  );
}
