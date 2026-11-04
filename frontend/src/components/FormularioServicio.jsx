// HU-07 — Crear o editar un servicio del catálogo (ZARU-8).
import { useRef, useState } from 'react';
import { api } from '../services/api.js';
import { servicioAFormulario, validarServicio } from '../lib/validacionServicio.js';
import { useFocoEnError } from '../hooks/useFocoEnError.js';
import Modal from './Modal.jsx';
import CampoTexto from './CampoTexto.jsx';
import PieFormulario from './PieFormulario.jsx';

const CAMPOS = ['nombre', 'precio', 'duracionMin'];

export default function FormularioServicio({ servicio, onGuardado, onCancelar }) {
  const [inicial] = useState(() => servicioAFormulario(servicio));
  const [nombre, setNombre] = useState(inicial.nombre);
  const [precio, setPrecio] = useState(inicial.precio);
  const [duracionMin, setDuracionMin] = useState(inicial.duracionMin);
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const [intentos, setIntentos] = useState(0);
  const formulario = useRef(null);
  const editando = Boolean(servicio);

  useFocoEnError(formulario, intentos);

  const hayCambios = nombre !== inicial.nombre || precio !== inicial.precio || duracionMin !== inicial.duracionMin;

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

    const encontrados = validarServicio({ nombre, precio, duracionMin });
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return setIntentos((n) => n + 1);

    setEnviando(true);
    try {
      const datos = { nombre: nombre.trim(), precio: Number(precio), duracionMin: Number(duracionMin) };
      const guardado = editando ? await api.patch(`/servicios/${servicio.id}`, datos) : await api.post('/servicios', datos);
      onGuardado(guardado);
    } catch (err) {
      mostrarError(err);
      setIntentos((n) => n + 1);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={editando ? 'Editar servicio' : 'Nuevo servicio'} onCerrar={intentarCerrar}>
      <form ref={formulario} onSubmit={guardar} noValidate>
        <div className="modal-cuerpo">
          <p className="texto-suave leyenda">
            Los campos con <span className="obligatorio">*</span> son obligatorios. Cambiar el precio no modifica las órdenes ya registradas.
          </p>

          <CampoTexto
            id="servicio-nombre"
            etiqueta="Nombre"
            obligatorio
            data-foco-inicial
            autoComplete="off"
            maxLength={80}
            value={nombre}
            error={errores.nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              quitarError('nombre');
            }}
          />

          <div className="campos-fila">
            <CampoTexto
              id="servicio-precio"
              etiqueta="Precio (COP)"
              obligatorio
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={precio}
              error={errores.precio}
              onChange={(e) => {
                setPrecio(e.target.value);
                quitarError('precio');
              }}
            />
            <CampoTexto
              id="servicio-duracion"
              etiqueta="Duración estimada (minutos)"
              obligatorio
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={duracionMin}
              error={errores.duracionMin}
              onChange={(e) => {
                setDuracionMin(e.target.value);
                quitarError('duracionMin');
              }}
            />
          </div>

          {errorGeneral && (
            <div className="aviso aviso-error" role="alert">
              <p>{errorGeneral}</p>
            </div>
          )}
        </div>

        <PieFormulario
          textoGuardar={editando ? 'Guardar cambios' : 'Crear servicio'}
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
