// HU-13 · Branding de la sede (ZARU-14): logo y colores con vista previa antes de guardar.
// CA1: la vista previa cambia en vivo con el logo y los colores elegidos, sin guardar nada.
// CA2: al guardar, el panel aplica el branding (Layout.jsx) y queda disponible para el cliente final.
// CA3: un archivo de otro formato o de más de 2 MB se rechaza aquí y en la API, indicando los requisitos.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../services/api.js';
import { useRol } from '../hooks/useRol.js';
import { useFocoEnError } from '../hooks/useFocoEnError.js';
import { REQUISITOS_LOGO, CONTRASTE_MINIMO, validarLogo, validarColor, contrasteConBlanco, tonoLegible } from '../lib/validacionBranding.js';
import MensajeError from '../components/MensajeError.jsx';
import Notificacion from '../components/Notificacion.jsx';
import VistaPreviaBranding from '../components/VistaPreviaBranding.jsx';
import Cargando from '../components/Cargando.jsx';

const COLORES = [
  { clave: 'primario', columna: 'color_primario', campoApi: 'colorPrimario', etiqueta: 'Color primario', uso: 'Encabezado y botones' },
  { clave: 'secundario', columna: 'color_secundario', campoApi: 'colorSecundario', etiqueta: 'Color secundario', uso: 'Avance del servicio y detalles' },
];
const SIN_CAMBIOS = { logo: null, primario: null, secundario: null };

export default function Branding() {
  const { establecimiento, setEstablecimiento, errorEstablecimiento } = useOutletContext();
  const rol = useRol();
  const formulario = useRef(null);
  const entradaLogo = useRef(null);
  const [borrador, setBorrador] = useState(SIN_CAMBIOS);
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [intentos, setIntentos] = useState(0);
  const [confirmacion, setConfirmacion] = useState(null);
  const cerrarConfirmacion = useCallback(() => setConfirmacion(null), []);
  useFocoEnError(formulario, intentos);

  // La URL temporal del logo elegido se libera al cambiarlo o al salir de la página.
  useEffect(() => () => borrador.logo && URL.revokeObjectURL(borrador.logo.url), [borrador.logo]);

  if (!establecimiento) {
    return (
      <section>
        <h2>Branding</h2>
        {errorEstablecimiento ? (
          <div className="aviso aviso-error" role="alert">
            <p>{errorEstablecimiento}</p>
          </div>
        ) : (
          <Cargando texto="Cargando el branding de la sede…" className="tarjeta cargando-bloque" />
        )}
      </section>
    );
  }

  const esAdmin = rol === 'admin';
  const color = (clave) => borrador[clave] ?? establecimiento[COLORES.find((c) => c.clave === clave).columna] ?? '';
  const colorCambiado = (c) => borrador[c.clave] !== null && borrador[c.clave] !== establecimiento[c.columna];
  const hayCambios = Boolean(borrador.logo) || COLORES.some(colorCambiado);
  const primario = color('primario');
  // El aviso desaparece apenas el color alcanza el contraste mínimo.
  const contraste = validarColor(primario, '') ? null : contrasteConBlanco(primario);
  const contrasteBajo = contraste !== null && contraste < CONTRASTE_MINIMO;

  async function elegirLogo(evento) {
    const archivo = evento.target.files[0];
    if (!archivo) return;
    const error = await validarLogo(archivo);
    if (error) {
      evento.target.value = ''; // Así se puede volver a elegir el mismo archivo después de corregirlo.
      setErrores((e) => ({ ...e, logo: error }));
      return;
    }
    setErrores(({ logo, ...resto }) => resto);
    setBorrador((b) => ({ ...b, logo: { archivo, url: URL.createObjectURL(archivo) } }));
  }

  function cambiarColor(clave, valor) {
    setBorrador((b) => ({ ...b, [clave]: valor.trim().toUpperCase() }));
    setErrores(({ [clave]: _, ...resto }) => resto);
  }

  function descartar() {
    setBorrador(SIN_CAMBIOS);
    setErrores({});
    setErrorGeneral('');
    if (entradaLogo.current) entradaLogo.current.value = '';
  }

  async function guardar(evento) {
    evento.preventDefault();
    setErrorGeneral('');
    const nuevos = {};
    for (const c of COLORES) {
      const error = validarColor(color(c.clave), `El ${c.etiqueta.toLowerCase()}`);
      if (error) nuevos[c.clave] = error;
    }
    setErrores(nuevos);
    setIntentos((n) => n + 1);
    if (Object.keys(nuevos).length) return;

    setEnviando(true);
    try {
      let guardado = establecimiento;
      if (borrador.logo) {
        const datos = new FormData();
        datos.append('logo', borrador.logo.archivo);
        guardado = await api.subir('/establecimiento/logo', datos);
        setEstablecimiento(guardado);
        setBorrador((b) => ({ ...b, logo: null }));
        if (entradaLogo.current) entradaLogo.current.value = '';
      }
      if (COLORES.some(colorCambiado)) {
        guardado = await api.put('/establecimiento/branding', { colorPrimario: color('primario'), colorSecundario: color('secundario') });
        setEstablecimiento(guardado);
      }
      setBorrador(SIN_CAMBIOS);
      setConfirmacion({ id: Date.now(), titulo: 'Branding guardado', detalle: 'Tus clientes verán el logo y los colores nuevos.' });
    } catch (e) {
      // Errores de la API por campo: el logo indica qué falló y los requisitos (CA3).
      const porCampo = {};
      for (const d of e.detalles ?? []) {
        if (d.campo === 'logo') porCampo.logo = e.message;
        const c = COLORES.find((x) => x.campoApi === d.campo);
        if (c) porCampo[c.clave] = d.mensaje;
      }
      setErrores(porCampo);
      if (!Object.keys(porCampo).length) setErrorGeneral(e.message);
      setIntentos((n) => n + 1);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <div className="encabezado">
        <h2>Branding</h2>
      </div>
      <p className="texto-suave">Así verán tus clientes a tu sede cuando sigan el servicio de su vehículo.</p>

      <div className="notificaciones" role="status">
        {confirmacion && <Notificacion key={confirmacion.id} titulo={confirmacion.titulo} detalle={confirmacion.detalle} onCerrar={cerrarConfirmacion} />}
      </div>

      <div className="branding">
        <form ref={formulario} className="tarjeta branding-formulario" onSubmit={guardar} noValidate>
          {rol && !esAdmin && (
            <div className="aviso aviso-info">
              <p>Solo el administrador puede cambiar el branding.</p>
            </div>
          )}
          <fieldset disabled={!esAdmin || enviando}>
            <div className="campo">
              <label htmlFor="logo">Logo</label>
              <p id="logo-ayuda" className="campo-ayuda">{REQUISITOS_LOGO}.</p>
              <div className="campo-control">
                <input
                  ref={entradaLogo}
                  id="logo"
                  type="file"
                  accept="image/png,image/jpeg"
                  aria-invalid={!!errores.logo}
                  aria-describedby={['logo-ayuda', errores.logo && 'logo-error'].filter(Boolean).join(' ')}
                  onChange={elegirLogo}
                />
              </div>
              {errores.logo && (
                <MensajeError id="logo-error">
                  {errores.logo}. {REQUISITOS_LOGO}.
                </MensajeError>
              )}
            </div>

            {COLORES.map((c) => {
              const valor = color(c.clave);
              const idError = errores[c.clave] ? `color-${c.clave}-error` : undefined;
              return (
                <div className="campo" key={c.clave}>
                  <label htmlFor={`color-${c.clave}`}>{c.etiqueta}</label>
                  <p id={`color-${c.clave}-ayuda`} className="campo-ayuda">{c.uso}. Formato #RRGGBB.</p>
                  <div className="campo-control selector-color">
                    <input
                      type="color"
                      aria-label={`Elegir ${c.etiqueta.toLowerCase()}`}
                      value={validarColor(valor, '') ? '#000000' : valor.toLowerCase()}
                      onChange={(e) => cambiarColor(c.clave, e.target.value)}
                    />
                    <input
                      id={`color-${c.clave}`}
                      type="text"
                      maxLength={7}
                      spellCheck={false}
                      value={valor}
                      aria-invalid={!!errores[c.clave]}
                      aria-describedby={[`color-${c.clave}-ayuda`, idError].filter(Boolean).join(' ')}
                      onChange={(e) => cambiarColor(c.clave, e.target.value)}
                    />
                  </div>
                  {errores[c.clave] && <MensajeError id={idError}>{errores[c.clave]}</MensajeError>}
                </div>
              );
            })}

            {contrasteBajo && (
              <div className="aviso aviso-advertencia aviso-contraste" role="status">
                <p>Con este color primario, el texto blanco de los botones puede costar leerlo. Un tono un poco más oscuro se verá mejor.</p>
                {esAdmin && (
                  <button type="button" className="boton secundario boton-tono" onClick={() => cambiarColor('primario', tonoLegible(primario))}>
                    <span className="muestra-color" style={{ background: tonoLegible(primario) }} aria-hidden="true" />
                    Usar este tono
                  </button>
                )}
              </div>
            )}

            {errorGeneral && (
              <div className="aviso aviso-error" role="alert">
                <p>{errorGeneral}</p>
              </div>
            )}

            {esAdmin && (
              <div className="branding-acciones">
                <button type="button" className="boton secundario" disabled={!hayCambios} onClick={descartar}>
                  Descartar cambios
                </button>
                <button className="boton" disabled={!hayCambios} aria-busy={enviando}>
                  {enviando ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            )}
          </fieldset>
        </form>

        <VistaPreviaBranding
          nombre={establecimiento.nombre}
          logoUrl={borrador.logo?.url ?? establecimiento.logo_url}
          colorPrimario={validarColor(primario, '') ? establecimiento.color_primario : primario}
          colorSecundario={validarColor(color('secundario'), '') ? establecimiento.color_secundario : color('secundario')}
          sinGuardar={hayCambios}
        />
      </div>
    </section>
  );
}
