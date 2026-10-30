// Ventana modal. Usa <dialog> del navegador, que mantiene el foco dentro.
// Esc y la X llaman a onCerrar, y quien usa el modal decide si se cierra (p. ej. para no perder datos).
import { useEffect, useRef } from 'react';

export default function Modal({ titulo, onCerrar, children }) {
  const dialogo = useRef(null);
  const focoAnterior = useRef(document.activeElement);

  useEffect(() => {
    if (!dialogo.current.open) dialogo.current.showModal();
    // showModal enfocaría la X; el foco inicial lo marca cada contenido con data-foco-inicial.
    dialogo.current.querySelector('[data-foco-inicial]')?.focus();
    // Al cerrar, el foco vuelve al elemento que abrió el modal.
    return () => focoAnterior.current?.focus?.();
  }, []);

  // Esc llega como `cancel` aunque el foco esté fuera de los controles.
  function alCancelar(e) {
    e.preventDefault();
    e.stopPropagation(); // Con un modal dentro de otro, React propaga el evento y cerraría también el de afuera.
    onCerrar();
  }

  // Algunos navegadores cierran con un segundo Esc aunque se cancele: mientras el modal
  // siga montado se reabre, y solo el padre decide si desaparece.
  function alCerrarseSolo(e) {
    e.stopPropagation();
    dialogo.current.showModal();
    onCerrar();
  }

  return (
    <dialog ref={dialogo} className="modal" aria-labelledby="modal-titulo" onCancel={alCancelar} onClose={alCerrarseSolo}>
      <header className="modal-encabezado">
        <h3 id="modal-titulo">{titulo}</h3>
        <button type="button" className="boton-icono" aria-label="Cerrar" onClick={onCerrar}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
