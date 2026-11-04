// HU-57 CA1 · Registrar un establecimiento afiliado: nombre, plan, correo del administrador inicial
// y periodo de prueba (CA2). Al guardar, la API crea su espacio aislado y envía la invitación.
import { useState } from 'react';
import { api } from '../services/api.js';
import { PLANES, DIAS_MINIMOS, DIAS_MAXIMOS, validarRegistro, finDePrueba, formatoFechaCorta } from '../lib/establecimientos.js';

const VACIO = { nombre: '', plan: 'basico', correoAdministrador: '', diasPrueba: String(DIAS_MINIMOS) };

export default function FormularioEstablecimiento({ onCreado, onCancelar }) {
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cambiar = (campo, valor) => {
    setForm((actual) => ({ ...actual, [campo]: valor }));
    setErrores((actual) => ({ ...actual, [campo]: undefined }));
  };

  async function registrar(e) {
    e.preventDefault();
    const encontrados = validarRegistro(form);
    setErrores(encontrados);
    setError('');
    if (Object.keys(encontrados).length) return;

    setGuardando(true);
    try {
      const resultado = await api.post('/superadmin/establecimientos', { ...form, nombre: form.nombre.trim(), diasPrueba: Number(form.diasPrueba) });
      onCreado(resultado);
    } catch (err) {
      // Los errores por campo de la API (400/409) se muestran junto al campo.
      const porCampo = Object.fromEntries((err.detalles ?? []).filter((d) => d.campo).map((d) => [d.campo, d.mensaje]));
      setErrores(porCampo);
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  const dias = Number(form.diasPrueba);
  const diasValidos = Number.isInteger(dias) && dias >= DIAS_MINIMOS && dias <= DIAS_MAXIMOS;

  return (
    <form className="modal-cuerpo formulario-establecimiento" onSubmit={registrar} noValidate>
      <div className="campo">
        <label htmlFor="est-nombre">Nombre del establecimiento</label>
        <input
          id="est-nombre"
          data-foco-inicial
          value={form.nombre}
          onChange={(e) => cambiar('nombre', e.target.value)}
          maxLength={120}
          aria-invalid={Boolean(errores.nombre)}
          aria-describedby={errores.nombre ? 'est-nombre-error' : undefined}
          placeholder="Ej. Lavadero El Brillo"
        />
        {errores.nombre && <p id="est-nombre-error" className="mensaje-error">{errores.nombre}</p>}
      </div>

      <fieldset className="grupo-opciones">
        <legend>Plan</legend>
        <div className="planes">
          {PLANES.map((p) => (
            <label key={p.value} className={`plan-opcion${form.plan === p.value ? ' seleccionado' : ''}`}>
              <input type="radio" name="plan" value={p.value} checked={form.plan === p.value} onChange={() => cambiar('plan', p.value)} />
              <span className="plan-nombre">{p.label}</span>
              <span className="plan-descripcion">{p.descripcion}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="campo">
        <label htmlFor="est-correo">Correo del administrador inicial</label>
        <input
          id="est-correo"
          type="email"
          value={form.correoAdministrador}
          onChange={(e) => cambiar('correoAdministrador', e.target.value)}
          maxLength={254}
          autoComplete="off"
          aria-invalid={Boolean(errores.correoAdministrador)}
          aria-describedby="est-correo-ayuda"
          placeholder="admin@lavadero.com"
        />
        <p id="est-correo-ayuda" className={errores.correoAdministrador ? 'mensaje-error' : 'campo-ayuda'}>
          {errores.correoAdministrador ?? 'Le llegará una invitación para crear su contraseña y entrar al panel.'}
        </p>
      </div>

      <div className="campo">
        <label htmlFor="est-dias">Periodo de prueba (días)</label>
        <div className="dias-prueba">
          <input
            id="est-dias"
            type="range"
            min={DIAS_MINIMOS}
            max={DIAS_MAXIMOS}
            value={diasValidos ? dias : DIAS_MINIMOS}
            onChange={(e) => cambiar('diasPrueba', e.target.value)}
            aria-label="Días de prueba"
          />
          <input
            type="number"
            min={DIAS_MINIMOS}
            max={DIAS_MAXIMOS}
            step="1"
            value={form.diasPrueba}
            onChange={(e) => cambiar('diasPrueba', e.target.value)}
            aria-invalid={Boolean(errores.diasPrueba)}
            aria-label="Número de días de prueba"
          />
        </div>
        <p className={errores.diasPrueba ? 'mensaje-error' : 'campo-ayuda'}>
          {errores.diasPrueba ?? (diasValidos
            ? `La prueba termina el ${formatoFechaCorta(finDePrueba(dias))}. Después quedará pendiente de activación.`
            : `Entre ${DIAS_MINIMOS} y ${DIAS_MAXIMOS} días.`)}
        </p>
      </div>

      {error && <p className="aviso aviso-error" role="alert">{error}</p>}

      <div className="modal-acciones">
        <button type="button" className="boton secundario" onClick={onCancelar}>Cancelar</button>
        <button className="boton" disabled={guardando} aria-busy={guardando}>{guardando ? 'Registrando…' : 'Crear y enviar invitación'}</button>
      </div>
    </form>
  );
}
