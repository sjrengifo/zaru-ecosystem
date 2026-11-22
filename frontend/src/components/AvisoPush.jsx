// HU-40 CA1/CA2 — Invitación a activar las notificaciones push al entrar a la web móvil.
// Solo aparece si el navegador las soporta, el cliente no las ha bloqueado, este navegador aún no está
// registrado y no dijo "Ahora no" en esta sesión. El permiso se pide al tocar "Activar" (gesto del usuario).
import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { activarPush, marcarNoInsistir, noInsistir, permisoPush, soportePush, suscripcionActual } from '../lib/push.js';
import { obtenerClavePush } from '../services/pushCliente.js';

export default function AvisoPush({ pase, alActivar }) {
  const [visible, setVisible] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState(null); // { tipo: 'exito' | 'info' | 'error', texto }

  useEffect(() => {
    let vigente = true;
    (async () => {
      if (!pase || noInsistir() || !soportePush().soportado || permisoPush() === 'denied') return;
      try {
        // Si el ambiente no tiene push (503) o este navegador ya está registrado, no se ofrece.
        await obtenerClavePush();
        if (await suscripcionActual()) return;
        if (vigente) setVisible(true);
      } catch {
        // Sin push en el servidor: no se muestra nada.
      }
    })();
    return () => { vigente = false; };
  }, [pase]);

  if (!visible && !mensaje) return null;

  const activar = async () => {
    setOcupado(true);
    setMensaje(null);
    try {
      const { resultado, dispositivo } = await activarPush(pase);
      setVisible(false);
      if (resultado === 'activado') {
        setMensaje({ tipo: 'exito', texto: `Listo: recibirás tus avisos en ${dispositivo ?? 'este celular'}.` });
        alActivar?.();
      } else {
        // CA2: rechazó el permiso del navegador; no se insiste y los demás canales siguen igual.
        setMensaje({ tipo: 'info', texto: 'Entendido, no te volveremos a preguntar. Seguirás recibiendo tus avisos por SMS o correo.' });
      }
    } catch (err) {
      setMensaje({ tipo: 'error', texto: err.message || 'No pudimos activar las notificaciones. Inténtalo de nuevo.' });
    } finally {
      setOcupado(false);
    }
  };

  const ahoraNo = () => {
    marcarNoInsistir();
    setVisible(false);
  };

  if (mensaje) {
    return (
      <div className={`aviso aviso-${mensaje.tipo === 'error' ? 'error' : mensaje.tipo === 'exito' ? 'exito' : 'info'} aviso-push`} role="status">
        <p>{mensaje.texto}</p>
        <button type="button" className="aviso-push-cerrar" onClick={() => setMensaje(null)} aria-label="Cerrar">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <section className="aviso-push aviso-push-invitacion" aria-labelledby="aviso-push-titulo">
      <span className="aviso-push-icono" aria-hidden="true"><BellRing size={20} /></span>
      <div className="aviso-push-texto">
        <p id="aviso-push-titulo" className="aviso-push-titulo">¿Te avisamos en este celular?</p>
        <p>Recibe el estado de tu vehículo al instante, aunque no tengas la página abierta.</p>
        <div className="aviso-push-acciones">
          <button type="button" className="boton boton-pequeno" onClick={activar} disabled={ocupado} aria-busy={ocupado}>
            {ocupado ? 'Activando…' : 'Activar notificaciones'}
          </button>
          <button type="button" className="boton secundario boton-pequeno" onClick={ahoraNo} disabled={ocupado}>
            Ahora no
          </button>
        </div>
      </div>
    </section>
  );
}
