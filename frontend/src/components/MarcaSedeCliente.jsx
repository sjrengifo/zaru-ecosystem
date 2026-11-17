// HU-26 / HU-27 — Marca de la sede en las páginas públicas de promociones del cliente final (patrón HU-22):
// los colores de la sede como variables CSS y el encabezado con su logo, o su nombre si no tiene logo.
import MarcaZaru from './MarcaZaru.jsx';

const COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;

/** Colores de la sede como variables CSS; un color inválido se ignora y queda el de Zaru. */
export function estiloMarca(sede) {
  const estilo = {};
  if (COLOR_HEX.test(sede?.colorPrimario ?? '')) estilo['--color-primario'] = sede.colorPrimario;
  if (COLOR_HEX.test(sede?.colorSecundario ?? '')) estilo['--color-secundario'] = sede.colorSecundario;
  return estilo;
}

/** Encabezado con el logo de la sede, su nombre o, mientras carga, la marca de Zaru. */
export function EncabezadoSede({ sede }) {
  return (
    <header className="seg-encabezado">
      {sede?.logoUrl ? (
        <img className="seg-logo" src={sede.logoUrl} alt={sede.nombre} />
      ) : sede?.nombre ? (
        <span className="seg-sede">{sede.nombre}</span>
      ) : (
        <MarcaZaru tamano={28} gota={false} />
      )}
    </header>
  );
}
