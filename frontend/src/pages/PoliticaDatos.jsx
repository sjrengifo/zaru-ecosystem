// HU-30 CA1 y HU-51 — Política de tratamiento de datos vigente, pública.
// Las casillas de autorización del registro enlazan aquí; también la página "dejar de recibir".
import { useEffect, useState } from 'react';
import Cargando from '../components/Cargando.jsx';
import MarcaZaru from '../components/MarcaZaru.jsx';
import { formatoDia } from '../lib/formato.js';
import { obtenerPoliticaVigente } from '../services/baja.js';
import '../styles/seguimiento.css';

function parrafos(contenido) {
  return contenido
    .split(/\n+/)
    .map((linea) => linea.trim())
    .filter(Boolean)
    .map((linea, i) => {
      const texto = linea.replace(/^#+\s*/, '');
      return linea.startsWith('#') ? <h2 key={i}>{texto}</h2> : <p key={i}>{texto}</p>;
    });
}

export default function PoliticaDatos() {
  const [politica, setPolitica] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    document.title = 'Política de tratamiento de datos · Zaru';
    obtenerPoliticaVigente().then(setPolitica).catch(() => setError(true));
  }, []);

  return (
    <main className="seguimiento">
      <div className="seg-contenido politica-publica">
        <header className="seg-encabezado">
          <MarcaZaru tamano={28} gota={false} />
        </header>
        <article className="seg-tarjeta">
          <h1>{politica?.titulo || 'Política de tratamiento de datos personales'}</h1>
          {politica && (
            <p className="texto-suave">
              Versión {politica.version}
              {politica.vigenteDesde ? ` · vigente desde el ${formatoDia(String(politica.vigenteDesde).slice(0, 10))}` : ''}
            </p>
          )}
          {!politica && !error && <Cargando texto="Cargando la política…" />}
          {error && <p role="alert">No pudimos cargar la política. Revisa tu conexión e inténtalo de nuevo.</p>}
          {politica && parrafos(politica.contenido)}
        </article>
      </div>
    </main>
  );
}
