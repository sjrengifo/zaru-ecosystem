// HU-03 · Registrar cliente con autorización de datos (ZARU-4) y HU-51 CA1: la política se muestra antes de aceptar.
import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { limpiarTelefono, validarContacto } from '../lib/validacionCliente.js';
import { useFocoEnError } from '../hooks/useFocoEnError.js';
import Modal from './Modal.jsx';
import CampoTexto from './CampoTexto.jsx';
import MensajeError from './MensajeError.jsx';
import Icono from './Icono.jsx';
import AvisoClienteExistente from './AvisoClienteExistente.jsx';
import PieFormulario from './PieFormulario.jsx';

const CAMPOS = ['nombre', 'telefono', 'correo', 'autorizacionDatos'];

function validar({ autoriza, ...contacto }) {
  const errores = validarContacto(contacto);
  if (!autoriza) errores.autorizacionDatos = 'La autorización de tratamiento de datos es obligatoria (Ley 1581 de 2012)';
  return errores;
}

/** La política se publica en Markdown: se muestran sus títulos y párrafos; el título principal ya está en el encabezado. */
function parrafosPolitica(contenido) {
  return contenido
    .split('\n')
    .filter((linea) => linea.trim() && !linea.startsWith('# '))
    .map((linea, i) => {
      const texto = linea.replace(/\*\*/g, '').replace(/^#+\s*/, '');
      return linea.startsWith('#') ? <p key={i} className="politica-subtitulo">{texto}</p> : <p key={i}>{texto}</p>;
    });
}

export default function FormularioCliente({ onCreado, onAbrirExistente, onCancelar }) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [autoriza, setAutoriza] = useState(false);
  const [politica, setPolitica] = useState(null);
  const [errorPolitica, setErrorPolitica] = useState('');
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [existente, setExistente] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const [intentos, setIntentos] = useState(0);
  const formulario = useRef(null);

  function cargarPolitica() {
    setErrorPolitica('');
    return api
      .get('/politicas-datos/vigente')
      .then(setPolitica)
      .catch(() => {
        setPolitica(null);
        setErrorPolitica('No se pudo cargar la política de tratamiento de datos.');
      });
  }

  useEffect(() => {
    cargarPolitica();
  }, []);

  useFocoEnError(formulario, intentos);

  function quitarError(campo) {
    setErrores(({ [campo]: _, ...resto }) => resto);
  }

  function intentarCerrar() {
    const hayDatos = nombre || telefono || correo || autoriza;
    if (hayDatos && !enviando) setConfirmarDescarte(true);
    else if (!enviando) onCancelar();
  }

  function mostrarError(e) {
    const detalles = Array.isArray(e.detalles) ? e.detalles : [];
    const conCliente = detalles.find((d) => d.clienteId);

    // CA3: el teléfono ya existe; se ofrece abrir ese cliente.
    if (conCliente) return setExistente({ id: conCliente.clienteId, mensaje: conCliente.mensaje });

    // HU-51: la política cambió mientras se llenaba el formulario; hay que leer y aceptar la nueva.
    if (detalles.some((d) => d.campo === 'politicaVersion')) {
      setAutoriza(false);
      setErrores({ autorizacionDatos: 'La política de datos cambió. Léela y autoriza de nuevo.' });
      return cargarPolitica();
    }

    const porCampo = Object.fromEntries(detalles.filter((d) => CAMPOS.includes(d.campo)).map((d) => [d.campo, d.mensaje]));
    setErrores(porCampo);
    if (Object.keys(porCampo).length === 0) setErrorGeneral(e.message);
  }

  async function guardar(e) {
    e.preventDefault();
    setErrorGeneral('');
    setExistente(null);

    // CA2: sin autorización los datos personales ni siquiera salen del navegador.
    const encontrados = validar({ nombre, telefono, correo, autoriza });
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return setIntentos((n) => n + 1);

    setEnviando(true);
    try {
      const cliente = await api.post('/clientes', {
        nombre,
        telefono: limpiarTelefono(telefono),
        correo,
        autorizacionDatos: true,
        politicaVersion: politica.version,
      });
      onCreado(cliente);
    } catch (err) {
      mostrarError(err);
      setIntentos((n) => n + 1);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Nuevo cliente" onCerrar={intentarCerrar}>
      {/* noValidate: los errores se muestran junto a cada campo y con el mismo texto en todos los navegadores. */}
      <form ref={formulario} onSubmit={guardar} noValidate>
        <div className="modal-cuerpo perfil">
          <section className="perfil-tarjeta" aria-labelledby="cliente-contacto-titulo">
            <div className="perfil-encabezado">
              <h4 id="cliente-contacto-titulo">Datos de contacto</h4>
              <span className="texto-suave nota-obligatorios">
                <span className="obligatorio">*</span> Obligatorio
              </span>
            </div>

          {/* autoComplete off: quien escribe registra los datos de otra persona, no los suyos. */}
          <CampoTexto
            id="cliente-nombre"
            etiqueta="Nombre completo"
            icono={<Icono nombre="persona" />}
            obligatorio
            data-foco-inicial
            autoComplete="off"
            value={nombre}
            error={errores.nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              quitarError('nombre');
            }}
          />

          <CampoTexto
            id="cliente-telefono"
            etiqueta="Celular"
            icono={<Icono nombre="telefono" />}
            obligatorio
            ayuda="10 dígitos, empieza por 3. Ejemplo: 300 123 4567"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={telefono}
            error={errores.telefono}
            onChange={(e) => {
              setTelefono(e.target.value);
              quitarError('telefono');
              setExistente(null);
            }}
          />

          {existente && <AvisoClienteExistente mensaje={existente.mensaje} onAbrir={() => onAbrirExistente(existente.id)} />}

          <CampoTexto
            id="cliente-correo"
            etiqueta="Correo"
            icono={<Icono nombre="correo" />}
            obligatorio
            ayuda="Aquí le enviaremos los avisos del servicio."
            type="email"
            autoComplete="off"
            value={correo}
            error={errores.correo}
            onChange={(e) => {
              setCorreo(e.target.value);
              quitarError('correo');
            }}
          />
          </section>

          <section className="perfil-tarjeta" aria-labelledby="politica-titulo">
            <div className="perfil-encabezado">
              <h4 id="politica-titulo">
                Autorización de datos <span className="obligatorio" aria-hidden="true">*</span>
              </h4>
              {politica && <span className="texto-suave nota-obligatorios">Versión {politica.version}</span>}
            </div>

            {politica && (
              <>
                <div className="politica" tabIndex={0} role="region" aria-label="Texto de la política de tratamiento de datos">
                  {parrafosPolitica(politica.contenido)}
                </div>
              </>
            )}
            {!politica && !errorPolitica && <p className="texto-suave" role="status">Cargando la política…</p>}
            {errorPolitica && (
              <div className="aviso aviso-error" role="alert">
                <p>{errorPolitica}</p>
                <button type="button" className="boton secundario" onClick={cargarPolitica}>
                  Reintentar
                </button>
              </div>
            )}

            <div className={`casilla${errores.autorizacionDatos ? ' casilla-invalida' : ''}`}>
              <input
                id="cliente-autoriza"
                type="checkbox"
                checked={autoriza}
                disabled={!politica}
                aria-required="true"
                aria-invalid={!!errores.autorizacionDatos}
                aria-describedby={errores.autorizacionDatos ? 'cliente-autoriza-error' : undefined}
                onChange={(e) => {
                  setAutoriza(e.target.checked);
                  quitarError('autorizacionDatos');
                }}
              />
              <label htmlFor="cliente-autoriza">
                El titular autoriza el tratamiento de sus datos personales según esta política (Ley 1581 de 2012).
              </label>
            </div>
            {errores.autorizacionDatos && <MensajeError id="cliente-autoriza-error">{errores.autorizacionDatos}</MensajeError>}
          </section>

          {errorGeneral && (
            <div className="aviso aviso-error" role="alert">
              <p>{errorGeneral}</p>
            </div>
          )}
        </div>

        <PieFormulario
          textoGuardar="Guardar cliente"
          textoDescarte="¿Descartar los datos de este cliente?"
          confirmando={confirmarDescarte}
          enviando={enviando}
          deshabilitado={!politica}
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
