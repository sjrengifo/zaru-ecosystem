// HU-57 · Panel de administración de la plataforma Zaru (solo superadministrador).
// CA1: registrar un establecimiento con plan y administrador inicial (invitación por correo).
// CA2: ver qué pruebas vencen pronto y cuáles quedaron pendientes de activación.
// CA3: suspender sin borrar datos (sus usuarios ya no pueden entrar) y volver a habilitar.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { api } from '../services/api.js';
import { usePerfil } from '../hooks/usePerfil.js';
import Modal from '../components/Modal.jsx';
import Notificacion from '../components/Notificacion.jsx';
import FormularioEstablecimiento from '../components/FormularioEstablecimiento.jsx';
import MarcaZaru from '../components/MarcaZaru.jsx';
import Cargando from '../components/Cargando.jsx';
import {
  PLANES, ESTADOS, FILTROS, DIAS_AVISO_VENCIMIENTO,
  accionesPara, contarPorEstado, filtrarEstablecimientos, formatoFechaCorta,
} from '../lib/establecimientos.js';

const CONFIRMACIONES = {
  suspender: {
    titulo: 'Suspender establecimiento',
    boton: 'Suspender',
    peligro: true,
    explicacion: 'Sus usuarios no podrán iniciar sesión mientras esté suspendido. Sus clientes, vehículos y órdenes se conservan y vuelven a estar disponibles al habilitarlo.',
  },
  activar: {
    titulo: 'Activar establecimiento',
    boton: 'Activar',
    explicacion: 'Sus usuarios podrán iniciar sesión y usar el panel con normalidad.',
  },
};

function EstadoCelda({ item }) {
  const vencePronto = item.estado === 'prueba' && item.dias_restantes !== null && item.dias_restantes <= DIAS_AVISO_VENCIMIENTO;
  return (
    <div className="celda-estado">
      <span className={`estado-establecimiento estado-${item.estado}`}>{ESTADOS[item.estado] || item.estado}</span>
      {item.estado === 'prueba' && item.dias_restantes !== null && (
        <span className={vencePronto ? 'texto-advertencia' : 'texto-suave'}>
          {item.dias_restantes === 0 ? 'Vence hoy' : `Vence en ${item.dias_restantes} ${item.dias_restantes === 1 ? 'día' : 'días'}`}
        </span>
      )}
      {item.estado === 'pendiente_activacion' && <span className="texto-advertencia">La prueba terminó</span>}
    </div>
  );
}

function AdministradorCelda({ administrador }) {
  if (!administrador) return <span className="texto-suave">Sin administrador</span>;
  return (
    <div className="celda-administrador">
      <span className="celda-correo">{administrador.correo ?? administrador.nombre}</span>
      {administrador.invitacionAceptada === false && <span className="insignia insignia-pendiente">Invitación pendiente</span>}
      {administrador.invitacionAceptada === true && <span className="insignia insignia-ok">Cuenta activa</span>}
    </div>
  );
}

export default function Superadmin() {
  const perfil = usePerfil();
  const [establecimientos, setEstablecimientos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [buscar, setBuscar] = useState('');
  const [registroAbierto, setRegistroAbierto] = useState(false);
  const [confirmacion, setConfirmacion] = useState(null); // { item, accion }
  const [motivo, setMotivo] = useState('');
  const [procesando, setProcesando] = useState(null);
  const [aviso, setAviso] = useState(null);
  const cerrarAviso = useCallback(() => setAviso(null), []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try { setEstablecimientos(await api.get('/superadmin/establecimientos')); }
    catch (e) { setError(e.message); }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const conteo = useMemo(() => contarPorEstado(establecimientos), [establecimientos]);
  const visibles = useMemo(() => filtrarEstablecimientos(establecimientos, { estado: filtro, buscar }), [establecimientos, filtro, buscar]);
  const vencenPronto = establecimientos.filter((e) => e.estado === 'prueba' && e.dias_restantes !== null && e.dias_restantes <= DIAS_AVISO_VENCIMIENTO).length;

  const notificar = (titulo, detalle) => setAviso({ id: Date.now(), titulo, detalle });

  async function confirmarCambio() {
    const { item, accion } = confirmacion;
    setProcesando(item.id);
    setError('');
    try {
      await api.post(`/superadmin/establecimientos/${item.id}/${accion}`, accion === 'suspender' && motivo.trim() ? { motivo: motivo.trim() } : {});
      notificar(accion === 'suspender' ? `${item.nombre} suspendido` : `${item.nombre} activado`,
        accion === 'suspender' ? 'Sus usuarios ya no pueden iniciar sesión. Los datos se conservan.' : 'Sus usuarios ya pueden iniciar sesión.');
      setConfirmacion(null);
      setMotivo('');
      await cargar();
    } catch (e) {
      setError(e.message);
      setConfirmacion(null);
    } finally {
      setProcesando(null);
    }
  }

  async function reenviar(item) {
    setProcesando(item.id);
    setError('');
    try {
      const { correo } = await api.post(`/superadmin/establecimientos/${item.id}/reenviar-invitacion`);
      notificar('Invitación reenviada', `Enviamos un nuevo enlace a ${correo}.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div className="superadmin-pagina">
      <header className="superadmin-barra">
        <div className="superadmin-marca">
          <span className="logo"><MarcaZaru claro tamano={28} /></span>
          <span className="superadmin-marca-texto">Administración de la plataforma</span>
        </div>
        <div className="superadmin-sesion">
          {perfil && <span className="texto-suave">{perfil.nombre}</span>}
          <button className="boton secundario boton-pequeno" type="button" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
        </div>
      </header>

      <section className="superadmin">
        <div className="encabezado">
          <div>
            <h2>Establecimientos afiliados</h2>
            <p className="texto-suave">Registra nuevos car wash, controla su periodo de prueba y su acceso.</p>
          </div>
          <button className="boton" type="button" onClick={() => setRegistroAbierto(true)}>+ Registrar establecimiento</button>
        </div>

        <div className="resumen-estados" role="group" aria-label="Filtrar por estado">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`resumen-tarjeta resumen-${f.id}`}
              aria-pressed={filtro === f.id}
              onClick={() => setFiltro(f.id)}
            >
              <span className="resumen-numero">{conteo[f.id]}</span>
              <span className="resumen-texto">{f.texto}</span>
            </button>
          ))}
        </div>

        {vencenPronto > 0 && (
          <p className="aviso aviso-advertencia">
            {vencenPronto === 1 ? 'Un periodo de prueba vence' : `${vencenPronto} periodos de prueba vencen`} en {DIAS_AVISO_VENCIMIENTO} días o menos.
          </p>
        )}
        {error && <p className="aviso aviso-error" role="alert">{error}</p>}

        <div className="tarjeta">
          <div className="superadmin-tabla-encabezado">
            <input
              type="search"
              className="buscador"
              placeholder="Buscar por nombre o correo del administrador"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              aria-label="Buscar establecimiento"
            />
            <button className="boton secundario boton-pequeno" type="button" onClick={cargar} disabled={cargando} aria-busy={cargando}>Actualizar</button>
          </div>

          {cargando && !establecimientos.length ? <Cargando texto="Cargando establecimientos…" className="cargando-bloque" /> : (
            <div className="tabla-contenedor">
              <table className="tabla tabla-establecimientos">
                <thead><tr><th>Establecimiento</th><th>Plan</th><th>Estado</th><th>Administrador</th><th>Prueba</th><th>Acciones</th></tr></thead>
                <tbody>
                  {visibles.map((item) => {
                    const acciones = accionesPara(item);
                    const ocupado = procesando === item.id;
                    return (
                      <tr key={item.id}>
                        <td data-etiqueta="Establecimiento">
                          <strong>{item.nombre}</strong>
                          <span className="texto-suave celda-secundaria">Registrado el {formatoFechaCorta(item.created_at)}</span>
                        </td>
                        <td data-etiqueta="Plan"><span className={`plan-insignia plan-${item.plan}`}>{PLANES.find((p) => p.value === item.plan)?.label || item.plan}</span></td>
                        <td data-etiqueta="Estado"><EstadoCelda item={item} /></td>
                        <td data-etiqueta="Administrador"><AdministradorCelda administrador={item.administrador} /></td>
                        <td data-etiqueta="Prueba">{item.prueba_inicia_at ? `${formatoFechaCorta(item.prueba_inicia_at)} – ${formatoFechaCorta(item.prueba_finaliza_at)}` : '—'}</td>
                        <td data-etiqueta="Acciones" className="tabla-acciones">
                          <div className="acciones-fila">
                          {acciones.activar && (
                            <button className="boton boton-pequeno" type="button" disabled={ocupado} onClick={() => setConfirmacion({ item, accion: 'activar' })}>
                              {item.estado === 'suspendido' ? 'Habilitar' : 'Activar'}
                            </button>
                          )}
                          {acciones.reenviar && (
                            <button className="boton secundario boton-pequeno" type="button" disabled={ocupado} aria-busy={ocupado} onClick={() => reenviar(item)}>Reenviar invitación</button>
                          )}
                          {acciones.suspender && (
                            <button className="boton boton-pequeno peligro" type="button" disabled={ocupado} onClick={() => setConfirmacion({ item, accion: 'suspender' })}>Suspender</button>
                          )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!visibles.length && (
                    <tr><td colSpan="6" className="tabla-vacia">
                      {establecimientos.length ? 'Ningún establecimiento coincide con el filtro.' : 'Todavía no hay establecimientos registrados.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {registroAbierto && (
        <Modal titulo="Registrar establecimiento" onCerrar={() => setRegistroAbierto(false)}>
          <FormularioEstablecimiento
            onCancelar={() => setRegistroAbierto(false)}
            onCreado={(resultado) => {
              setRegistroAbierto(false);
              notificar(`${resultado.establecimiento.nombre} registrado`, `Enviamos la invitación a ${resultado.invitacion.correo}.`);
              setFiltro('todos');
              cargar();
            }}
          />
        </Modal>
      )}

      {confirmacion && (
        <Modal titulo={CONFIRMACIONES[confirmacion.accion].titulo} onCerrar={() => { setConfirmacion(null); setMotivo(''); }}>
          <div className="modal-cuerpo">
            <p>¿Confirmas {confirmacion.accion} <strong>{confirmacion.item.nombre}</strong>?</p>
            <p className="texto-suave">{CONFIRMACIONES[confirmacion.accion].explicacion}</p>
            {confirmacion.accion === 'suspender' && (
              <div className="campo">
                <label htmlFor="motivo-suspension">Motivo (opcional, queda en la auditoría)</label>
                <textarea id="motivo-suspension" data-foco-inicial rows="3" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </div>
            )}
          </div>
          <div className="modal-acciones">
            <button type="button" className="boton secundario" data-foco-inicial={confirmacion.accion !== 'suspender' || undefined} onClick={() => { setConfirmacion(null); setMotivo(''); }}>Cancelar</button>
            <button
              type="button"
              className={`boton${CONFIRMACIONES[confirmacion.accion].peligro ? ' peligro' : ''}`}
              disabled={procesando === confirmacion.item.id}
              aria-busy={procesando === confirmacion.item.id}
              onClick={confirmarCambio}
            >
              {CONFIRMACIONES[confirmacion.accion].boton}
            </button>
          </div>
        </Modal>
      )}

      <div className="notificaciones" role="status">
        {aviso && <Notificacion key={aviso.id} titulo={aviso.titulo} detalle={aviso.detalle} onCerrar={cerrarAviso} />}
      </div>
    </div>
  );
}
