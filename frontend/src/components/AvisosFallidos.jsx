// HU-33 CA3 — Alerta del dashboard: avisos de "vehículo listo" que fallaron en todos los canales.
//
// Solo la ve el administrador (módulo de notificaciones). Muestra la placa y el celular del cliente
// para llamarlo directamente, y se actualiza sola cada 30 segundos y cada vez que el tablero
// cambia. Al marcar "Ya lo contacté", la alerta desaparece para toda la sede.
import { useCallback, useEffect, useState } from 'react';
import { PhoneCall, TriangleAlert } from 'lucide-react';
import { api } from '../services/api.js';
import { usePerfil } from '../hooks/usePerfil.js';
import { puedeVer } from '../lib/permisos.js';
import { canalesIntentados, celularLegible, enlaceLlamada, haceCuanto } from '../lib/avisosFallidos.js';

export const INTERVALO_ALERTAS_MS = 30_000;

export default function AvisosFallidos({ senal, ahora = Date.now() }) {
  const perfil = usePerfil();
  const visible = puedeVer(perfil, 'notificaciones');
  const [alertas, setAlertas] = useState([]);
  const [atendiendo, setAtendiendo] = useState(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      const { alertas: lista } = await api.get('/notificaciones/fallidas');
      setAlertas(lista ?? []);
    } catch {
      // La alerta nunca bloquea el tablero: si no se puede consultar, se intenta en la siguiente vuelta.
    }
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    cargar();
    const intervalo = setInterval(cargar, INTERVALO_ALERTAS_MS);
    return () => clearInterval(intervalo);
  }, [visible, cargar, senal]);

  async function atender(alerta) {
    setAtendiendo(alerta.id);
    setError('');
    try {
      await api.patch(`/notificaciones/fallidas/${alerta.id}/atendida`);
      setAlertas((actuales) => actuales.filter((a) => a.id !== alerta.id));
    } catch (e) {
      setError(e.message);
    } finally {
      setAtendiendo(null);
    }
  }

  if (!visible || alertas.length === 0) return null;

  return (
    <section className="avisos-fallidos" role="alert" aria-labelledby="avisos-fallidos-titulo">
      <header className="avisos-fallidos-encabezado">
        <TriangleAlert size={20} aria-hidden="true" />
        <div>
          <h3 id="avisos-fallidos-titulo">
            {alertas.length === 1 ? 'Un cliente no recibió el aviso de vehículo listo' : `${alertas.length} clientes no recibieron el aviso de vehículo listo`}
          </h3>
          <p>Se reintentó y se probaron todos sus canales. Llámalo para avisarle.</p>
        </div>
      </header>
      <ul>
        {alertas.map((alerta) => (
          <li key={alerta.id}>
            <span className="placa">{alerta.placa ?? '—'}</span>
            <div className="avisos-fallidos-datos">
              <strong>{alerta.cliente ?? 'Cliente'}</strong>
              <span className="texto-suave">
                Falló por {canalesIntentados(alerta.canales)} · {haceCuanto(alerta.falloAt, ahora)}
              </span>
            </div>
            {alerta.celular && (
              <a className="boton secundario boton-pequeno avisos-fallidos-llamar" href={enlaceLlamada(alerta.celular)}>
                <PhoneCall size={16} aria-hidden="true" />
                {celularLegible(alerta.celular)}
              </a>
            )}
            <button
              type="button"
              className="boton boton-pequeno"
              disabled={atendiendo !== null}
              aria-label={`Ya contacté al cliente de ${alerta.placa ?? 'este vehículo'}`}
              onClick={() => atender(alerta)}
            >
              {atendiendo === alerta.id ? 'Guardando…' : 'Ya lo contacté'}
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="aviso aviso-error">{error}</p>}
    </section>
  );
}
