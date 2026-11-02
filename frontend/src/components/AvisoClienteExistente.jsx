// HU-03 CA3, HU-04 y HU-05 CA2: el dato ya pertenece a otro cliente; se ofrece abrirlo.
export default function AvisoClienteExistente({ titulo = 'Este cliente ya existe', mensaje, textoAccion = 'Abrir cliente existente', onAbrir }) {
  return (
    <div className="tarjeta-duplicado" role="alert">
      <span className="tarjeta-duplicado-icono" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      </span>
      <div className="tarjeta-duplicado-texto">
        <p className="tarjeta-duplicado-titulo">{titulo}</p>
        <p>{mensaje}.</p>
        <button type="button" className="boton-duplicado" data-foco-error onClick={onAbrir}>
          {textoAccion} <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
