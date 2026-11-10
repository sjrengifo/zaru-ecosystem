// HU-30 — Autorizaciones de comunicaciones en el perfil del cliente.
//
// Muestra si el cliente recibe avisos del servicio y promociones, desde cuándo y por qué canal.
// El operario o el administrador las cambian cuando el cliente lo pide (CA3). El administrador ve
// además el historial completo con fecha, hora, canal y versión de la política (CA4).
import { useEffect, useState } from 'react';
import { BellOff, BellRing, History } from 'lucide-react';
import { api } from '../services/api.js';
import { formatoFechaHora } from '../lib/formato.js';
import { TIPOS_AUTORIZACION, nombreCanal, nombreTipo } from '../lib/autorizaciones.js';
import Cargando from './Cargando.jsx';

function Historial({ clienteId, recargas }) {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api
      .get(`/clientes/${clienteId}/consentimientos`)
      .then(setFilas)
      .catch((e) => setError(e.message));
  }, [clienteId, recargas]);

  if (error) return <p className="aviso aviso-error" role="alert">{error}</p>;
  if (!filas) return <Cargando texto="Cargando el historial…" />;
  if (filas.length === 0) return <p className="texto-suave">Sin registros de autorización.</p>;
  return (
    <ol className="historial-autorizaciones" aria-label="Historial de autorizaciones, de la más reciente a la más antigua">
      {filas.map((f, i) => (
        <li key={`${f.fecha}-${f.tipo}-${i}`}>
          <div className="historial-fila">
            <span className="autorizacion-nombre">{nombreTipo(f.tipo)}</span>
            <span className={`insignia ${f.otorgado ? 'insignia-ok' : 'insignia-retirada'}`}>{f.otorgado ? 'Otorgada' : 'Retirada'}</span>
          </div>
          <span className="texto-suave">
            <time dateTime={f.fecha}>{formatoFechaHora(f.fecha)}</time> · {nombreCanal(f.canal)} · {f.politicaVersion ? `Política v${f.politicaVersion}` : 'Sin versión de política'}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function AutorizacionesCliente({ cliente, esAdmin, onCambio }) {
  const [autorizaciones, setAutorizaciones] = useState(cliente.autorizaciones);
  const [guardando, setGuardando] = useState(null);
  const [error, setError] = useState('');
  const [verHistorial, setVerHistorial] = useState(false);
  const [recargas, setRecargas] = useState(0);

  useEffect(() => setAutorizaciones(cliente.autorizaciones), [cliente.autorizaciones]);

  if (!autorizaciones) return null;

  async function cambiar(tipo, otorgado, nombre) {
    setError('');
    setGuardando(tipo);
    try {
      const r = await api.put(`/clientes/${cliente.id}/autorizaciones`, { tipo, otorgado });
      setAutorizaciones(r.autorizaciones);
      setRecargas((n) => n + 1);
      onCambio?.({ nombre, otorgado });
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(null);
    }
  }

  return (
    <section className="perfil-tarjeta" aria-labelledby="perfil-autorizaciones-titulo">
      <div className="perfil-encabezado">
        <h4 id="perfil-autorizaciones-titulo">Comunicaciones</h4>
        {esAdmin && (
          <button type="button" className="boton-perfil" aria-expanded={verHistorial} onClick={() => setVerHistorial((v) => !v)}>
            <History size={16} aria-hidden="true" />
            {verHistorial ? 'Ocultar historial' : 'Ver historial'}
          </button>
        )}
      </div>

      <ul className="lista-autorizaciones">
        {TIPOS_AUTORIZACION.map(({ tipo, clave, nombre }) => {
          const actual = autorizaciones[clave];
          const Icon = actual.otorgado ? BellRing : BellOff;
          return (
            <li key={tipo} className={actual.otorgado ? 'autorizada' : 'retirada'}>
              <span className="perfil-dato-icono">
                <Icon size={18} aria-hidden="true" />
              </span>
              <div className="autorizacion-datos">
                <span className="autorizacion-nombre">{nombre}</span>
                <span className="texto-suave">
                  {actual.otorgado ? 'Autorizado' : 'No autorizado'}
                  {actual.fecha && ` · ${formatoFechaHora(actual.fecha)} · ${nombreCanal(actual.canal)}`}
                  {actual.politicaVersion && ` · política v${actual.politicaVersion}`}
                </span>
              </div>
              <button
                type="button"
                className={actual.otorgado ? 'boton secundario boton-pequeno' : 'boton boton-pequeno'}
                disabled={guardando !== null}
                aria-label={`${actual.otorgado ? 'Retirar' : 'Autorizar'}: ${nombre}`}
                onClick={() => cambiar(tipo, !actual.otorgado, nombre)}
              >
                {guardando === tipo ? 'Guardando…' : actual.otorgado ? 'Retirar' : 'Autorizar'}
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="aviso aviso-error" role="alert">{error}</p>}
      {esAdmin && verHistorial && <Historial clienteId={cliente.id} recargas={recargas} />}
    </section>
  );
}
