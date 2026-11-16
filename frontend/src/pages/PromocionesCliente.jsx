// HU-26 — Explorador de promociones activas de la sede (ZARU-45 · RF-F5-09).
//
// /s/:slug/promociones. Página pública: no pide placa, celular ni pase (las promociones no son datos
// personales) y no usa la sesión del panel.
//   CA1: muestra solo las promociones vigentes hoy de la sede (las decide la API con la vista de HU-12).
//   CA2: pide únicamente las del slug del enlace; la API nunca devuelve las de otra sede.
//   CA3: se presenta con el logo y los colores de la sede, igual que el resto de la app (HU-22).
// El detalle de cada promoción es HU-27: la tarjeta ya acepta un `enlace` para abrirlo.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Info, Tag } from 'lucide-react';
import Cargando from '../components/Cargando.jsx';
import MarcaZaru from '../components/MarcaZaru.jsx';
import TarjetaPromocion from '../components/TarjetaPromocion.jsx';
import { listarPromociones } from '../services/promocionesCliente.js';
import '../styles/seguimiento.css';
import '../styles/acceso-cliente.css';
import '../styles/historial-cliente.css';
import '../styles/promociones-cliente.css';

const COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;

/** Colores de la sede como variables CSS, igual que en las demás páginas del cliente (HU-22). */
function estiloMarca(sede) {
  const estilo = {};
  if (COLOR_HEX.test(sede?.colorPrimario ?? '')) estilo['--color-primario'] = sede.colorPrimario;
  if (COLOR_HEX.test(sede?.colorSecundario ?? '')) estilo['--color-secundario'] = sede.colorSecundario;
  return estilo;
}

function Encabezado({ sede }) {
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

export default function PromocionesCliente() {
  const { slug } = useParams();
  const [estado, setEstado] = useState({ cargando: true, sede: null, promociones: [], error: null });
  const [recargas, setRecargas] = useState(0);

  useEffect(() => {
    let vigente = true;
    setEstado((actual) => ({ ...actual, cargando: true, error: null }));
    listarPromociones(slug)
      .then(({ sede, promociones }) => vigente && setEstado({ cargando: false, sede, promociones: promociones ?? [], error: null }))
      .catch((error) => vigente && setEstado({ cargando: false, sede: null, promociones: [], error }));
    return () => {
      vigente = false;
    };
  }, [slug, recargas]);

  useEffect(() => {
    if (estado.sede?.nombre) document.title = `${estado.sede.nombre} · Promociones`;
  }, [estado.sede]);

  const { cargando, sede, promociones, error } = estado;
  const inicio = `/s/${encodeURIComponent(slug)}`;

  return (
    <main className="seguimiento historial-cliente promociones-cliente" style={estiloMarca(sede)}>
      <div className="seg-contenido">
        <Encabezado sede={sede} />

        {cargando && !sede ? (
          <Cargando texto="Cargando promociones…" className="seg-cargando" />
        ) : error?.status === 404 ? (
          <section className="seg-tarjeta seg-vacio">
            <h1>Este enlace no está disponible</h1>
            <p>No encontramos un car wash activo con esta dirección. Revisa el enlace o el código QR que te dieron.</p>
          </section>
        ) : error ? (
          <section className="seg-tarjeta seg-vacio">
            <h1>No pudimos cargar las promociones</h1>
            <p>Revisa tu conexión a internet e inténtalo de nuevo.</p>
            <button type="button" className="boton" onClick={() => setRecargas((n) => n + 1)}>Reintentar</button>
          </section>
        ) : (
          <section className="seg-tarjeta historial-panel" aria-labelledby="promociones-titulo">
            <div className="historial-cabecera">
              <div>
                <h1 id="promociones-titulo" className="historial-titulo">Promociones</h1>
                <p className="historial-subtitulo" role="status">
                  {promociones.length === 0
                    ? `Vigentes hoy en ${sede.nombre}`
                    : `${promociones.length} ${promociones.length === 1 ? 'promoción vigente' : 'promociones vigentes'} en ${sede.nombre}`}
                </p>
              </div>
              <Link className="historial-volver" to={inicio}>
                <ArrowLeft size={16} aria-hidden="true" /> Inicio
              </Link>
            </div>

            {promociones.length === 0 ? (
              <div className="aviso aviso-info historial-vacio" role="status">
                <Tag size={20} aria-hidden="true" />
                <div>
                  <p className="historial-vacio-titulo">Hoy no hay promociones activas en {sede.nombre}.</p>
                  <p>Vuelve pronto: aquí verás los descuentos que tu car wash publique.</p>
                </div>
              </div>
            ) : (
              <ul className="promo-lista" aria-label={`Promociones de ${sede.nombre}`}>
                {promociones.map((promocion) => (
                  <TarjetaPromocion key={promocion.id} promocion={promocion} />
                ))}
              </ul>
            )}

            <p className="promo-pie">
              <Info size={14} aria-hidden="true" /> El descuento se aplica en el car wash al registrar tu vehículo en los servicios incluidos.
            </p>
          </section>
        )}
      </div>

      <footer className="seg-pie">
        Con tecnología de <MarcaZaru tamano={16} gota={false} />
      </footer>
    </main>
  );
}
