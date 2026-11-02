// HU-04 CA2 · Editar los datos de contacto de un cliente (ZARU-5).
import { useRef, useState } from 'react';
import { api } from '../services/api.js';
import { limpiarTelefono, validarContacto } from '../lib/validacionCliente.js';
import { useFocoEnError } from '../hooks/useFocoEnError.js';
import Modal from './Modal.jsx';
import CampoTexto from './CampoTexto.jsx';
import AvisoClienteExistente from './AvisoClienteExistente.jsx';
import PieFormulario from './PieFormulario.jsx';

const CAMPOS = ['nombre', 'telefono', 'correo'];

export default function FormularioEditarCliente({ cliente, onGuardado, onAbrirExistente, onCancelar }) {
  const correoOriginal = cliente.correo ?? '';
  const [nombre, setNombre] = useState(cliente.nombre);
  const [telefono, setTelefono] = useState(cliente.telefono);
  const [correo, setCorreo] = useState(correoOriginal);
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [existente, setExistente] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const [intentos, setIntentos] = useState(0);
  const formulario = useRef(null);

  useFocoEnError(formulario, intentos);

  /** Solo se envía lo que cambió. Un cliente antiguo sin correo puede actualizar lo demás sin agregarlo. */
  function cambios() {
    const actuales = { nombre: nombre.trim(), telefono: limpiarTelefono(telefono), correo: correo.trim() };
    const originales = { nombre: cliente.nombre, telefono: cliente.telefono, correo: correoOriginal };
    return Object.fromEntries(CAMPOS.filter((c) => actuales[c] !== originales[c]).map((c) => [c, actuales[c]]));
  }

  function quitarError(campo) {
    setErrores(({ [campo]: _, ...resto }) => resto);
  }

  function intentarCerrar() {
    if (enviando) return;
    if (Object.keys(cambios()).length > 0) setConfirmarDescarte(true);
    else onCancelar();
  }

  function mostrarError(e) {
    const detalles = Array.isArray(e.detalles) ? e.detalles : [];
    const conCliente = detalles.find((d) => d.clienteId);
    if (conCliente) return setExistente({ id: conCliente.clienteId, mensaje: conCliente.mensaje });

    const porCampo = Object.fromEntries(detalles.filter((d) => CAMPOS.includes(d.campo)).map((d) => [d.campo, d.mensaje]));
    setErrores(porCampo);
    if (Object.keys(porCampo).length === 0) setErrorGeneral(e.message);
  }

  async function guardar(e) {
    e.preventDefault();
    setErrorGeneral('');
    setExistente(null);

    const encontrados = validarContacto({ nombre, telefono, correo }, { correoObligatorio: !!cliente.correo });
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return setIntentos((n) => n + 1);

    const datos = cambios();
    if (Object.keys(datos).length === 0) return onCancelar();

    setEnviando(true);
    try {
      onGuardado(await api.put(`/clientes/${cliente.id}`, datos));
    } catch (err) {
      mostrarError(err);
      setIntentos((n) => n + 1);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Editar cliente" onCerrar={intentarCerrar}>
      <form ref={formulario} onSubmit={guardar} noValidate>
        <div className="modal-cuerpo">
          <p className="texto-suave leyenda">Los campos con <span className="obligatorio">*</span> son obligatorios.</p>

          <CampoTexto
            id="editar-nombre"
            etiqueta="Nombre completo"
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
            id="editar-telefono"
            etiqueta="Celular"
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
            id="editar-correo"
            etiqueta="Correo"
            obligatorio={!!cliente.correo}
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

          {errorGeneral && (
            <div className="aviso aviso-error" role="alert">
              <p>{errorGeneral}</p>
            </div>
          )}
        </div>

        <PieFormulario
          textoGuardar="Guardar cambios"
          textoDescarte="¿Descartar los cambios?"
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
