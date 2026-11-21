// HU-29 — Selección del canal de notificación preferido, en la app del cliente.
// La API se simula con fetch por ruta; no hay backend ni SMS reales.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PreferenciasNotificacion from '../src/pages/PreferenciasNotificacion.jsx';
import { mensajeCorreo } from '../src/lib/avisoCorreo.js';
import {
  casillasDe, detalleCanal, hayCambios, limpiarCodigo, segundosParaReenvio, sinCanales, textoEstado,
} from '../src/lib/preferenciasCanal.js';

const SLUG = 'lavadero-norte';
const SEDE = { slug: SLUG, nombre: 'Lavadero Norte', logoUrl: null, colorPrimario: '#0F766E', colorSecundario: null };

const preferencias = ({ correo = true, sms = false, verificado = false, sinCanalesActivos = false } = {}) => ({
  canales: {
    push: { activo: false, disponible: false },
    sms: { activo: sms, disponible: true, verificado, celular: verificado ? '310****877' : null, celularRegistrado: '300****567' },
    correo: { activo: correo, disponible: true, destino: 'lui****@correo.com' },
  },
  sinCanales: sinCanalesActivos,
});

const respuesta = (status, cuerpo) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(cuerpo) });

/** Simula la API por ruta y método. `manejadores` reemplaza la respuesta de una ruta. */
function simularApi(manejadores = {}) {
  const base = {
    'GET /publico/cliente/preferencias': () => respuesta(200, preferencias()),
    'PUT /publico/cliente/preferencias': () => respuesta(200, preferencias()),
    'POST /publico/cliente/celular/codigo': () => respuesta(200, { enviado: true, celular: '300****567', expiraEn: '2026-11-11T15:10:00Z', reenvioEn: '2099-01-01T00:00:00Z' }),
    'POST /publico/cliente/celular/verificar': () => respuesta(200, preferencias({ verificado: true })),
    ...manejadores,
  };
  const fetchFalso = vi.fn((url, opciones = {}) => {
    const ruta = new URL(url).pathname.replace('/api/v1', '');
    const clave = `${opciones.method ?? 'GET'} ${ruta}`;
    if (base[clave]) return base[clave](opciones);
    return respuesta(200, SEDE); // GET de la sede
  });
  vi.stubGlobal('fetch', fetchFalso);
  return fetchFalso;
}

const llamadas = (api, clave) =>
  api.mock.calls.filter(([url, o = {}]) => `${o.method ?? 'GET'} ${new URL(url).pathname.replace('/api/v1', '')}` === clave);

function abrir() {
  return render(
    <MemoryRouter initialEntries={[`/s/${SLUG}/preferencias`]}>
      <Routes>
        <Route path="/s/:slug/preferencias" element={<PreferenciasNotificacion />} />
        <Route path="/s/:slug/notificaciones" element={<p>Centro de notificaciones</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const interruptor = (nombre) => screen.getByRole('switch', { name: nombre });

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem(`zaru:historial:${SLUG}`, 'pase-valido');
});
afterEach(() => vi.unstubAllGlobals());

describe('reglas de presentación', () => {
  it('casillasDe y hayCambios comparan lo mostrado con lo guardado', () => {
    const guardado = preferencias();
    expect(casillasDe(guardado)).toEqual({ push: false, sms: false, correo: true });
    expect(hayCambios({ push: false, sms: false, correo: true }, guardado)).toBe(false);
    expect(hayCambios({ push: false, sms: true, correo: true }, guardado)).toBe(true);
  });

  it('CA3: detecta cuando no queda ningún canal', () => {
    expect(sinCanales({ push: false, sms: false, correo: false })).toBe(true);
    expect(sinCanales({ push: false, sms: false, correo: true })).toBe(false);
  });

  it('CA1: estado y detalle de cada canal', () => {
    const datos = preferencias({ sms: true, verificado: true });
    expect(textoEstado('correo', datos)).toBe('Activo');
    expect(textoEstado('sms', preferencias())).toBe('Inactivo');
    expect(textoEstado('push', datos)).toBe('Próximamente');
    expect(detalleCanal('sms', datos)).toBe('Al celular 310****877.');
    expect(detalleCanal('sms', preferencias())).toContain('6 dígitos');
    expect(detalleCanal('correo', datos)).toBe('A lui****@correo.com.');
  });

  it('el código solo admite 6 dígitos y el reenvío cuenta segundos', () => {
    expect(limpiarCodigo('12a34-5678')).toBe('123456');
    expect(segundosParaReenvio('2026-11-11T15:01:00Z', new Date('2026-11-11T15:00:20Z').getTime())).toBe(40);
    expect(segundosParaReenvio('2026-11-11T15:01:00Z', new Date('2026-11-11T15:02:00Z').getTime())).toBe(0);
  });

  it('el panel entiende que el cliente eligió no recibir correo o que el aviso salió por SMS', () => {
    expect(mensajeCorreo({ estado: 'omitida', motivo: 'canal_inactivo' }).texto).toContain('eligió no recibir');
    expect(mensajeCorreo({ estado: 'pendiente', canal: 'sms', destino: '300****567' }).texto).toBe('Se está enviando el SMS a 300****567.');
  });
});

describe('HU-29 · pantalla de preferencias', () => {
  it('CA1: muestra push, sms y correo con su estado actual', async () => {
    simularApi();
    abrir();

    expect(await screen.findByRole('heading', { name: 'Preferencias de notificación' })).toBeInTheDocument();
    expect(interruptor('Correo electrónico')).toBeChecked();
    expect(interruptor('Mensaje de texto (SMS)')).not.toBeChecked();
    expect(interruptor('Notificación push')).toBeDisabled();
    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(screen.getAllByText('Inactivo')).toHaveLength(1);
    expect(screen.getByText('Próximamente')).toBeInTheDocument();
    expect(screen.getByText('A lui****@correo.com.')).toBeInTheDocument();
  });

  it('con el pase vencido vuelve a pedir la placa y el celular', async () => {
    simularApi({ 'GET /publico/cliente/preferencias': () => respuesta(401, { error: { mensaje: 'Venció' } }) });
    abrir();
    expect(await screen.findByText('Tu acceso venció. Verifica de nuevo tu placa y celular.')).toBeInTheDocument();
  });

  it('CA2: activar el sms sin celular validado pide el código de 6 dígitos y solo entonces lo activa', async () => {
    const api = simularApi();
    abrir();
    await screen.findByRole('heading', { name: 'Preferencias de notificación' });

    fireEvent.click(interruptor('Mensaje de texto (SMS)'));
    expect(screen.getByRole('heading', { name: 'Valida tu celular para activar el SMS' })).toBeInTheDocument();
    expect(interruptor('Mensaje de texto (SMS)')).not.toBeChecked(); // todavía no se activa

    fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
    expect(await screen.findByText(/Enviamos un código al celular 300\*\*\*567/)).toBeInTheDocument();
    // Con el celular registrado no se manda número: la API usa el del cliente.
    expect(JSON.parse(llamadas(api, 'POST /publico/cliente/celular/codigo')[0][1].body)).toEqual({});

    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '12ab3456' } });
    expect(screen.getByLabelText('Código de 6 dígitos')).toHaveValue('123456');
    fireEvent.click(screen.getByRole('button', { name: 'Validar código' }));

    await waitFor(() => expect(interruptor('Mensaje de texto (SMS)')).toBeChecked());
    expect(JSON.parse(llamadas(api, 'POST /publico/cliente/celular/verificar')[0][1].body)).toEqual({ codigo: '123456' });
    expect(screen.queryByRole('heading', { name: 'Valida tu celular para activar el SMS' })).not.toBeInTheDocument();
    expect(llamadas(api, 'PUT /publico/cliente/preferencias')).toHaveLength(0); // aún no se guardó
  });

  it('CA2: puede validar otro número y un código incorrecto muestra los intentos que quedan', async () => {
    const api = simularApi({
      'POST /publico/cliente/celular/verificar': () => respuesta(400, { error: { mensaje: 'El código no es correcto', detalles: [{ campo: 'codigo', mensaje: 'El código no es correcto. Te quedan 4 intentos' }] } }),
    });
    abrir();
    await screen.findByRole('heading', { name: 'Preferencias de notificación' });
    fireEvent.click(interruptor('Mensaje de texto (SMS)'));

    fireEvent.click(screen.getByLabelText('Usar otro número'));
    fireEvent.change(screen.getByLabelText('Número de celular'), { target: { value: '310 999 8877' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
    await screen.findByLabelText('Código de 6 dígitos');
    expect(JSON.parse(llamadas(api, 'POST /publico/cliente/celular/codigo')[0][1].body)).toEqual({ celular: '3109998877' });

    fireEvent.change(screen.getByLabelText('Código de 6 dígitos'), { target: { value: '111111' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar código' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Te quedan 4 intentos');
    expect(interruptor('Mensaje de texto (SMS)')).not.toBeChecked();
  });

  it('CA2: no deja reenviar el código antes de tiempo', async () => {
    simularApi();
    abrir();
    await screen.findByRole('heading', { name: 'Preferencias de notificación' });
    fireEvent.click(interruptor('Mensaje de texto (SMS)'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
    expect(await screen.findByRole('button', { name: /Reenviar en \d+ s/ })).toBeDisabled();
  });

  it('CA2: con el celular ya validado activa el sms sin pedir otro código', async () => {
    simularApi({ 'GET /publico/cliente/preferencias': () => respuesta(200, preferencias({ verificado: true })) });
    abrir();
    await screen.findByRole('heading', { name: 'Preferencias de notificación' });

    fireEvent.click(interruptor('Mensaje de texto (SMS)'));
    expect(interruptor('Mensaje de texto (SMS)')).toBeChecked();
    expect(screen.queryByRole('heading', { name: 'Valida tu celular para activar el SMS' })).not.toBeInTheDocument();
  });

  it('CA3: al desactivar todo advierte que no recibirá avisos y solo guarda si lo confirma', async () => {
    const api = simularApi({
      'PUT /publico/cliente/preferencias': () => respuesta(200, preferencias({ correo: false, sinCanalesActivos: true })),
    });
    abrir();
    await screen.findByRole('heading', { name: 'Preferencias de notificación' });

    fireEvent.click(interruptor('Correo electrónico'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar preferencias' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('No recibirás avisos del estado de tu vehículo');
    expect(llamadas(api, 'PUT /publico/cliente/preferencias')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar preferencias' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sí, no quiero avisos' }));
    expect(await screen.findByText(/no recibirás avisos del estado de tu vehículo/i)).toBeInTheDocument();
    expect(JSON.parse(llamadas(api, 'PUT /publico/cliente/preferencias')[0][1].body)).toEqual({ push: false, sms: false, correo: false, confirmarSinCanales: true });
  });

  it('CA4: al guardar informa por qué canales llegarán los próximos avisos', async () => {
    const api = simularApi({
      'GET /publico/cliente/preferencias': () => respuesta(200, preferencias({ verificado: true })),
      'PUT /publico/cliente/preferencias': () => respuesta(200, preferencias({ sms: true, verificado: true })),
    });
    abrir();
    await screen.findByRole('heading', { name: 'Preferencias de notificación' });
    expect(screen.getByRole('button', { name: 'Guardar preferencias' })).toBeDisabled(); // sin cambios

    fireEvent.click(interruptor('Mensaje de texto (SMS)'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar preferencias' }));

    expect(await screen.findByText('Guardamos tus preferencias. Tus próximos avisos llegarán por: Mensaje de texto (SMS), Correo electrónico.')).toBeInTheDocument();
    const [url, opciones] = llamadas(api, 'PUT /publico/cliente/preferencias')[0];
    expect(opciones.headers.Authorization).toBe('Bearer pase-valido');
    expect(JSON.parse(opciones.body)).toEqual({ push: false, sms: true, correo: true });
    expect(url).toContain('/publico/cliente/preferencias');
  });

  it('si la API rechaza el sms por celular sin validar, abre la validación', async () => {
    simularApi({
      'GET /publico/cliente/preferencias': () => respuesta(200, preferencias({ verificado: true })),
      'PUT /publico/cliente/preferencias': () => respuesta(400, { error: { mensaje: 'Valida tu celular', detalles: [{ campo: 'sms', mensaje: 'x', requiere: 'verificar_celular' }] } }),
    });
    abrir();
    await screen.findByRole('heading', { name: 'Preferencias de notificación' });
    fireEvent.click(interruptor('Mensaje de texto (SMS)'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar preferencias' }));

    expect(await screen.findByRole('heading', { name: 'Valida tu celular para activar el SMS' })).toBeInTheDocument();
    expect(interruptor('Mensaje de texto (SMS)')).not.toBeChecked();
  });
});
