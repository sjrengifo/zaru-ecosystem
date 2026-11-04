// HU-07 — Catálogo de servicios (ZARU-8): listar, crear, editar precio/duración y activar/desactivar.
// Los servicios inactivos siguen en el historial, pero no se ofrecen al registrar una orden nueva.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { formatoMoneda } from '../lib/formato.js';
import { useRol } from '../hooks/useRol.js';
import FormularioServicio from '../components/FormularioServicio.jsx';
import Notificacion from '../components/Notificacion.jsx';

const FILTROS = [
  { valor: '', texto: 'Todos' },
  { valor: 'true', texto: 'Activos' },
  { valor: 'false', texto: 'Inactivos' },
];

const VACIO = {
  '': 'Aún no hay servicios en el catálogo.',
  true: 'No hay servicios activos.',
  false: 'No hay servicios inactivos.',
};

export default function Servicios() {
  const [filtro, setFiltro] = useState('');
  const [servicios, setServicios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [recargas, setRecargas] = useState(0);
  const [editando, setEditando] = useState(undefined); // undefined: cerrado · null: nuevo · objeto: editar
  const [cambiandoId, setCambiandoId] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);
  const cerrarConfirmacion = useCallback(() => setConfirmacion(null), []);
  const esAdmin = useRol() === 'admin';

  useEffect(() => {
    let vigente = true; // Una respuesta lenta no reemplaza la de un filtro más reciente.
    setCargando(true);
    api
      .get(`/servicios${filtro ? `?activo=${filtro}` : ''}`)
      .then((lista) => {
        if (!vigente) return;
        setServicios(lista);
        setError('');
      })
      .catch((e) => vigente && setError(e.message))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [filtro, recargas]);

  function alGuardar(servicio) {
    const nuevo = editando === null;
    setEditando(undefined);
    setRecargas((n) => n + 1);
    setConfirmacion({
      id: Date.now(),
      titulo: nuevo ? 'Servicio creado' : 'Cambios guardados',
      detalle: `${servicio.nombre} · ${formatoMoneda(servicio.precio)} · ${servicio.duracion_min} min`,
    });
  }

  async function alternarActivo(servicio) {
    setCambiandoId(servicio.id);
    try {
      const actualizado = await api.patch(`/servicios/${servicio.id}`, { activo: !servicio.activo });
      setRecargas((n) => n + 1);
      setConfirmacion({
        id: Date.now(),
        titulo: actualizado.activo ? 'Servicio activado' : 'Servicio desactivado',
        detalle: actualizado.activo ? actualizado.nombre : `${actualizado.nombre} ya no se ofrece en órdenes nuevas.`,
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
        <h2>Servicios</h2>
        {esAdmin && (
          <button className="boton" onClick={() => setEditando(null)}>
            + Nuevo servicio
          </button>
        )}
      </div>
      <p className="texto-suave">
        Los servicios activos están disponibles al registrar una orden. Desactivar uno no cambia las órdenes ni el historial.
      </p>

      <div className="notificaciones" role="status">
        {confirmacion && <Notificacion key={confirmacion.id} titulo={confirmacion.titulo} detalle={confirmacion.detalle} onCerrar={cerrarConfirmacion} />}
      </div>

      {editando !== undefined && (
        <FormularioServicio
          key={editando?.id ?? 'nuevo'}
          servicio={editando}
          onGuardado={alGuardar}
          onCancelar={() => setEditando(undefined)}
        />
      )}

      <div className="filtros" role="group" aria-label="Filtrar servicios por estado">
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
              <th scope="col">Servicio</th>
              <th scope="col">Precio</th>
              <th scope="col">Duración</th>
              <th scope="col">Estado</th>
              {esAdmin && <th scope="col" className="tabla-acciones" aria-label="Acciones" />}
            </tr>
          </thead>
          <tbody>
            {servicios.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.nombre}</strong>
                </td>
                <td data-etiqueta="Precio">{formatoMoneda(s.precio)}</td>
                <td data-etiqueta="Duración">{s.duracion_min} min</td>
                <td data-etiqueta="Estado">
                  <span className={`estado-servicio ${s.activo ? 'estado-servicio-activo' : 'estado-servicio-inactivo'}`}>
                    {s.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                {esAdmin && (
                  <td className="tabla-acciones">
                    <button type="button" className="boton-fila" title="Editar" aria-label={`Editar ${s.nombre}`} onClick={() => setEditando(s)}>
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="boton secundario boton-pequeno"
                      disabled={cambiandoId === s.id}
                      aria-busy={cambiandoId === s.id}
                      onClick={() => alternarActivo(s)}
                    >
                      {s.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {servicios.length === 0 && !error && (
              <tr>
                <td colSpan={esAdmin ? 5 : 4} className="tabla-vacia">
                  {cargando ? 'Cargando servicios…' : VACIO[filtro]}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
