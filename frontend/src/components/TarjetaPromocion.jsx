// HU-26 — Tarjeta de una promoción vigente en el explorador del cliente final.
//
// Lista para HU-27 (detalle de la promoción): si recibe `enlace` (p. ej. `/s/{slug}/promociones/{id}`),
// toda la tarjeta se vuelve un Link; sin `enlace` es un <article> sin interacción.
import { Link } from 'react-router-dom';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { textoDescuento, validaHasta } from '../lib/promocionesCliente.js';

export default function TarjetaPromocion({ promocion, enlace }) {
  const idTitulo = `promo-${promocion.id}`;
  const contenido = (
    <>
      <span className="promo-descuento" aria-hidden="true">
        <span className="promo-descuento-valor">{textoDescuento(promocion.descuentoPct)}</span>
        <span className="promo-descuento-texto">dto.</span>
      </span>
      <span className="promo-cuerpo">
        <span id={idTitulo} className="promo-nombre">{promocion.nombre}</span>
        <span className="solo-lectores">{`, ${textoDescuento(promocion.descuentoPct)} de descuento`}</span>
        {promocion.descripcion && <span className="promo-descripcion">{promocion.descripcion}</span>}
        {promocion.servicios?.length > 0 && (
          <span className="promo-servicios">
            {promocion.servicios.map((nombre) => (
              <span key={nombre} className="promo-servicio">{nombre}</span>
            ))}
          </span>
        )}
        <span className="promo-vigencia">
          <CalendarClock size={14} aria-hidden="true" />
          <time dateTime={promocion.fechaFin}>{validaHasta(promocion.fechaFin)}</time>
        </span>
      </span>
      {enlace && <ChevronRight className="promo-flecha" size={18} aria-hidden="true" />}
    </>
  );

  return (
    <li className="promo-item">
      {enlace ? (
        <Link className="promo-tarjeta promo-tarjeta-enlace" to={enlace}>
          {contenido}
        </Link>
      ) : (
        <article className="promo-tarjeta" aria-labelledby={idTitulo}>
          {contenido}
        </article>
      )}
    </li>
  );
}
