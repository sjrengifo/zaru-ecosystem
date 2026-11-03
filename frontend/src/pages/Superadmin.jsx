import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { api } from '../services/api.js';

const PLANES = [
  { value: 'basico', label: 'Básico' },
  { value: 'intermedio', label: 'Intermedio' },
  { value: 'empresarial', label: 'Empresarial' },
];
const ESTADOS = { prueba: 'En prueba', activo: 'Activo', pendiente_activacion: 'Pendiente de activación', suspendido: 'Suspendido' };
const fecha = (valor) => valor ? new Date(valor).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

export default function Superadmin() {
  const [establecimientos, setEstablecimientos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [form, setForm] = useState({ nombre: '', plan: 'basico', correoAdministrador: '', diasPrueba: '14' });

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try { setEstablecimientos(await api.get('/superadmin/establecimientos')); }
    catch (e) { setError(e.message); }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  const cambiar = (campo, valor) => setForm((actual) => ({ ...actual, [campo]: valor }));

  async function registrar(e) {
    e.preventDefault();
    setGuardando(true); setError(''); setMensaje('');
    try {
      const resultado = await api.post('/superadmin/establecimientos', { ...form, diasPrueba: Number(form.diasPrueba) });
      setMensaje(`Establecimiento creado. Invitación enviada a ${resultado.invitacion.correo}.`);
      setMostrarFormulario(false);
      setForm({ nombre: '', plan: 'basico', correoAdministrador: '', diasPrueba: '14' });
      await cargar();
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  }

  async function cambiarEstado(item, accion) {
    const verbo = accion === 'suspender' ? 'suspender' : 'activar';
    if (!window.confirm(`¿Confirmas ${verbo} el establecimiento "${item.nombre}"?`)) return;
    setError(''); setMensaje('');
    try {
      await api.post(`/superadmin/establecimientos/${item.id}/${accion}`);
      setMensaje(`Establecimiento ${accion === 'suspender' ? 'suspendido' : 'activado'} correctamente.`);
      await cargar();
    } catch (e) { setError(e.message); }
  }

  return (
    <section className="superadmin">
      <div className="encabezado">
        <div><h2>Establecimientos afiliados</h2><p className="texto-suave">Administración de los establecimientos de la plataforma Zaru.</p></div>
        <button className="boton" type="button" onClick={() => { setMostrarFormulario((v) => !v); setError(''); }}>
          {mostrarFormulario ? 'Cancelar' : '+ Registrar establecimiento'}
        </button>
      </div>
      {mensaje && <p className="aviso aviso-exito" role="status">{mensaje}</p>}
      {error && <p className="aviso-error" role="alert">{error}</p>}

      {mostrarFormulario && (
        <form className="tarjeta superadmin-form" onSubmit={registrar}>
          <h3>Nuevo establecimiento</h3>
          <div className="campos-fila">
            <label>Nombre del establecimiento
              <input autoFocus value={form.nombre} onChange={(e) => cambiar('nombre', e.target.value)} minLength="2" maxLength="120" required />
            </label>
            <label>Plan
              <select value={form.plan} onChange={(e) => cambiar('plan', e.target.value)}>
                {PLANES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
            <label>Correo del administrador inicial
              <input type="email" value={form.correoAdministrador} onChange={(e) => cambiar('correoAdministrador', e.target.value)} maxLength="254" required />
            </label>
            <label>Periodo de prueba (días)
              <input type="number" min="14" max="30" step="1" value={form.diasPrueba} onChange={(e) => cambiar('diasPrueba', e.target.value)} required />
            </label>
          </div>
          <div className="superadmin-acciones"><button className="boton" disabled={guardando}>{guardando ? 'Registrando…' : 'Crear y enviar invitación'}</button></div>
        </form>
      )}

      <div className="tarjeta">
        <div className="superadmin-tabla-encabezado"><h3>Listado</h3><button className="boton secundario boton-pequeno" type="button" onClick={cargar} disabled={cargando}>Actualizar</button></div>
        {cargando ? <p className="texto-suave">Cargando establecimientos…</p> : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead><tr><th>Establecimiento</th><th>Plan</th><th>Estado</th><th>Inicio de prueba</th><th>Fin de prueba</th><th>Acciones</th></tr></thead>
              <tbody>
                {establecimientos.map((item) => (
                  <tr key={item.id}>
                    <td data-etiqueta="Establecimiento">{item.nombre}</td>
                    <td data-etiqueta="Plan">{PLANES.find((p) => p.value === item.plan)?.label || item.plan}</td>
                    <td data-etiqueta="Estado"><span className={`estado-establecimiento estado-${item.estado}`}>{ESTADOS[item.estado] || item.estado}</span></td>
                    <td data-etiqueta="Inicio de prueba">{fecha(item.prueba_inicia_at)}</td>
                    <td data-etiqueta="Fin de prueba">{fecha(item.prueba_finaliza_at)}</td>
                    <td data-etiqueta="Acciones" className="tabla-acciones">
                      {item.estado !== 'suspendido' && <button className="boton boton-pequeno peligro" type="button" onClick={() => cambiarEstado(item, 'suspender')}>Suspender</button>}
                      {item.estado !== 'activo' && item.estado !== 'suspendido' && <button className="boton boton-pequeno" type="button" onClick={() => cambiarEstado(item, 'activar')}>Activar</button>}
                      {item.estado === 'suspendido' && <button className="boton boton-pequeno" type="button" onClick={() => cambiarEstado(item, 'activar')}>Habilitar</button>}
                    </td>
                  </tr>
                ))}
                {!establecimientos.length && <tr><td colSpan="6" className="tabla-vacia">Todavía no hay establecimientos registrados.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <button className="boton secundario superadmin-salir" type="button" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
    </section>
  );
}
