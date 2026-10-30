// HU-05 CA1 y CA2 · Registrar un vehículo desde el perfil de un cliente (ZARU-6).
import { useRef, useState } from 'react';
import { api } from '../services/api.js';
import { AYUDA_PLACA, TIPOS_VEHICULO, normalizarPlaca, validarVehiculo } from '../lib/validacionVehiculo.js';
import { useFocoEnError } from '../hooks/useFocoEnError.js';
import Modal from './Modal.jsx';
import CampoTexto from './CampoTexto.jsx';
import MensajeError from './MensajeError.jsx';
import AvisoClienteExistente from './AvisoClienteExistente.jsx';
import PieFormulario from './PieFormulario.jsx';

const CAMPOS = ['placa', 'tipo', 'marca', 'color'];

export default function FormularioVehiculo({ cliente, onRegistrado, onAbrirCliente, onCancelar }) {
  const [tipo, setTipo] = useState('carro');
  const [placa, setPlaca] = useState('');
  const [marca, setMarca] = useState('');
  const [color, setColor] = useState('');
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [duenoPlaca, setDuenoPlaca] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const [intentos, setIntentos] = useState(0);
  const formulario = useRef(null);

  useFocoEnError(formulario, intentos);

  function quitarError(campo) {
    setErrores(({ [campo]: _, ...resto }) => resto);
  }

  function intentarCerrar() {
    if (enviando) return;
    if (placa || marca || color) setConfirmarDescarte(true);
    else onCancelar();
  }

  function mostrarError(e) {
    const detalles = Array.isArray(e.detalles) ? e.detalles : [];
    const conCliente = detalles.find((d) => d.clienteId);

    // CA2: la placa ya está registrada. Si es de otro cliente, se ofrece abrirlo.
    if (conCliente) {
      if (conCliente.clienteId === cliente.id) return setErrores({ placa: 'Este cliente ya tiene registrada esta placa' });
      return setDuenoPlaca({ id: conCliente.clienteId, mensaje: conCliente.mensaje });
    }

    const porCampo = Object.fromEntries(detalles.filter((d) => CAMPOS.includes(d.campo)).map((d) => [d.campo, d.mensaje]));
    setErrores(porCampo);
    if (Object.keys(porCampo).length === 0) setErrorGeneral(e.message);
  }

  async function guardar(e) {
    e.preventDefault();
    setErrorGeneral('');
    setDuenoPlaca(null);

    const encontrados = validarVehiculo({ placa, tipo });
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return setIntentos((n) => n + 1);

    setEnviando(true);
    try {
      onRegistrado(await api.post('/vehiculos', { clienteId: cliente.id, placa: normalizarPlaca(placa), tipo, marca, color }));
    } catch (err) {
      mostrarError(err);
      setIntentos((n) => n + 1);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Agregar vehículo" onCerrar={intentarCerrar}>
      <form ref={formulario} onSubmit={guardar} noValidate>
        <div className="modal-cuerpo">
          <p className="texto-suave leyenda">
            Cliente: <strong>{cliente.nombre}</strong>. Los campos con <span className="obligatorio">*</span> son obligatorios.
          </p>

          <fieldset className="grupo-opciones">
            <legend>
              Tipo de vehículo <span className="obligatorio" aria-hidden="true">*</span>
            </legend>
            <div className="opciones">
              {Object.entries(TIPOS_VEHICULO).map(([valor, texto]) => (
                <label key={valor} className="opcion">
                  <input
                    type="radio"
                    name="vehiculo-tipo"
                    value={valor}
                    checked={tipo === valor}
                    onChange={() => {
                      setTipo(valor);
                      quitarError('placa');
                      setDuenoPlaca(null);
                    }}
                  />
                  {texto}
                </label>
              ))}
            </div>
            {errores.tipo && <MensajeError id="vehiculo-tipo-error">{errores.tipo}</MensajeError>}
          </fieldset>

          <CampoTexto
            id="vehiculo-placa"
            etiqueta="Placa"
            obligatorio
            data-foco-inicial
            ayuda={AYUDA_PLACA[tipo]}
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={9}
            value={placa}
            error={errores.placa}
            onChange={(e) => {
              setPlaca(e.target.value.toUpperCase());
              quitarError('placa');
              setDuenoPlaca(null);
            }}
          />

          {duenoPlaca && (
            <AvisoClienteExistente
              titulo="Esta placa ya está registrada"
              mensaje={duenoPlaca.mensaje}
              textoAccion="Abrir ese cliente"
              onAbrir={() => onAbrirCliente(duenoPlaca.id)}
            />
          )}

          <CampoTexto
            id="vehiculo-marca"
            etiqueta="Marca"
            autoComplete="off"
            maxLength={40}
            value={marca}
            error={errores.marca}
            onChange={(e) => {
              setMarca(e.target.value);
              quitarError('marca');
            }}
          />

          <CampoTexto
            id="vehiculo-color"
            etiqueta="Color"
            autoComplete="off"
            maxLength={30}
            value={color}
            error={errores.color}
            onChange={(e) => {
              setColor(e.target.value);
              quitarError('color');
            }}
          />

          {errorGeneral && (
            <div className="aviso aviso-error" role="alert">
              <p>{errorGeneral}</p>
            </div>
          )}
        </div>

        <PieFormulario
          textoGuardar="Guardar vehículo"
          textoDescarte="¿Descartar este vehículo?"
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
