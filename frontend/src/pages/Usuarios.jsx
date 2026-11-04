// HU-02 — Usuarios operarios: listar, invitar, editar nombre y activar/desactivar.
// El correo se administra en Supabase Auth; aquí se muestra pero no se edita.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';
import FormularioUsuario from '../components/FormularioUsuario.jsx';
import Notificacion from '../components/Notificacion.jsx';

const FILTROS = [
  { valor: '', texto: 'Todos' },
  { valor: 'true', texto: 'Activos' },
  { valor: 'false', texto: 'Inactivos' },
];

const VACIO = {
  '': 'Aún no hay operarios en el establecimiento.',
  true: 'No hay operarios activos.',
  false: 'No hay operarios inactivos.',
};

export default function Usuarios() {
  const [filtro, setFiltro] = useState('');
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [recargas, setRecargas] = useState(0);
  const [editando, setEditando] = useState(undefined); // undefined: cerrado · null: nuevo · objeto: editar
  const [cambiandoId, setCambiandoId] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);
  const [invitacionManual, setInvitacionManual] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const cerrarConfirmacion = useCallback(() => setConfirmacion(null), []);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    api
      .get('/usuarios')
      .then((lista) => {
        if (!vigente) return;
        setUsuarios(lista);
        setError('');
      })
      .catch((e) => vigente && setError(e.message))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [recargas]);

  const visibles = usuarios.filter((usuario) => filtro === '' || String(usuario.activo) === filtro);

  function alGuardar(resultado) {
    const nuevo = editando === null;
    const usuario = resultado.usuario ?? resultado;
    setEditando(undefined);
    setRecargas((n) => n + 1);

    // Si Supabase no pudo enviar el correo, se ofrece el enlace seguro una sola vez.
    if (nuevo && resultado.invitacion?.enlace) {
      setInvitacionManual({ correo: usuario.correo, enlace: resultado.invitacion.enlace });
      setCopiado(false);
      setConfirmacion(null);
      return;
    }

    setConfirmacion({
      id: Date.now(),
      titulo: nuevo ? 'Operario invitado' : 'Cambios guardados',
      detalle: nuevo ? `Se envió una invitación a ${usuario.correo}.` : usuario.nombre,
    });
  }

  async function copiarEnlace() {
    if (!invitacionManual) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(invitacionManual.enlace);
        setCopiado(true);
        return;
      }
    } catch {
      // Si el navegador bloquea el portapapeles, se selecciona el texto para copiarlo a mano.
    }
    document.getElementById('enlace-invitacion')?.select();
  }

  async function alternarActivo(usuario) {
    setCambiandoId(usuario.id);
    try {
      const actualizado = await api.put(`/usuarios/${usuario.id}`, { activo: !usuario.activo });
      setRecargas((n) => n + 1);
      setConfirmacion({
        id: Date.now(),
        titulo: actualizado.activo ? 'Operario activado' : 'Operario desactivado',
        detalle: actualizado.activo
          ? `${actualizado.nombre} puede volver a ingresar al panel.`
          : `${actualizado.nombre} ya no podrá ingresar al panel. Su historial se conserva.`,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setCambiandoId(null);
    }
  }

  return (
    <section>
      <div className="encabezado">
        <h2>Usuarios</h2>
        <button className="boton" onClick={() => setEditando(null)}>
          + Nuevo operario
        </button>
      </div>
      <p className="texto-suave">
        Los operarios registran clientes, vehículos y órdenes. No administran servicios, promociones, usuarios ni branding.
        Desactivar una cuenta no elimina su historial.
      </p>

      <div className="notificaciones" role="status">
        {confirmacion && <Notificacion key={confirmacion.id} titulo={confirmacion.titulo} detalle={confirmacion.detalle} onCerrar={cerrarConfirmacion} />}
      </div>

      {invitacionManual && (
        <div className="aviso aviso-advertencia" role="status">
          <p>
            <strong>Cuenta creada. Comparte este enlace seguro.</strong>
          </p>
          <p>
            No se pudo enviar el correo de invitación a {invitacionManual.correo}. Copia el enlace y
            envíalo por un medio seguro; solo funciona una vez y vence.
          </p>
          <div className="enlace-invitacion">
            <input
              id="enlace-invitacion"
              readOnly
              value={invitacionManual.enlace}
              aria-label="Enlace de invitación"
              onFocus={(e) => e.target.select()}
            />
            <button type="button" className="boton secundario" onClick={copiarEnlace}>
              {copiado ? 'Copiado' : 'Copiar enlace'}
            </button>
            <button type="button" className="boton secundario" onClick={() => setInvitacionManual(null)}>
              Ocultar
            </button>
          </div>
        </div>
      )}

      {editando !== undefined && (
        <FormularioUsuario
          key={editando?.id ?? 'nuevo'}
          usuario={editando}
          onGuardado={alGuardar}
          onCancelar={() => setEditando(undefined)}
        />
      )}

      <div className="filtros" role="group" aria-label="Filtrar operarios por estado">
        {FILTROS.map((f) => (
          <button key={f.valor} type="button" className="filtro" aria-pressed={filtro === f.valor} onClick={() => setFiltro(f.valor)}>
            {f.texto}
          </button>
        ))}
      </div>

      {error && (
        <div className="aviso aviso-error" role="alert">
          <p>{error}</p>
        </div>
      )}

      <div className="tabla-contenedor">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Operario</th>
              <th scope="col">Correo</th>
              <th scope="col">Estado</th>
              <th scope="col" className="tabla-acciones" aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {visibles.map((usuario) => (
              <tr key={usuario.id}>
                <td>
                  <strong>{usuario.nombre}</strong>
                </td>
                <td data-etiqueta="Correo">{usuario.correo || '—'}</td>
                <td data-etiqueta="Estado">
                  <span className={`estado-servicio ${usuario.activo ? 'estado-servicio-activo' : 'estado-servicio-inactivo'}`}>
                    {usuario.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="tabla-acciones">
                  <button type="button" className="boton-fila" title="Editar" aria-label={`Editar ${usuario.nombre}`} onClick={() => setEditando(usuario)}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="boton secundario boton-pequeno"
                    disabled={cambiandoId === usuario.id}
                    aria-busy={cambiandoId === usuario.id}
                    onClick={() => alternarActivo(usuario)}
                  >
                    {usuario.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
            {visibles.length === 0 && !error && (
              <tr>
                <td colSpan={4} className="tabla-vacia">
                  {cargando ? 'Cargando operarios…' : VACIO[filtro]}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
