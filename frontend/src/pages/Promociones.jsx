// HU-12 · Promociones (ZARU-13): lista por estado, crear, editar y activar/desactivar.
// El estado lo calcula la API con la fecha de Bogotá: al pasar la fecha de fin la promoción
// deja de estar vigente sola (CA2). Las vigentes son las que verá el cliente final (CA1).
import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { formatoDia } from '../lib/formato.js';
import { ESTADOS_PROMOCION } from '../lib/validacionPromocion.js';
import { useRol } from '../hooks/useRol.js';
import FormularioPromocion from '../components/FormularioPromocion.jsx';
import Notificacion from '../components/Notificacion.jsx';

const FILTROS = [
  { valor: 'todas', texto: 'Todas' },
  { valor: 'vigentes', texto: 'Vigentes' },
  { valor: 'programadas', texto: 'Programadas' },
  { valor: 'vencidas', texto: 'Vencidas' },
];

const VACIO = {
  todas: 'Aún no hay promociones.',
  vigentes: 'No hay promociones vigentes hoy.',
  programadas: 'No hay promociones programadas.',
  vencidas: 'No hay promociones vencidas.',
};

export default function Promociones() {
  const [filtro, setFiltro] = useState('todas');
  const [promociones, setPromociones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [recargas, setRecargas] = useState(0);
  const [editando, setEditando] = useState(undefined); // undefined: cerrado · null: nueva · objeto: editar
  const [cambiandoId, setCambiandoId] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);
  const cerrarConfirmacion = useCallback(() => setConfirmacion(null), []);
  const esAdmin = useRol() === 'admin';

  useEffect(() => {
    let vigente = true; // Una respuesta lenta no reemplaza la de un filtro más reciente.
    setCargando(true);
    api
      .get(`/promociones?estado=${filtro}`)
      .then((lista) => {
        if (!vigente) return;
        setPromociones(lista);
        setError('');
      })
      .catch((e) => vigente && setError(e.message))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [filtro, recargas]);

  function alGuardar(promocion) {
    const nueva = editando === null;
    setEditando(undefined);
    setRecargas((n) => n + 1);
    setConfirmacion({
      id: Date.now(),
      titulo: nueva ? 'Promoción creada' : 'Cambios guardados',
      detalle: `${promocion.nombre} · ${ESTADOS_PROMOCION[promocion.estado]}`,
    });
  }

  async function alternarActiva(promocion) {
    setCambiandoId(promocion.id);
    try {
      const actualizada = await api.patch(`/promociones/${promocion.id}`, { activa: !promocion.activa });
      setRecargas((n) => n + 1);
      setConfirmacion({ id: Date.now(), titulo: actualizada.activa ? 'Promoción activada' : 'Promoción desactivada', detalle: actualizada.nombre });
    } catch (e) {
      setError(e.message);
    } finally {
      setCambiandoId(null);
    }
  }

  return (
    <section>
      <div className="encabezado">
        <h2>Promociones</h2>
        {esAdmin && (
          <button className="boton" onClick={() => setEditando(null)}>
            + Nueva promoción
          </button>
        )}
      </div>
      <p className="texto-suave">Las promociones vigentes se aplican solas a las órdenes y las ven tus clientes. Al pasar su fecha final dejan de aplicarse.</p>

      <div className="notificaciones" role="status">
        {confirmacion && <Notificacion key={confirmacion.id} titulo={confirmacion.titulo} detalle={confirmacion.detalle} onCerrar={cerrarConfirmacion} />}
      </div>

      {editando !== undefined && <FormularioPromocion promocion={editando} onGuardada={alGuardar} onCancelar={() => setEditando(undefined)} />}

      <div className="filtros" role="group" aria-label="Filtrar promociones por estado">
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
              <th scope="col">Promoción</th>
              <th scope="col">Descuento</th>
              <th scope="col">Vigencia</th>
              <th scope="col">Servicios</th>
              <th scope="col">Estado</th>
              {esAdmin && <th scope="col" className="tabla-acciones" aria-label="Acciones" />}
            </tr>
          </thead>
          <tbody>
            {promociones.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.nombre}</strong>
                  {p.condiciones && <div className="texto-suave">{p.condiciones}</div>}
                </td>
                <td data-etiqueta="Descuento">{Number(p.descuento_pct)} %</td>
                <td data-etiqueta="Vigencia">
                  {formatoDia(p.fecha_inicio)} – {formatoDia(p.fecha_fin)}
                </td>
                <td data-etiqueta="Servicios">{p.servicios.map((s) => s.nombre).join(', ')}</td>
                <td data-etiqueta="Estado">
                  <span className={`estado-promocion estado-${p.estado}`}>{ESTADOS_PROMOCION[p.estado]}</span>
                </td>
                {esAdmin && (
                  <td className="tabla-acciones">
                    <button type="button" className="boton-fila" title="Editar" aria-label={`Editar ${p.nombre}`} onClick={() => setEditando(p)}>
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="boton secundario boton-pequeno"
                      disabled={cambiandoId === p.id}
                      aria-busy={cambiandoId === p.id}
                      onClick={() => alternarActiva(p)}
                    >
                      {p.activa ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {promociones.length === 0 && !error && (
              <tr>
                <td colSpan={esAdmin ? 6 : 5} className="tabla-vacia">
                  {cargando ? 'Cargando promociones…' : VACIO[filtro]}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
