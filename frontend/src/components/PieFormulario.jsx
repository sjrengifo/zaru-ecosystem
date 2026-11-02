// Acciones fijas de un formulario en modal, con la confirmación para no perder lo escrito.
export default function PieFormulario({ textoGuardar, textoDescarte, confirmando, enviando, deshabilitado, onCancelar, onSeguirEditando, onDescartar }) {
  if (confirmando) {
    return (
      <div className="modal-acciones modal-acciones-confirmar" role="alertdialog" aria-label="Confirmar descarte">
        <p>{textoDescarte}</p>
        <div>
          <button type="button" className="boton secundario" autoFocus onClick={onSeguirEditando}>
            Seguir editando
          </button>
          <button type="button" className="boton peligro" onClick={onDescartar}>
            Descartar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-acciones">
      <button type="button" className="boton secundario" onClick={onCancelar}>
        Cancelar
      </button>
      <button className="boton" disabled={enviando || deshabilitado}>
        {enviando ? 'Guardando…' : textoGuardar}
      </button>
    </div>
  );
}
