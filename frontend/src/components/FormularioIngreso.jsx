import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { formatoMoneda } from '../lib/formato.js';
import { limpiarTelefono, validarContacto } from '../lib/validacionCliente.js';
import { AYUDA_PLACA, TIPOS_VEHICULO, normalizarPlaca, validarVehiculo } from '../lib/validacionVehiculo.js';
import { useFocoEnError } from '../hooks/useFocoEnError.js';
import Modal from './Modal.jsx';
import CampoTexto from './CampoTexto.jsx';
import MensajeError from './MensajeError.jsx';
import PieFormulario from './PieFormulario.jsx';

const CAMPOS = ['placa', 'tipo', 'marca', 'color', 'nombre', 'telefono', 'correo', 'autorizacionDatos', 'servicioIds', 'observaciones'];

function parrafosPolitica(contenido) {
  return contenido
    .split('\n')
    .filter((linea) => linea.trim() && !linea.startsWith('# '))
    .map((linea, i) => {
      const texto = linea.replace(/\*\*/g, '').replace(/^#+\s*/, '');
      return linea.startsWith('#') ? <p key={i} className="politica-subtitulo">{texto}</p> : <p key={i}>{texto}</p>;
    });
}

function mejorPromocion(servicioId, promociones) {
  return [...promociones]
    .filter((p) => p.servicios?.some((s) => s.id === servicioId))
    .sort(
      (a, b) =>
        Number(b.descuento_pct) - Number(a.descuento_pct) ||
        new Date(a.created_at) - new Date(b.created_at) ||
        a.id.localeCompare(b.id),
    )[0];
}

export default function FormularioIngreso({ onCreada, onCancelar }) {
  const [placa, setPlaca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [placaConsultada, setPlacaConsultada] = useState('');
  const [vehiculo, setVehiculo] = useState(null);
  const [tipo, setTipo] = useState('carro');
  const [marca, setMarca] = useState('');
  const [color, setColor] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [autoriza, setAutoriza] = useState(false);
  const [servicios, setServicios] = useState(null);
  const [promociones, setPromociones] = useState([]);
  const [seleccion, setSeleccion] = useState([]);
  const [observaciones, setObservaciones] = useState('');
  const [politica, setPolitica] = useState(null);
  const [errorPolitica, setErrorPolitica] = useState('');
  const [errorCarga, setErrorCarga] = useState('');
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);
  const [intentos, setIntentos] = useState(0);
  const formulario = useRef(null);

  useFocoEnError(formulario, intentos);

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

  useEffect(() => {
    let vigente = true;
    Promise.all([api.get('/servicios'), api.get('/promociones?estado=vigentes')])
      .then(([lista, vigentes]) => {
        if (!vigente) return;
        setServicios(lista.filter((s) => s.activo));
        setPromociones(vigentes);
      })
      .catch((e) => vigente && setErrorCarga(e.message));
    return () => {
      vigente = false;
    };
  }, []);

  const elegidos = (servicios ?? []).filter((s) => seleccion.includes(s.id));
  const subtotal = elegidos.reduce((suma, s) => suma + Number(s.precio), 0);
  const descuento = elegidos.reduce((suma, s) => {
    const promocion = mejorPromocion(s.id, promociones);
    return suma + (promocion ? Math.round((Number(s.precio) * Number(promocion.descuento_pct)) / 100) : 0);
  }, 0);
  const total = subtotal - descuento;
  const duracion = elegidos.reduce((suma, s) => suma + Number(s.duracion_min), 0);
  const horaEntrega = duracion
    ? new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' }).format(new Date(Date.now() + duracion * 60000))
    : null;
  const esNuevo = buscado && !vehiculo;

  function quitarError(campo) {
    setErrores(({ [campo]: _, ...resto }) => resto);
  }

  function cambiarPlaca(valor) {
    setPlaca(valor.toUpperCase());
    setBuscado(false);
    setPlacaConsultada('');
    setVehiculo(null);
    quitarError('placa');
  }

  async function consultarPlaca(valor) {
    setBuscando(true);
    setErrorGeneral('');
    try {
      const lista = await api.get(`/vehiculos?placa=${encodeURIComponent(valor)}`);
      const encontrado = lista.find((v) => v.placa === valor) ?? null;
      setVehiculo(encontrado);
      setBuscado(true);
      setPlacaConsultada(valor);
      return encontrado;
    } catch (e) {
      setVehiculo(null);
      setBuscado(false);
      setErrorGeneral(e.message);
      return undefined;
    } finally {
      setBuscando(false);
    }
  }

  async function buscarPlaca() {
    const valor = normalizarPlaca(placa);
    if (!valor) return setErrores({ placa: 'La placa es obligatoria' });
    await consultarPlaca(valor);
  }

  function alternarServicio(id) {
    setSeleccion((actual) => (actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id]));
    quitarError('servicioIds');
  }

  function intentarCerrar() {
    if (enviando) return;
    const hayDatos =
      placa || nombre || telefono || correo || autoriza || marca || color || observaciones || seleccion.length > 0;
    if (hayDatos) setConfirmarDescarte(true);
    else onCancelar();
  }

  function mostrarError(e) {
    const detalles = Array.isArray(e.detalles) ? e.detalles : [];

    if (detalles.some((d) => d.campo === 'politica' || d.campo === 'politicaVersion')) {
      setAutoriza(false);
      setErrores({ autorizacionDatos: 'La política de datos cambió. Léela y autoriza de nuevo.' });
      cargarPolitica();
      return;
    }

    const porCampo = {};
    for (const detalle of detalles) {
      const campo = CAMPOS.find((c) => detalle.campo === c || detalle.campo?.startsWith(`${c}.`));
      if (campo) porCampo[campo] = detalle.mensaje;
      if (detalle.campo === 'vehiculoId') porCampo.placa = detalle.mensaje;
    }

    const placaDuplicada = detalles.some((d) => d.campo === 'placa');
    const vehiculoNoEncontrado = detalles.some((d) => d.campo === 'vehiculoId' && /no encontrado/i.test(d.mensaje));
    if (placaDuplicada || vehiculoNoEncontrado) {
      setBuscado(false);
      setVehiculo(null);
    }
    setErrores(porCampo);
    if (Object.keys(porCampo).length === 0) setErrorGeneral(e.message);
  }

  async function guardar(e) {
    e.preventDefault();
    setErrorGeneral('');

    const placaNormalizada = normalizarPlaca(placa);
    if (!placaNormalizada) {
      setErrores({ placa: 'La placa es obligatoria' });
      return setIntentos((n) => n + 1);
    }

    let encontrado = vehiculo;
    if (!buscado || placaConsultada !== placaNormalizada) {
      encontrado = await consultarPlaca(placaNormalizada);
      if (encontrado === undefined) return setIntentos((n) => n + 1);
    }

    const encontrados = {};
    if (!encontrado) {
      Object.assign(encontrados, validarVehiculo({ placa, tipo }));
      Object.assign(encontrados, validarContacto({ nombre, telefono, correo }));
      if (!autoriza) encontrados.autorizacionDatos = 'La autorización de tratamiento de datos es obligatoria (Ley 1581 de 2012)';
    }
    if (seleccion.length === 0) encontrados.servicioIds = 'Elige al menos un servicio';

    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) return setIntentos((n) => n + 1);

    const cuerpo = encontrado
      ? { vehiculoId: encontrado.id, servicioIds: seleccion, observaciones: observaciones || null }
      : {
          servicioIds: seleccion,
          observaciones: observaciones || null,
          nuevoVehiculo: {
            cliente: {
              nombre,
              telefono: limpiarTelefono(telefono),
              correo,
              autorizacionDatos: true,
              politicaVersion: politica.version,
            },
            vehiculo: { placa: placaNormalizada, tipo, marca, color },
          },
        };

    setEnviando(true);
    try {
      onCreada(await api.post('/ordenes', cuerpo));
    } catch (err) {
      mostrarError(err);
      setIntentos((n) => n + 1);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Ingresar vehículo" onCerrar={intentarCerrar}>
      <form ref={formulario} onSubmit={guardar} noValidate>
        <div className="modal-cuerpo">
          <p className="texto-suave leyenda">
            Los campos con <span className="obligatorio">*</span> son obligatorios. Si la placa no está registrada, el cliente y el vehículo se crean con la orden.
          </p>

          {errorCarga && (
            <div className="aviso aviso-error" role="alert">
              <p>{errorCarga}</p>
            </div>
          )}

          <section className="perfil-tarjeta" aria-labelledby="ingreso-vehiculo-titulo">
            <div className="perfil-encabezado">
              <h4 id="ingreso-vehiculo-titulo">Vehículo</h4>
            </div>

            <div className="campo-con-accion">
              <CampoTexto
                id="ingreso-placa"
                etiqueta="Placa"
                obligatorio
                data-foco-inicial
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={9}
                ayuda={AYUDA_PLACA[tipo]}
                value={placa}
                error={errores.placa}
                onChange={(e) => cambiarPlaca(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  buscarPlaca();
                }}
              />
              <button type="button" className="boton secundario" disabled={buscando || !placa.trim()} onClick={buscarPlaca}>
                {buscando ? 'Buscando…' : 'Buscar placa'}
              </button>
            </div>

            <p className="texto-suave" role="status">
              {buscando
                ? 'Buscando el vehículo…'
                : vehiculo
                  ? 'Vehículo registrado: se usará su cliente y sus datos.'
                  : esNuevo
                    ? 'La placa no está registrada. Completa el cliente y los datos del vehículo.'
                    : 'Escribe la placa y búscala antes de continuar.'}
            </p>

            {vehiculo && (
              <div className="aviso aviso-info">
                <p>
                  <strong>{vehiculo.placa}</strong> · {TIPOS_VEHICULO[vehiculo.tipo] ?? vehiculo.tipo}
                  {vehiculo.marca ? ` · ${vehiculo.marca}` : ''}
                  {vehiculo.color ? ` · ${vehiculo.color}` : ''}
                </p>
                <p className="texto-suave">Cliente: {vehiculo.clientes?.nombre ?? 'sin nombre'}</p>
              </div>
            )}

            {esNuevo && (
              <>
                <fieldset className="grupo-opciones">
                  <legend>
                    Tipo de vehículo <span className="obligatorio" aria-hidden="true">*</span>
                  </legend>
                  <div className="opciones">
                    {Object.entries(TIPOS_VEHICULO).map(([valor, texto]) => (
                      <label key={valor} className="opcion">
                        <input
                          type="radio"
                          name="ingreso-tipo"
                          value={valor}
                          checked={tipo === valor}
                          onChange={() => {
                            setTipo(valor);
                            quitarError('tipo');
                            quitarError('placa');
                          }}
                        />
                        {texto}
                      </label>
                    ))}
                  </div>
                  {errores.tipo && <MensajeError id="ingreso-tipo-error">{errores.tipo}</MensajeError>}
                </fieldset>

                <div className="campos-fila">
                  <CampoTexto
                    id="ingreso-marca"
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
                    id="ingreso-color"
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
                </div>
              </>
            )}
          </section>

          {esNuevo && (
            <section className="perfil-tarjeta" aria-labelledby="ingreso-cliente-titulo">
              <div className="perfil-encabezado">
                <h4 id="ingreso-cliente-titulo">Cliente nuevo</h4>
                {politica && <span className="texto-suave nota-obligatorios">Política {politica.version}</span>}
              </div>

              <CampoTexto
                id="ingreso-nombre"
                etiqueta="Nombre completo"
                obligatorio
                autoComplete="off"
                value={nombre}
                error={errores.nombre}
                onChange={(e) => {
                  setNombre(e.target.value);
                  quitarError('nombre');
                }}
              />
              <CampoTexto
                id="ingreso-telefono"
                etiqueta="Celular"
                obligatorio
                type="tel"
                inputMode="tel"
                autoComplete="off"
                ayuda="10 dígitos, empieza por 3."
                value={telefono}
                error={errores.telefono}
                onChange={(e) => {
                  setTelefono(e.target.value);
                  quitarError('telefono');
                }}
              />
              <CampoTexto
                id="ingreso-correo"
                etiqueta="Correo"
                obligatorio
                type="email"
                autoComplete="off"
                value={correo}
                error={errores.correo}
                onChange={(e) => {
                  setCorreo(e.target.value);
                  quitarError('correo');
                }}
              />

              {politica && (
                <div className="politica" tabIndex={0} role="region" aria-label="Texto de la política de tratamiento de datos">
                  {parrafosPolitica(politica.contenido)}
                </div>
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
                  id="ingreso-autoriza"
                  type="checkbox"
                  checked={autoriza}
                  disabled={!politica}
                  aria-required="true"
                  aria-invalid={!!errores.autorizacionDatos}
                  aria-describedby={errores.autorizacionDatos ? 'ingreso-autoriza-error' : undefined}
                  onChange={(e) => {
                    setAutoriza(e.target.checked);
                    quitarError('autorizacionDatos');
                  }}
                />
                <label htmlFor="ingreso-autoriza">
                  El titular autoriza el tratamiento de sus datos personales según esta política (Ley 1581 de 2012).
                </label>
              </div>
              {errores.autorizacionDatos && <MensajeError id="ingreso-autoriza-error">{errores.autorizacionDatos}</MensajeError>}
            </section>
          )}

          <fieldset className="grupo-opciones">
            <legend>
              Servicios <span className="obligatorio" aria-hidden="true">*</span>
            </legend>
            {servicios === null && !errorCarga && <p className="texto-suave">Cargando el catálogo…</p>}
            {servicios?.length === 0 && <p className="texto-suave">No hay servicios activos en el catálogo.</p>}
            <div className="lista-servicios" aria-describedby={errores.servicioIds ? 'ingreso-servicios-error' : undefined}>
              {(servicios ?? []).map((s, i) => (
                <label key={s.id} className="casilla">
                  <input
                    type="checkbox"
                    checked={seleccion.includes(s.id)}
                    aria-invalid={!!errores.servicioIds}
                    data-foco-error={errores.servicioIds && i === 0 ? true : undefined}
                    onChange={() => alternarServicio(s.id)}
                  />
                  <span>
                    {s.nombre}{' '}
                    <span className="texto-suave">
                      · {formatoMoneda(s.precio)} · {s.duracion_min} min
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {errores.servicioIds && <MensajeError id="ingreso-servicios-error">{errores.servicioIds}</MensajeError>}
          </fieldset>

          <div className="campo">
            <label htmlFor="ingreso-observaciones">
              Observaciones <span className="texto-suave">(opcional)</span>
            </label>
            <textarea
              id="ingreso-observaciones"
              rows={2}
              maxLength={500}
              placeholder="Ej.: rayón en la puerta delantera"
              value={observaciones}
              onChange={(e) => {
                setObservaciones(e.target.value);
                quitarError('observaciones');
              }}
            />
            {errores.observaciones && <MensajeError id="ingreso-observaciones-error">{errores.observaciones}</MensajeError>}
          </div>

          <div className="resumen-orden" aria-live="polite">
            <div>
              <span>Subtotal</span>
              <span>{formatoMoneda(subtotal)}</span>
            </div>
            {descuento > 0 && (
              <div>
                <span>Descuento por promociones</span>
                <span>−{formatoMoneda(descuento)}</span>
              </div>
            )}
            <div className="resumen-total">
              <span>Total</span>
              <strong>{formatoMoneda(total)}</strong>
            </div>
            <p className="texto-suave">
              {duracion
                ? `Duración estimada: ${duracion} min. Entrega aproximada: ${horaEntrega}.`
                : 'Elige al menos un servicio para calcular el total y la entrega.'}
            </p>
          </div>

          {errorGeneral && (
            <div className="aviso aviso-error" role="alert">
              <p>{errorGeneral}</p>
            </div>
          )}
        </div>

        <PieFormulario
          textoGuardar="Registrar ingreso"
          textoDescarte="¿Descartar los datos de este ingreso?"
          confirmando={confirmarDescarte}
          enviando={enviando}
          deshabilitado={!servicios || buscando || servicios.length === 0 || (esNuevo && !politica)}
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
