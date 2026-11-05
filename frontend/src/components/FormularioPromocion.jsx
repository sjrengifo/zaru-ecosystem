// HU-12 CA1 · Crear o editar una promoción con varios servicios del catálogo (ZARU-13).
import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { formatoMoneda } from '../lib/formato.js';
import { hoyBogota, validarPromocion } from '../lib/validacionPromocion.js';
import { useFocoEnError } from '../hooks/useFocoEnError.js';
import Modal from './Modal.jsx';
import CampoTexto from './CampoTexto.jsx';
import MensajeError from './MensajeError.jsx';
import PieFormulario from './PieFormulario.jsx';
import Cargando from './Cargando.jsx';

const CAMPOS = ['nombre', 'descripcion', 'condiciones', 'descuentoPct', 'fechaInicio', 'fechaFin', 'servicioIds'];

const desdePromocion = (p) =>
  p
    ? {
        nombre: p.nombre,
        descripcion: p.descripcion ?? '',
        condiciones: p.condiciones ?? '',
        descuentoPct: String(Number(p.descuento_pct)),
        fechaInicio: p.fecha_inicio,
        fechaFin: p.fecha_fin,
        servicioIds: p.servicios.map((s) => s.id),
      }
    : { nombre: '', descripcion: '', condiciones: '', descuentoPct: '', fechaInicio: hoyBogota(), fechaFin: '', servicioIds: [] };

/** `promocion` null → crear; con valor → editar. */
export default function FormularioPromocion({ promocion, onGuardada, onCancelar }) {
  const inicial = useRef(desdePromocion(promocion));
  const [datos, setDatos] = useState(inicial.current);
  const [servicios, setServicios] = useState(null);
  const [errorServicios, setErrorServicios] = useState('');
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const [intentos, setIntentos] = useState(0);
  const formulario = useRef(null);
  const nueva = !promocion;

  useFocoEnError(formulario, intentos);

  useEffect(() => {
    let vigente = true;
    api
      .get('/servicios')
      .then((lista) => vigente && setServicios(lista))
      .catch((e) => vigente && setErrorServicios(e.message));
    return () => {
      vigente = false;
    };
  }, []);

  // Se ofrecen los servicios activos y, al editar, también los ya elegidos aunque luego se hayan desactivado.
  const opciones = (servicios ?? []).filter((s) => s.activo || datos.servicioIds.includes(s.id));

  function cambiar(campo, valor) {
    setDatos((d) => ({ ...d, [campo]: valor }));
    setErrores(({ [campo]: _, ...resto }) => resto);
  }

  function alternarServicio(id) {
    cambiar('servicioIds', datos.servicioIds.includes(id) ? datos.servicioIds.filter((x) => x !== id) : [...datos.servicioIds, id]);
  }

  function intentarCerrar() {
    if (enviando) return;
    if (JSON.stringify(datos) !== JSON.stringify(inicial.current)) setConfirmarDescarte(true);
    else onCancelar();
  }

  async function guardar(e) {
    e.preventDefault();
    setErrorGeneral('');
    const encontrados = validarPromocion(datos, { nueva });
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return setIntentos((n) => n + 1);

    const cuerpo = { ...datos, descuentoPct: Number(datos.descuentoPct) };
    setEnviando(true);
    try {
      onGuardada(nueva ? await api.post('/promociones', cuerpo) : await api.patch(`/promociones/${promocion.id}`, cuerpo));
    } catch (err) {
      const porCampo = Object.fromEntries((err.detalles ?? []).filter((d) => CAMPOS.includes(d.campo)).map((d) => [d.campo, d.mensaje]));
      setErrores(porCampo);
      if (Object.keys(porCampo).length === 0) setErrorGeneral(err.message);
      setIntentos((n) => n + 1);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={nueva ? 'Nueva promoción' : 'Editar promoción'} onCerrar={intentarCerrar}>
      <form ref={formulario} onSubmit={guardar} noValidate>
        <div className="modal-cuerpo">
          <p className="texto-suave leyenda">
            Los campos con <span className="obligatorio">*</span> son obligatorios. La promoción se aplica sola a las órdenes durante su vigencia.
          </p>

          <CampoTexto
            id="promocion-nombre"
            etiqueta="Nombre"
            obligatorio
            data-foco-inicial
            maxLength={80}
            value={datos.nombre}
            error={errores.nombre}
            onChange={(e) => cambiar('nombre', e.target.value)}
          />

          <CampoTexto
            id="promocion-descuento"
            etiqueta="Descuento (%)"
            obligatorio
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            step={1}
            ayuda="Un número entero entre 1 y 100."
            value={datos.descuentoPct}
            error={errores.descuentoPct}
            onChange={(e) => cambiar('descuentoPct', e.target.value)}
          />

          <div className="campos-fila">
            <CampoTexto
              id="promocion-inicio"
              etiqueta="Desde"
              obligatorio
              type="date"
              value={datos.fechaInicio}
              error={errores.fechaInicio}
              onChange={(e) => cambiar('fechaInicio', e.target.value)}
            />
            <CampoTexto
              id="promocion-fin"
              etiqueta="Hasta"
              obligatorio
              type="date"
              min={datos.fechaInicio || undefined}
              ayuda="Incluido. Al día siguiente deja de aplicarse sola."
              value={datos.fechaFin}
              error={errores.fechaFin}
              onChange={(e) => cambiar('fechaFin', e.target.value)}
            />
          </div>

          <fieldset className="grupo-opciones">
            <legend>
              Servicios a los que aplica <span className="obligatorio" aria-hidden="true">*</span>
            </legend>
            {servicios === null && !errorServicios && <Cargando texto="Cargando el catálogo…" />}
            {errorServicios && <MensajeError id="promocion-servicios-carga">{errorServicios}</MensajeError>}
            {servicios && opciones.length === 0 && (
              <p className="texto-suave">El catálogo no tiene servicios activos. Agrégalos primero en Servicios.</p>
            )}
            <div className="lista-servicios" aria-describedby={errores.servicioIds ? 'promocion-servicios-error' : undefined}>
              {opciones.map((s, i) => (
                <label key={s.id} className="casilla">
                  <input
                    type="checkbox"
                    checked={datos.servicioIds.includes(s.id)}
                    aria-invalid={!!errores.servicioIds}
                    data-foco-error={errores.servicioIds && i === 0 ? true : undefined}
                    onChange={() => alternarServicio(s.id)}
                  />
                  <span>
                    {s.nombre} <span className="texto-suave">· {formatoMoneda(s.precio)}</span>
                    {!s.activo && <span className="texto-suave"> (inactivo)</span>}
                  </span>
                </label>
              ))}
            </div>
            {errores.servicioIds && <MensajeError id="promocion-servicios-error">{errores.servicioIds}</MensajeError>}
          </fieldset>

          <div className="campo">
            <label htmlFor="promocion-descripcion">
              Descripción <span className="texto-suave">(opcional)</span>
            </label>
            <textarea id="promocion-descripcion" rows={2} maxLength={500} value={datos.descripcion} onChange={(e) => cambiar('descripcion', e.target.value)} />
            {errores.descripcion && <MensajeError id="promocion-descripcion-error">{errores.descripcion}</MensajeError>}
          </div>

          <div className="campo">
            <label htmlFor="promocion-condiciones">
              Condiciones <span className="texto-suave">(opcional)</span>
            </label>
            <textarea
              id="promocion-condiciones"
              rows={2}
              maxLength={500}
              placeholder="Ej.: válida de lunes a viernes"
              value={datos.condiciones}
              onChange={(e) => cambiar('condiciones', e.target.value)}
            />
            {errores.condiciones && <MensajeError id="promocion-condiciones-error">{errores.condiciones}</MensajeError>}
          </div>

          {errorGeneral && (
            <div className="aviso aviso-error" role="alert">
              <p>{errorGeneral}</p>
            </div>
          )}
        </div>

        <PieFormulario
          textoGuardar={nueva ? 'Crear promoción' : 'Guardar cambios'}
          textoDescarte="¿Descartar los cambios de esta promoción?"
          confirmando={confirmarDescarte}
          enviando={enviando}
          onCancelar={intentarCerrar}
          onSeguirEditando={() => {
            setConfirmarDescarte(false);
            formulario.current.querySelector('[data-foco-inicial]').focus();
          }}
          onDescartar={onCancelar}
        />
      </form>
    </Modal>
  );
}
