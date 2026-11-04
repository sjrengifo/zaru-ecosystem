// HU-02 — Crear un operario (con invitación) o editar su nombre.
import { useRef, useState } from 'react';
import { api } from '../services/api.js';
import { normalizarCorreo } from '../lib/validacionCorreo.js';
import { usuarioAFormulario, validarUsuario } from '../lib/validacionUsuario.js';
import { useFocoEnError } from '../hooks/useFocoEnError.js';
import Modal from './Modal.jsx';
import CampoTexto from './CampoTexto.jsx';
import PieFormulario from './PieFormulario.jsx';

const CAMPOS = ['nombre', 'correo'];

export default function FormularioUsuario({ usuario, onGuardado, onCancelar }) {
  const [inicial] = useState(() => usuarioAFormulario(usuario));
  const [nombre, setNombre] = useState(inicial.nombre);
  const [correo, setCorreo] = useState(inicial.correo);
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const [intentos, setIntentos] = useState(0);
  const formulario = useRef(null);
  const editando = Boolean(usuario);

  useFocoEnError(formulario, intentos);

  const hayCambios = nombre !== inicial.nombre || (!editando && correo !== inicial.correo);

  function quitarError(campo) {
    setErrores(({ [campo]: _, ...resto }) => resto);
  }

  function intentarCerrar() {
    if (enviando) return;
    if (hayCambios) setConfirmarDescarte(true);
    else onCancelar();
  }

  function mostrarError(e) {
    const detalles = Array.isArray(e.detalles) ? e.detalles : [];
    const porCampo = Object.fromEntries(detalles.filter((d) => CAMPOS.includes(d.campo)).map((d) => [d.campo, d.mensaje]));
    setErrores(porCampo);
    if (Object.keys(porCampo).length === 0) setErrorGeneral(e.message);
  }

  async function guardar(e) {
    e.preventDefault();
    setErrorGeneral('');

    const encontrados = validarUsuario({ nombre, correo }, { conCorreo: !editando });
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return setIntentos((n) => n + 1);

    setEnviando(true);
    try {
      const datos = editando
        ? { nombre: nombre.trim() }
        : { nombre: nombre.trim(), correo: normalizarCorreo(correo) };
      const guardado = editando
        ? await api.put(`/usuarios/${usuario.id}`, datos)
        : await api.post('/usuarios', datos);
      onGuardado(guardado);
    } catch (err) {
      mostrarError(err);
      setIntentos((n) => n + 1);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={editando ? 'Editar operario' : 'Nuevo operario'} onCerrar={intentarCerrar}>
      <form ref={formulario} onSubmit={guardar} noValidate>
        <div className="modal-cuerpo">
          <p className="texto-suave leyenda">
            {editando
              ? 'El correo no se puede cambiar. El rol de operario tampoco se modifica desde aquí.'
              : 'El operario recibirá una invitación por correo para crear su propia contraseña. Si el envío falla, se mostrará un enlace seguro para compartir.'}
          </p>

          <CampoTexto
            id="usuario-nombre"
            etiqueta="Nombre"
            obligatorio
            data-foco-inicial
            autoComplete="name"
            maxLength={120}
            value={nombre}
            error={errores.nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              quitarError('nombre');
            }}
          />

          <CampoTexto
            id="usuario-correo"
            etiqueta="Correo electrónico"
            obligatorio
            type="email"
            autoComplete="email"
            maxLength={254}
            value={correo}
            disabled={editando}
            ayuda={editando ? 'El correo de la cuenta no se puede cambiar.' : 'Allí llegará el enlace de invitación.'}
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
          textoGuardar={editando ? 'Guardar cambios' : 'Invitar operario'}
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
