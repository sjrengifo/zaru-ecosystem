// HU-38 CA2 — Campana del encabezado de la app del cliente con el número de avisos sin leer.
// Con el pase de la sede pide el contador al abrir la pantalla; sin pase solo lleva al centro de
// notificaciones, que pide verificar placa + celular. Un fallo del contador nunca bloquea la pantalla.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { etiquetaCampana, textoContador } from '../lib/notificacionesCliente.js';
import { leerPase } from '../services/historialCliente.js';
import { listarNotificacionesCliente } from '../services/notificacionesCliente.js';
import '../styles/notificaciones-cliente.css';

export default function CampanaNotificaciones({ slug, pase: paseRecibido }) {
  const pase = paseRecibido === undefined ? leerPase(slug) : paseRecibido;
  const [noLeidas, setNoLeidas] = useState(0);

  useEffect(() => {
    if (!pase) {
      setNoLeidas(0);
      return undefined;
    }
    let vigente = true;
    listarNotificacionesCliente(pase)
      .then((datos) => vigente && setNoLeidas(datos.noLeidas ?? 0))
      .catch(() => vigente && setNoLeidas(0));
    return () => {
      vigente = false;
    };
  }, [pase]);

  return (
    <Link
      className="campana-cliente"
      to={`/s/${encodeURIComponent(slug)}/notificaciones`}
      aria-label={etiquetaCampana(noLeidas)}
      title="Notificaciones"
    >
      <Bell size={22} aria-hidden="true" />
      {noLeidas > 0 && (
        <span className="campana-contador" aria-hidden="true">{textoContador(noLeidas)}</span>
      )}
    </Link>
  );
}
