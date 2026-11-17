// HU-32 — Plantillas de notificación con la marca de la sede (ZARU-21 · RF-F7-01 a RF-F7-05).
// Solo el administrador (módulo "notificaciones").
//   CA1: elige el estado y el canal, edita el texto e inserta variables con botones.
//   CA2: en SMS, contador en vivo; con más de una parte avisa cuántas y que costará más, y explica
//        por qué con tildes el límite por parte es 70 y no 160.
//   CA3: "Vista previa" muestra push, SMS y correo con datos de ejemplo y la marca de la sede.
//   CA4: una variable inexistente o mal escrita se resalta en el texto y bloquea el guardado
//        (y si llegara a la API, el 400 también la resalta).
// Si la sede no personalizó una plantilla, se ve y se usa la de la plataforma (RF-F7-05).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Eye, RotateCcw, Save } from 'lucide-react';
import Cargando from '../components/Cargando.jsx';
import MensajeError from '../components/MensajeError.jsx';
import Notificacion from '../components/Notificacion.jsx';
import VistaPreviaPlantilla from '../components/VistaPreviaPlantilla.jsx';
import { guardarPlantilla, listarPlantillas, restaurarPlantilla, vistaPreviaPlantilla } from '../services/plantillas.js';
import {
  ETIQUETA_ASUNTO,
  NOMBRE_CANAL,
  avisoPartes,
  contarSms,
  explicacionTildes,
  insertarVariable,
  largo,
  partesResaltadas,
  textoPartes,
  validarPlantilla,
} from '../lib/plantillas.js';
import '../styles/plantillas.css';

const clave = (estado, canal) => `${estado}/${canal}`;

/** Errores del 400 de la API que señalan una variable (por si la validación del navegador no la vio). */
const erroresDeApi = (detalles = [], campo) => detalles.filter((d) => d.campo === campo && d.variable && Number.isInteger(d.posicion));

function ListaErrores({ id, errores, onCorregir }) {
  if (!errores.length) return null;
  return (
    <ul id={id} className="plantilla-errores" role="alert">
      {errores.map((e) => (
        <li key={`${e.posicion}-${e.variable}`}>
          <MensajeError>
            Línea {e.linea}, columna {e.columna}: {e.mensaje}
          </MensajeError>
          {e.sugerencia && (
            <button type="button" className="boton secundario boton-pequeno" onClick={() => onCorregir(e)}>
              Cambiar por {e.sugerencia}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Texto con las variables inválidas resaltadas detrás del campo (CA4). */
function CampoConResaltado({ id, valor, errores, onChange, campoRef, filas = 6, multilinea = true, ...props }) {
  const espejo = useRef(null);
  const partes = partesResaltadas(valor, errores);
  const sincronizar = (e) => {
    if (espejo.current) {
      espejo.current.scrollTop = e.target.scrollTop;
      espejo.current.scrollLeft = e.target.scrollLeft;
    }
  };
  const Campo = multilinea ? 'textarea' : 'input';
  return (
    <div className={`campo-control plantilla-editor${multilinea ? '' : ' plantilla-editor-linea'}`}>
      <div ref={espejo} className="plantilla-resaltado" aria-hidden="true" data-testid={`resaltado-${id}`}>
        {partes.map((p, i) => (p.invalida ? <mark key={i}>{p.texto}</mark> : <span key={i}>{p.texto}</span>))}
        {'\n'}
      </div>
      <Campo
        id={id}
        ref={campoRef}
        value={valor}
        rows={multilinea ? filas : undefined}
        spellCheck="false"
        onChange={(e) => onChange(e.target.value)}
        onScroll={sincronizar}
        aria-invalid={errores.length > 0}
        {...props}
      />
    </div>
  );
}

function ContadorSms({ cuerpo }) {
  const conteo = contarSms(cuerpo);
  const aviso = avisoPartes(conteo.segmentos);
  const tildes = conteo.codificacion === 'UCS-2' ? explicacionTildes(conteo.caracteresEspeciales) : null;
  return (
    <div className="plantilla-contador" role="status" aria-live="polite">
      <p className={`plantilla-contador-numeros${conteo.segmentos > 1 ? ' plantilla-contador-exceso' : ''}`}>
        <strong>{conteo.caracteres}</strong> caracteres · {textoPartes(conteo.segmentos || 1)}
        {conteo.segmentos <= 1 && <span className="texto-suave"> · caben {conteo.limitePorParte} por parte</span>}
      </p>
      {aviso && <p className="aviso aviso-advertencia">{aviso}</p>}
      {tildes && <p className="aviso aviso-info">{tildes}</p>}
      <p className="campo-ayuda">
        Las variables se reemplazan por los datos reales, así que el mensaje final puede quedar más largo o más corto. La vista previa
        muestra el conteo con datos de ejemplo.
      </p>
    </div>
  );
}

export default function PlantillasNotificacion() {
  const [datos, setDatos] = useState(null);
  const [errorCarga, setErrorCarga] = useState(null);
  const [recargas, setRecargas] = useState(0);
  const [estado, setEstado] = useState('listo');
  const [canal, setCanal] = useState('sms');
  const [borradores, setBorradores] = useState({});
  const [erroresServidor, setErroresServidor] = useState({});
  const [errorAccion, setErrorAccion] = useState('');
  const [ocupado, setOcupado] = useState(null); // 'guardar' | 'restaurar' | 'previa'
  const [previa, setPrevia] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);
  const cerrarConfirmacion = useCallback(() => setConfirmacion(null), []);
  const campoCuerpo = useRef(null);
  const cursorPendiente = useRef(null);

  useEffect(() => {
    let vigente = true;
    setErrorCarga(null);
    listarPlantillas()
      .then((respuesta) => vigente && setDatos(respuesta))
      .catch((error) => vigente && setErrorCarga(error));
    return () => {
      vigente = false;
    };
  }, [recargas]);

  // Después de insertar una variable, el cursor queda justo después de ella.
  useLayoutEffect(() => {
    if (cursorPendiente.current === null || !campoCuerpo.current) return;
    campoCuerpo.current.focus();
    campoCuerpo.current.setSelectionRange(cursorPendiente.current, cursorPendiente.current);
    cursorPendiente.current = null;
  });

  if (!datos) {
    return (
      <section>
        <div className="encabezado">
          <h2>Plantillas de notificación</h2>
        </div>
        {errorCarga ? (
          <div className="aviso aviso-error" role="alert">
            <p>No pudimos cargar las plantillas. {errorCarga.message}</p>
            <button type="button" className="boton secundario" onClick={() => setRecargas((n) => n + 1)}>Reintentar</button>
          </div>
        ) : (
          <Cargando texto="Cargando plantillas…" className="tarjeta cargando-bloque" />
        )}
      </section>
    );
  }

  const k = clave(estado, canal);
  const etiquetaEstado = datos.estados.find((e) => e.valor === estado)?.etiqueta ?? estado;
  const actual = datos.plantillas.find((p) => p.estado === estado && p.canal === canal);
  const borrador = borradores[k] ?? { asunto: actual?.asunto ?? '', cuerpo: actual?.cuerpo ?? '' };
  const usaAsunto = canal !== 'sms';
  const hayCambios = borrador.cuerpo !== (actual?.cuerpo ?? '') || (usaAsunto && borrador.asunto !== (actual?.asunto ?? ''));
  const limite = datos.limites?.[canal] ?? Infinity;
  const largoCuerpo = largo(borrador.cuerpo);
  const excedeLimite = largoCuerpo > limite;
  const vacio = !borrador.cuerpo.trim();

  const erroresCuerpoLocal = validarPlantilla(borrador.cuerpo);
  const erroresAsuntoLocal = usaAsunto ? validarPlantilla(borrador.asunto) : [];
  const erroresCuerpo = erroresCuerpoLocal.length ? erroresCuerpoLocal : erroresDeApi(erroresServidor[k], 'cuerpo');
  const erroresAsunto = erroresAsuntoLocal.length ? erroresAsuntoLocal : erroresDeApi(erroresServidor[k], 'asunto');
  const hayErrores = erroresCuerpo.length > 0 || erroresAsunto.length > 0 || excedeLimite || vacio;
  const previaActual = previa?.clave === k ? previa : null;
  const previaDesactualizada = previaActual && (previaActual.cuerpo !== borrador.cuerpo || previaActual.asunto !== borrador.asunto);
  const personalizadas = new Set(datos.plantillas.filter((p) => p.personalizada).map((p) => clave(p.estado, p.canal)));

  function cambiarBorrador(cambios) {
    setBorradores((b) => ({ ...b, [k]: { ...borrador, ...cambios } }));
    setErroresServidor(({ [k]: _, ...resto }) => resto);
    setErrorAccion('');
  }

  function insertar(variable) {
    const campo = campoCuerpo.current;
    const inicio = campo?.selectionStart ?? borrador.cuerpo.length;
    const fin = campo?.selectionEnd ?? inicio;
    const { texto, cursor } = insertarVariable(borrador.cuerpo, variable, inicio, fin);
    cursorPendiente.current = cursor;
    cambiarBorrador({ cuerpo: texto });
  }

  function corregir(campo, error) {
    const texto = borrador[campo];
    cambiarBorrador({ [campo]: texto.slice(0, error.posicion) + error.sugerencia + texto.slice(error.posicion + error.longitud) });
  }

  function reemplazarPlantilla(plantilla) {
    setDatos((d) => ({
      ...d,
      plantillas: d.plantillas.map((p) => (p.estado === plantilla.estado && p.canal === plantilla.canal ? { ...p, ...plantilla } : p)),
    }));
    setBorradores(({ [k]: _, ...resto }) => resto);
  }

  function manejarError(error) {
    if (error.status === 400 && error.detalles?.some((d) => d.variable)) {
      setErroresServidor((e) => ({ ...e, [k]: error.detalles }));
    }
    setErrorAccion(error.message || 'No se pudo completar la acción');
  }

  async function guardar(evento) {
    evento.preventDefault();
    if (hayErrores || !hayCambios) return;
    setOcupado('guardar');
    setErrorAccion('');
    try {
      const guardada = await guardarPlantilla(estado, canal, { asunto: usaAsunto ? borrador.asunto : null, cuerpo: borrador.cuerpo });
      reemplazarPlantilla(guardada);
      setConfirmacion({
        id: Date.now(),
        titulo: 'Plantilla guardada',
        detalle: guardada.advertencias?.[0] ?? `${NOMBRE_CANAL[canal]} · ${etiquetaEstado}`,
      });
    } catch (error) {
      manejarError(error);
    } finally {
      setOcupado(null);
    }
  }

  async function restaurar() {
    setOcupado('restaurar');
    setErrorAccion('');
    try {
      reemplazarPlantilla(await restaurarPlantilla(estado, canal));
      setPrevia(null);
      setConfirmacion({ id: Date.now(), titulo: 'Volviste al texto de la plataforma', detalle: `${NOMBRE_CANAL[canal]} · ${etiquetaEstado}` });
    } catch (error) {
      manejarError(error);
    } finally {
      setOcupado(null);
    }
  }

  async function verPrevia() {
    setOcupado('previa');
    setErrorAccion('');
    try {
      const respuesta = await vistaPreviaPlantilla({ estado, canal, asunto: usaAsunto ? borrador.asunto : null, cuerpo: borrador.cuerpo });
      setPrevia({ clave: k, cuerpo: borrador.cuerpo, asunto: borrador.asunto, datos: respuesta });
    } catch (error) {
      manejarError(error);
    } finally {
      setOcupado(null);
    }
  }

  const descripcionVariable = Object.fromEntries(datos.variables.map((v) => [v.nombre, v.descripcion]));

  return (
    <section className="plantillas">
      <div className="encabezado">
        <h2>Plantillas de notificación</h2>
      </div>
      <p className="texto-suave">
        Personaliza el texto que reciben tus clientes en cada estado de su vehículo. Si no cambias una plantilla, se usa el texto de Zaru.
      </p>

      <div className="notificaciones" role="status">
        {confirmacion && <Notificacion key={confirmacion.id} titulo={confirmacion.titulo} detalle={confirmacion.detalle} onCerrar={cerrarConfirmacion} />}
      </div>

      <form className="tarjeta plantillas-formulario" onSubmit={guardar} noValidate>
        <div className="plantillas-selectores">
          <div className="campo">
            <label htmlFor="plantilla-estado">Estado del vehículo</label>
            <div className="campo-control">
              <select id="plantilla-estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
                {datos.estados.map((e) => (
                  <option key={e.valor} value={e.valor}>{e.etiqueta}</option>
                ))}
              </select>
            </div>
          </div>
          <fieldset className="grupo-opciones">
            <legend>Canal</legend>
            <div className="opciones">
              {datos.canales.map((c) => (
                <label key={c} className="opcion">
                  <input type="radio" name="canal" value={c} checked={canal === c} onChange={() => setCanal(c)} />
                  {NOMBRE_CANAL[c]}
                  {personalizadas.has(clave(estado, c)) && <span className="insignia insignia-ok">Propia</span>}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <p className="plantilla-origen">
          {actual?.personalizada ? (
            <span className="insignia insignia-ok">Personalizada por tu sede</span>
          ) : (
            <span className="insignia insignia-retirada">Texto de la plataforma</span>
          )}
          {hayCambios && <span className="etiqueta-sin-guardar">Cambios sin guardar</span>}
        </p>

        {usaAsunto && (
          <div className="campo">
            <label htmlFor="plantilla-asunto">{ETIQUETA_ASUNTO[canal]}</label>
            <CampoConResaltado
              id="plantilla-asunto"
              multilinea={false}
              valor={borrador.asunto}
              errores={erroresAsunto}
              maxLength={datos.limites?.asunto}
              onChange={(asunto) => cambiarBorrador({ asunto })}
              aria-describedby={erroresAsunto.length ? 'plantilla-asunto-errores' : undefined}
            />
            <ListaErrores id="plantilla-asunto-errores" errores={erroresAsunto} onCorregir={(e) => corregir('asunto', e)} />
          </div>
        )}

        <div className="campo">
          <label htmlFor="plantilla-cuerpo">Texto del mensaje</label>
          <div className="plantilla-variables" role="group" aria-label="Insertar variable">
            <span className="campo-ayuda">Insertar:</span>
            {datos.variables.map((v) => (
              <button
                key={v.nombre}
                type="button"
                className="boton secundario boton-pequeno plantilla-variable"
                title={descripcionVariable[v.nombre]}
                aria-label={`Insertar {${v.nombre}}: ${descripcionVariable[v.nombre]}`}
                onClick={() => insertar(v.nombre)}
              >
                {`{${v.nombre}}`}
              </button>
            ))}
          </div>
          <CampoConResaltado
            id="plantilla-cuerpo"
            campoRef={campoCuerpo}
            filas={canal === 'correo' ? 9 : 5}
            valor={borrador.cuerpo}
            errores={erroresCuerpo}
            onChange={(cuerpo) => cambiarBorrador({ cuerpo })}
            aria-describedby={['plantilla-cuerpo-contador', erroresCuerpo.length && 'plantilla-cuerpo-errores'].filter(Boolean).join(' ')}
          />
          <ListaErrores id="plantilla-cuerpo-errores" errores={erroresCuerpo} onCorregir={(e) => corregir('cuerpo', e)} />
          <div id="plantilla-cuerpo-contador">
            {canal === 'sms' ? (
              <ContadorSms cuerpo={borrador.cuerpo} />
            ) : (
              <p className={`campo-ayuda${excedeLimite ? ' texto-advertencia' : ''}`} role="status">
                {largoCuerpo} / {limite} caracteres
              </p>
            )}
            {excedeLimite && canal === 'sms' && <MensajeError>El SMS puede tener hasta {limite} caracteres.</MensajeError>}
            {vacio && <MensajeError>Escribe el texto del mensaje.</MensajeError>}
          </div>
        </div>

        {errorAccion && (
          <div className="aviso aviso-error" role="alert">
            <p>{errorAccion}</p>
          </div>
        )}

        <div className="plantillas-acciones">
          {actual?.personalizada && (
            <button type="button" className="boton secundario" onClick={restaurar} disabled={Boolean(ocupado)} aria-busy={ocupado === 'restaurar'}>
              <RotateCcw size={16} aria-hidden="true" /> Restaurar texto de la plataforma
            </button>
          )}
          {hayCambios && (
            <button type="button" className="boton secundario" onClick={() => setBorradores(({ [k]: _, ...resto }) => resto)} disabled={Boolean(ocupado)}>
              Descartar cambios
            </button>
          )}
          <button type="button" className="boton secundario" onClick={verPrevia} disabled={hayErrores || Boolean(ocupado)} aria-busy={ocupado === 'previa'}>
            <Eye size={16} aria-hidden="true" /> Vista previa
          </button>
          <button type="submit" className="boton" disabled={hayErrores || !hayCambios || Boolean(ocupado)} aria-busy={ocupado === 'guardar'}>
            <Save size={16} aria-hidden="true" /> Guardar
          </button>
        </div>
        {hayErrores && (erroresCuerpo.length > 0 || erroresAsunto.length > 0) && (
          <div className="plantillas-bloqueo">
            <MensajeError>Corrige las variables resaltadas para poder guardar.</MensajeError>
          </div>
        )}
      </form>

      {previaActual && (
        <section className="tarjeta plantillas-previa" aria-labelledby="plantillas-previa-titulo">
          <h3 id="plantillas-previa-titulo">Vista previa · {etiquetaEstado}</h3>
          {previaDesactualizada && (
            <p className="aviso aviso-info">Hiciste cambios después de esta vista previa. Pulsa “Vista previa” otra vez para actualizarla.</p>
          )}
          <VistaPreviaPlantilla previa={previaActual.datos} />
        </section>
      )}
    </section>
  );
}
