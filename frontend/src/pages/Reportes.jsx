// HU-16 · Reportes (ZARU-16): servicios más demandados y horas de mayor afluencia.
// El administrador elige un rango de fechas; la API calcula los datos del
// establecimiento y aquí solo se presentan. Si no hay órdenes, se muestra el
// aviso de CA3 sin ocultar el filtro para poder consultar otro periodo.
import { useEffect, useState } from 'react';
import { formatoDia } from '../lib/formato.js';
import {
  MENSAJE_SIN_DATOS,
  hoyBogota,
  rangoPredeterminado,
  restarDias,
  validarRango,
} from '../lib/reportes.js';
import { obtenerReporteAfluencia, obtenerReporteServicios } from '../services/reportes.js';
import RankingServicios from '../components/RankingServicios.jsx';
import MapaCalorAfluencia from '../components/MapaCalorAfluencia.jsx';
import Cargando from '../components/Cargando.jsx';

const RANGOS = [
  {
    id: 'hoy',
    texto: 'Hoy',
    calcular: () => {
      const dia = hoyBogota();
      return { desde: dia, hasta: dia };
    },
  },
  {
    id: 'siete-dias',
    texto: 'Últimos 7 días',
    calcular: () => {
      const hasta = hoyBogota();
      return { desde: restarDias(hasta, 6), hasta };
    },
  },
  {
    id: 'mes',
    texto: 'Este mes',
    calcular: () => rangoPredeterminado(),
  },
];

const INICIAL = rangoPredeterminado();

export default function Reportes() {
  const [desde, setDesde] = useState(INICIAL.desde);
  const [hasta, setHasta] = useState(INICIAL.hasta);
  const [rangoAplicado, setRangoAplicado] = useState(INICIAL);
  const [errorRango, setErrorRango] = useState('');
  const [reporteServicios, setReporteServicios] = useState(null);
  const [reporteAfluencia, setReporteAfluencia] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true; // Una respuesta lenta no reemplaza la consulta de otro rango.
    setCargando(true);
    setError('');
    setReporteServicios(null);
    setReporteAfluencia(null);

    Promise.all([
      obtenerReporteServicios(rangoAplicado.desde, rangoAplicado.hasta),
      obtenerReporteAfluencia(rangoAplicado.desde, rangoAplicado.hasta),
    ])
      .then(([servicios, afluencia]) => {
        if (!vigente) return;
        setReporteServicios(servicios);
        setReporteAfluencia(afluencia);
      })
      .catch((fallo) => {
        if (vigente) setError(fallo.message || 'No se pudieron consultar los reportes.');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
    };
  }, [rangoAplicado]);

  function consultar(evento) {
    evento.preventDefault();
    const mensaje = validarRango(desde, hasta);
    if (mensaje) {
      setErrorRango(mensaje);
      return;
    }
    setErrorRango('');
    setRangoAplicado({ desde, hasta });
  }

  function aplicarRango(opcion) {
    const nuevo = opcion.calcular();
    setDesde(nuevo.desde);
    setHasta(nuevo.hasta);
    setErrorRango('');
    setRangoAplicado(nuevo);
  }

  const listo = !cargando && !error && reporteServicios && reporteAfluencia;
  const sinDatos = listo && reporteServicios.totalOrdenes === 0;

  return (
    <section className="reportes">
      <div className="encabezado">
        <div>
          <h2>Reportes</h2>
          <p className="dashboard-subtitulo">
            Consulta los servicios más demandados y las horas de mayor afluencia del establecimiento.
          </p>
        </div>
      </div>

      <form className="tarjeta reporte-filtros" onSubmit={consultar}>
        <div className="reporte-filtros-campos">
          <div className="campo reporte-campo">
            <label htmlFor="reporte-desde">Desde</label>
            <input
              id="reporte-desde"
              type="date"
              value={desde}
              onChange={(evento) => {
                setDesde(evento.target.value);
                setErrorRango('');
              }}
              aria-invalid={Boolean(errorRango)}
              aria-describedby={errorRango ? 'reporte-error-rango' : undefined}
            />
          </div>

          <div className="campo reporte-campo">
            <label htmlFor="reporte-hasta">Hasta</label>
            <input
              id="reporte-hasta"
              type="date"
              value={hasta}
              onChange={(evento) => {
                setHasta(evento.target.value);
                setErrorRango('');
              }}
              aria-invalid={Boolean(errorRango)}
              aria-describedby={errorRango ? 'reporte-error-rango' : undefined}
            />
          </div>

          <button className="boton" type="submit" disabled={cargando} aria-busy={cargando}>
            {cargando ? 'Consultando…' : 'Consultar'}
          </button>
        </div>

        <div className="filtros" role="group" aria-label="Rangos rápidos de consulta">
          {RANGOS.map((opcion) => {
            const rango = opcion.calcular();
            const activo = rango.desde === rangoAplicado.desde && rango.hasta === rangoAplicado.hasta;
            return (
              <button
                key={opcion.id}
                type="button"
                className="filtro"
                aria-pressed={activo}
                onClick={() => aplicarRango(opcion)}
              >
                {opcion.texto}
              </button>
            );
          })}
        </div>

        {errorRango && (
          <p className="error" id="reporte-error-rango" role="alert">
            {errorRango}
          </p>
        )}
      </form>

      <p className="reporte-periodo">
        Periodo consultado: {formatoDia(rangoAplicado.desde)} – {formatoDia(rangoAplicado.hasta)}
      </p>

      {error && (
        <div className="aviso aviso-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="boton secundario"
            onClick={() => setRangoAplicado({ ...rangoAplicado })}
          >
            Reintentar
          </button>
        </div>
      )}

      {cargando && (
        <Cargando texto="Consultando reportes del periodo…" className="tarjeta cargando-bloque" />
      )}

      {sinDatos && (
        <div className="aviso aviso-info reporte-vacio" role="status">
          <p>{MENSAJE_SIN_DATOS}</p>
        </div>
      )}

      {listo && !sinDatos && (
        <>
          <RankingServicios
            servicios={reporteServicios.servicios}
            totalOrdenes={reporteServicios.totalOrdenes}
          />
          <MapaCalorAfluencia reporte={reporteAfluencia} />
        </>
      )}
    </section>
  );
}
