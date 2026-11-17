// HU-27 — Detalle y condiciones de una promoción (ZARU-46 · RF-F5-10).
//
// /s/:slug/promociones/:id. Pública como el explorador de HU-26: no pide placa, celular ni pase.
//   CA1: al tocar la tarjeta de una promoción activa se abre esta vista ampliada con la descripción
//        completa y las condiciones de uso que configuró el establecimiento, el descuento, los servicios
//        incluidos y hasta cuándo es válida.
// Con el logo y los colores de la sede (HU-22). Si la promoción ya no está vigente, no es de la sede o el
// enlace está mal, la API responde 404 y se muestra un mensaje amable con el regreso a las promociones.
// Las secciones sin datos (descripción, condiciones, servicios) no se muestran: no quedan huecos.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, Info, ListChecks, Tag } from 'lucide-react';
import Cargando from '../components/Cargando.jsx';
import MarcaZaru from '../components/MarcaZaru.jsx';
import { EncabezadoSede, estiloMarca } from '../components/MarcaSedeCliente.jsx';
import { listarPromociones, obtenerPromocion } from '../services/promocionesCliente.js';
import { textoDescuento, validaHasta } from '../lib/promocionesCliente.js';
import '../styles/seguimiento.css';
import '../styles/acceso-cliente.css';
import '../styles/historial-cliente.css';
import '../styles/promociones-cliente.css';

/**
 * Carga el detalle. Si la promoción no está disponible (404), pide la lista solo para conocer la marca de
 * la sede y distinguir "promoción no disponible" de "sede no disponible".
 */
async function cargarDetalle(slug, id) {
  try {
    const { sede, promocion } = await obtenerPromocion(slug, id);
    return { sede, promocion, noDisponible: null };
  } catch (error) {
    if (error.status !== 404) throw error;
    try {
      const { sede } = await listarPromociones(slug);
      return { sede, promocion: null, noDisponible: 'promocion' };
    } catch (errorSede) {
      if (errorSede.status === 404) return { sede: null, promocion: null, noDisponible: 'sede' };
      return { sede: null, promocion: null, noDisponible: 'promocion' };
    }
  }
}

function VolverAPromociones({ to }) {
  return (
    <Link className="historial-volver promo-detalle-volver" to={to}>
      <ArrowLeft size={16} aria-hidden="true" /> Volver a promociones
    </Link>
  );
}

export default function PromocionDetalleCliente() {
  const { slug, id } = useParams();
  const [estado, setEstado] = useState({ cargando: true, sede: null, promocion: null, noDisponible: null, error: null });
  const [recargas, setRecargas] = useState(0);

  useEffect(() => {
    let vigente = true;
    setEstado((actual) => ({ ...actual, cargando: true, error: null }));
    cargarDetalle(slug, id)
      .then((datos) => vigente && setEstado({ cargando: false, error: null, ...datos }))
      .catch((error) => vigente && setEstado({ cargando: false, sede: null, promocion: null, noDisponible: null, error }));
    return () => {
      vigente = false;
    };
  }, [slug, id, recargas]);

  useEffect(() => {
    if (estado.promocion?.nombre && estado.sede?.nombre) document.title = `${estado.promocion.nombre} · ${estado.sede.nombre}`;
  }, [estado.promocion, estado.sede]);

  const { cargando, sede, promocion, noDisponible, error } = estado;
  const listaPromociones = `/s/${encodeURIComponent(slug)}/promociones`;

  return (
    <main className="seguimiento historial-cliente promociones-cliente" style={estiloMarca(sede)}>
      <div className="seg-contenido">
        <EncabezadoSede sede={sede} />

        {cargando && !promocion && !noDisponible ? (
          <Cargando texto="Cargando promoción…" className="seg-cargando" />
        ) : noDisponible === 'sede' ? (
          <section className="seg-tarjeta seg-vacio">
            <h1>Este enlace no está disponible</h1>
            <p>No encontramos un car wash activo con esta dirección. Revisa el enlace o el código QR que te dieron.</p>
          </section>
        ) : noDisponible === 'promocion' ? (
          <section className="seg-tarjeta seg-vacio promo-detalle-no-disponible">
            <Tag size={28} aria-hidden="true" />
            <h1>Esta promoción ya no está disponible</h1>
            <p>
              Puede que haya terminado o que el car wash la haya retirado.
              {sede?.nombre ? ` Mira las promociones vigentes de ${sede.nombre}.` : ' Mira las promociones vigentes.'}
            </p>
            <VolverAPromociones to={listaPromociones} />
          </section>
        ) : error ? (
          <section className="seg-tarjeta seg-vacio">
            <h1>No pudimos cargar la promoción</h1>
            <p>Revisa tu conexión a internet e inténtalo de nuevo.</p>
            <button type="button" className="boton" onClick={() => setRecargas((n) => n + 1)}>Reintentar</button>
          </section>
        ) : (
          <article className="seg-tarjeta promo-detalle" aria-labelledby="promo-detalle-titulo">
            <VolverAPromociones to={listaPromociones} />

            <div className="promo-detalle-cabecera">
              <span className="promo-descuento promo-detalle-descuento">
                <span className="promo-descuento-valor">{textoDescuento(promocion.descuentoPct)}</span>
                <span className="promo-descuento-texto">de descuento</span>
              </span>
              <div className="promo-detalle-titulos">
                <h1 id="promo-detalle-titulo" className="historial-titulo">{promocion.nombre}</h1>
                <p className="promo-vigencia promo-detalle-vigencia">
                  <CalendarClock size={16} aria-hidden="true" />
                  <time dateTime={promocion.fechaFin}>{validaHasta(promocion.fechaFin)}</time>
                </p>
              </div>
            </div>

            {promocion.descripcion && <p className="promo-detalle-descripcion">{promocion.descripcion}</p>}

            {promocion.servicios?.length > 0 && (
              <section className="promo-detalle-seccion" aria-labelledby="promo-detalle-servicios">
                <h2 id="promo-detalle-servicios" className="promo-detalle-subtitulo">Servicios incluidos</h2>
                <ul className="promo-servicios promo-detalle-servicios">
                  {promocion.servicios.map((nombre) => (
                    <li key={nombre} className="promo-servicio">{nombre}</li>
                  ))}
                </ul>
              </section>
            )}

            {promocion.condiciones && (
              <section className="promo-detalle-seccion promo-detalle-condiciones" aria-labelledby="promo-detalle-condiciones">
                <h2 id="promo-detalle-condiciones" className="promo-detalle-subtitulo">
                  <ListChecks size={16} aria-hidden="true" /> Condiciones de uso
                </h2>
                <p>{promocion.condiciones}</p>
              </section>
            )}

            <p className="promo-pie">
              <Info size={14} aria-hidden="true" /> Muestra esta promoción en {sede.nombre} al registrar tu vehículo; el descuento se aplica en los servicios incluidos.
            </p>
          </article>
        )}
      </div>

      <footer className="seg-pie">
        Con tecnología de <MarcaZaru tamano={16} gota={false} />
      </footer>
    </main>
  );
}
