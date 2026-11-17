// HU-32 — Plantillas de notificación con la marca de la sede (ZARU-21).
// CA1: elegir estado y canal, editar e insertar variables con botones.
// CA2: contador en vivo para SMS; con más de una parte avisa cuántas y el mayor costo, y explica el 70.
// CA3: vista previa en push, SMS y correo con datos de ejemplo y la marca de la sede.
// CA4: variables inválidas resaltadas en el navegador; el guardado queda bloqueado.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

const servicio = {
  listarPlantillas: vi.fn(),
  guardarPlantilla: vi.fn(),
  restaurarPlantilla: vi.fn(),
  vistaPreviaPlantilla: vi.fn(),
};
vi.mock('../src/services/plantillas.js', () => servicio);

const { default: PlantillasNotificacion } = await import('../src/pages/PlantillasNotificacion.jsx');
const lib = await import('../src/lib/plantillas.js');
const { menuPara } = await import('../src/lib/permisos.js');

const ESTADOS = [
  { valor: 'recibido', etiqueta: 'Recibido' },
  { valor: 'en_lavado', etiqueta: 'En lavado' },
  { valor: 'secado', etiqueta: 'Secado' },
  { valor: 'listo', etiqueta: 'Listo' },
  { valor: 'entregado', etiqueta: 'Entregado' },
];
const fila = (estado, canal, cuerpo, asunto = null, personalizada = false) => ({
  estado, canal, cuerpo, asunto, personalizada, plataforma: { cuerpo, asunto },
});
const RESPUESTA = () => ({
  variables: [
    { nombre: 'nombre_cliente', descripcion: 'Primer nombre del cliente' },
    { nombre: 'placa', descripcion: 'Placa del vehículo' },
    { nombre: 'estado', descripcion: 'Estado del vehículo' },
    { nombre: 'sede', descripcion: 'Nombre de tu sede' },
    { nombre: 'hora', descripcion: 'Hora del cambio de estado' },
  ],
  estados: ESTADOS,
  canales: ['push', 'sms', 'correo'],
  limites: { push: 240, sms: 640, correo: 2000, asunto: 120 },
  plantillas: [
    fila('listo', 'push', '{nombre_cliente}, tu vehículo {placa} está listo.', '¡Listo!'),
    fila('listo', 'sms', '{sede}: tu carro {placa} ya puede ser recogido.'),
    fila('listo', 'correo', 'Hola {nombre_cliente}, tu vehículo está listo.', 'Tu vehículo {placa} está listo'),
    fila('recibido', 'sms', '{sede}: recibimos tu carro {placa} a las {hora}.'),
  ],
});

const PREVIA = {
  estado: 'listo',
  canalEditado: 'sms',
  sede: { nombre: 'Lavadero Norte', logoUrl: 'https://cdn.zaru.test/norte.png', colorPrimario: '#B91C1C', colorSecundario: '#F59E0B' },
  datosEjemplo: { nombre_cliente: 'Laura', placa: 'ABC123', estado: 'listo para recoger', sede: 'Lavadero Norte', hora: '3:45 p. m.' },
  push: { titulo: '¡Listo!', texto: 'Laura, tu vehículo ABC123 está listo.' },
  sms: { texto: 'Lavadero Norte: tu carro ABC123 ya puede ser recogido.', caracteres: 54, segmentos: 1, codificacion: 'GSM-7', caracteresEspeciales: [] },
  correo: { asunto: 'Tu vehículo ABC123 está listo', html: '<html><body><table><tr><td style="background:#B91C1C">Lavadero Norte</td></tr></table></body></html>', texto: '' },
};

beforeEach(() => {
  for (const f of Object.values(servicio)) f.mockReset();
  servicio.listarPlantillas.mockResolvedValue(RESPUESTA());
});

async function abrir() {
  render(<PlantillasNotificacion />);
  return screen.findByLabelText('Texto del mensaje');
}
const escribir = (campo, valor) => fireEvent.change(campo, { target: { value: valor } });
const botonGuardar = () => screen.getByRole('button', { name: 'Guardar' });

describe('CA1 · elegir plantilla y editar con variables', () => {
  it('muestra la plantilla del estado y canal elegidos y si es de la plataforma', async () => {
    const campo = await abrir();
    expect(screen.getByLabelText('Estado del vehículo')).toHaveValue('listo');
    expect(screen.getByRole('radio', { name: 'SMS' })).toBeChecked();
    expect(campo).toHaveValue('{sede}: tu carro {placa} ya puede ser recogido.');
    expect(screen.getByText('Texto de la plataforma')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Estado del vehículo'), { target: { value: 'recibido' } });
    expect(screen.getByLabelText('Texto del mensaje')).toHaveValue('{sede}: recibimos tu carro {placa} a las {hora}.');

    fireEvent.change(screen.getByLabelText('Estado del vehículo'), { target: { value: 'listo' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Correo' }));
    expect(screen.getByLabelText('Asunto del correo')).toHaveValue('Tu vehículo {placa} está listo');
    expect(screen.getByLabelText('Texto del mensaje')).toHaveValue('Hola {nombre_cliente}, tu vehículo está listo.');
  });

  it('los botones insertan las cinco variables en la posición del cursor', async () => {
    const campo = await abrir();
    escribir(campo, 'Hola , tu carro');
    campo.setSelectionRange(5, 5);
    fireEvent.click(screen.getByRole('button', { name: /^Insertar \{nombre_cliente\}/ }));
    expect(campo).toHaveValue('Hola {nombre_cliente}, tu carro');
    expect(campo.selectionStart).toBe(21);

    for (const v of ['placa', 'estado', 'sede', 'hora']) {
      expect(screen.getByRole('button', { name: new RegExp(`^Insertar \\{${v}\\}`) })).toBeInTheDocument();
    }
  });

  it('guardar envía el texto, marca la plantilla como propia y avisa', async () => {
    const campo = await abrir();
    const nuevo = '{sede}: {nombre_cliente}, tu carro {placa} esta listo.';
    servicio.guardarPlantilla.mockResolvedValue({ ...fila('listo', 'sms', nuevo, null, true), advertencias: [] });
    escribir(campo, nuevo);
    expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument();
    fireEvent.click(botonGuardar());

    expect(await screen.findByText('Plantilla guardada')).toBeInTheDocument();
    expect(servicio.guardarPlantilla).toHaveBeenCalledWith('listo', 'sms', { asunto: null, cuerpo: nuevo });
    expect(screen.getByText('Personalizada por tu sede')).toBeInTheDocument();
    expect(within(screen.getByRole('radio', { name: /SMS/ }).closest('label')).getByText('Propia')).toBeInTheDocument();
  });

  it('una plantilla propia se puede restaurar al texto de la plataforma', async () => {
    servicio.listarPlantillas.mockResolvedValue({
      ...RESPUESTA(),
      plantillas: [{ ...fila('listo', 'sms', 'Texto propio {placa}', null, true), plataforma: { cuerpo: '{sede}: plataforma {placa}' } }],
    });
    servicio.restaurarPlantilla.mockResolvedValue(fila('listo', 'sms', '{sede}: plataforma {placa}'));
    await abrir();
    fireEvent.click(screen.getByRole('button', { name: /Restaurar texto de la plataforma/ }));
    expect(await screen.findByText('Volviste al texto de la plataforma')).toBeInTheDocument();
    expect(servicio.restaurarPlantilla).toHaveBeenCalledWith('listo', 'sms');
    expect(screen.getByLabelText('Texto del mensaje')).toHaveValue('{sede}: plataforma {placa}');
  });
});

describe('CA2 · contador de SMS en vivo', () => {
  it('con 160 caracteres es 1 parte y sin aviso; con 161 avisa 2 partes y mayor costo', async () => {
    const campo = await abrir();
    escribir(campo, 'a'.repeat(160));
    expect(screen.getByText(/1 parte/)).toBeInTheDocument();
    expect(screen.queryByText(/tendrá mayor costo/)).not.toBeInTheDocument();

    escribir(campo, 'a'.repeat(161));
    expect(screen.getByText('161')).toBeInTheDocument();
    expect(screen.getByText(/2 partes/, { selector: '.plantilla-contador-numeros' })).toBeInTheDocument();
    expect(screen.getByText('El mensaje se enviará en 2 partes y tendrá mayor costo: cada parte se cobra como un SMS.')).toBeInTheDocument();
  });

  it('con tildes explica en palabras simples por qué el límite por parte es 70 y no 160', async () => {
    const campo = await abrir();
    escribir(campo, `Tu vehículo ${'a'.repeat(59)}`); // 71 caracteres con «í»
    expect(screen.getByText('El mensaje se enviará en 2 partes y tendrá mayor costo: cada parte se cobra como un SMS.')).toBeInTheDocument();
    const explicacion = screen.getByText(/que el SMS básico no admite/);
    expect(explicacion).toHaveTextContent('«í»');
    expect(explicacion).toHaveTextContent('solo permite 70 caracteres por parte, en lugar de 160');
  });

  it('push y correo muestran el largo frente a su límite', async () => {
    await abrir();
    fireEvent.click(screen.getByRole('radio', { name: 'Notificación push' }));
    expect(screen.getByText(`${'{nombre_cliente}, tu vehículo {placa} está listo.'.length} / 240 caracteres`)).toBeInTheDocument();
  });
});

describe('CA3 · vista previa', () => {
  it('muestra push, SMS y correo con datos de ejemplo, logo y colores de la sede', async () => {
    servicio.vistaPreviaPlantilla.mockResolvedValue(PREVIA);
    await abrir();
    fireEvent.click(screen.getByRole('button', { name: /Vista previa/ }));

    const previa = await screen.findByRole('region', { name: /Vista previa · Listo/ });
    expect(servicio.vistaPreviaPlantilla).toHaveBeenCalledWith({ estado: 'listo', canal: 'sms', asunto: null, cuerpo: '{sede}: tu carro {placa} ya puede ser recogido.' });
    expect(within(previa).getByText(/Datos de ejemplo: Laura · placa ABC123 · 3:45 p\. m\./)).toBeInTheDocument();

    const push = within(previa).getByRole('region', { name: 'Vista previa: Notificación push' });
    expect(within(push).getByRole('img', { name: 'Logo de Lavadero Norte' })).toHaveAttribute('src', PREVIA.sede.logoUrl);
    expect(within(push).getByText('Laura, tu vehículo ABC123 está listo.')).toBeInTheDocument();

    const sms = within(previa).getByRole('region', { name: 'Vista previa: SMS' });
    expect(within(sms).getByText(PREVIA.sms.texto)).toBeInTheDocument();
    expect(within(sms).getByText('Lo que estás editando')).toBeInTheDocument();

    const correo = within(previa).getByRole('region', { name: 'Vista previa: Correo' });
    const iframe = within(correo).getByTitle('Correo de ejemplo: Tu vehículo ABC123 está listo');
    expect(iframe).toHaveAttribute('sandbox', '');
    expect(iframe.getAttribute('srcdoc')).toContain('background:#B91C1C');
    expect(previa.querySelector('.previa').style.getPropertyValue('--previa-color')).toBe('#B91C1C');
  });

  it('si se edita después, avisa que la vista previa está desactualizada', async () => {
    servicio.vistaPreviaPlantilla.mockResolvedValue(PREVIA);
    const campo = await abrir();
    fireEvent.click(screen.getByRole('button', { name: /Vista previa/ }));
    await screen.findByRole('region', { name: /Vista previa · Listo/ });
    escribir(campo, 'Otro texto {placa}');
    expect(screen.getByText(/Hiciste cambios después de esta vista previa/)).toBeInTheDocument();
  });
});

describe('CA4 · variables inválidas', () => {
  it('resalta la variable mal escrita, dice dónde está y bloquea guardar y la vista previa', async () => {
    const campo = await abrir();
    escribir(campo, 'Hola {nombre_clente}, tu carro {placa}');

    const resaltado = screen.getByTestId('resaltado-plantilla-cuerpo');
    expect([...resaltado.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['{nombre_clente}']);
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Línea 1, columna 6: La variable {nombre_clente} no existe. ¿Quisiste decir {nombre_cliente}?');
    expect(botonGuardar()).toBeDisabled();
    expect(screen.getByRole('button', { name: /Vista previa/ })).toBeDisabled();
    expect(screen.getByText('Corrige las variables resaltadas para poder guardar.')).toBeInTheDocument();
  });

  it('"Cambiar por" corrige la variable y desbloquea el guardado', async () => {
    const campo = await abrir();
    escribir(campo, 'Hola {nombre_clente}');
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar por {nombre_cliente}' }));
    expect(campo).toHaveValue('Hola {nombre_cliente}');
    expect(screen.getByTestId('resaltado-plantilla-cuerpo').querySelector('mark')).toBeNull();
    expect(botonGuardar()).toBeEnabled();
  });

  it('marca también llaves sin cerrar y variables inválidas en el asunto del correo', async () => {
    await abrir();
    fireEvent.click(screen.getByRole('radio', { name: 'Correo' }));
    escribir(screen.getByLabelText('Asunto del correo'), 'Listo {placas}');
    escribir(screen.getByLabelText('Texto del mensaje'), 'Hola {sede');
    expect(screen.getByTestId('resaltado-plantilla-asunto').querySelector('mark')).toHaveTextContent('{placas}');
    expect(screen.getByTestId('resaltado-plantilla-cuerpo').querySelector('mark')).toHaveTextContent('{sede');
    expect(screen.getByText(/Falta cerrar la llave en \{sede/)).toBeInTheDocument();
    expect(botonGuardar()).toBeDisabled();
  });

  it('si la API responde 400 con una variable, también se resalta', async () => {
    const campo = await abrir();
    escribir(campo, '{placa} listo');
    const error = Object.assign(new Error('La plantilla tiene variables que no existen o están mal escritas'), {
      status: 400,
      detalles: [{ campo: 'cuerpo', variable: '{placa}', posicion: 0, longitud: 7, linea: 1, columna: 1, sugerencia: null, mensaje: 'La variable {placa} no existe.' }],
    });
    servicio.guardarPlantilla.mockRejectedValue(error);
    fireEvent.click(botonGuardar());
    await waitFor(() => expect(screen.getByTestId('resaltado-plantilla-cuerpo').querySelector('mark')).toHaveTextContent('{placa}'));
    expect(screen.getAllByRole('alert').map((a) => a.textContent).join(' ')).toContain('La plantilla tiene variables que no existen');
  });
});

describe('lógica en el navegador (igual a la del backend)', () => {
  it('validarPlantilla, partesResaltadas e insertarVariable', () => {
    const errores = lib.validarPlantilla('Hola {nombre_clente}');
    expect(errores[0]).toMatchObject({ variable: '{nombre_clente}', posicion: 5, linea: 1, columna: 6, sugerencia: '{nombre_cliente}' });
    expect(lib.partesResaltadas('Hola {x} y', lib.validarPlantilla('Hola {x} y'))).toEqual([
      { texto: 'Hola ', invalida: false }, { texto: '{x}', invalida: true }, { texto: ' y', invalida: false },
    ]);
    expect(lib.insertarVariable('ab', 'placa', 1)).toEqual({ texto: 'a{placa}b', cursor: 8 });
  });

  it('contarSms: GSM-7 160/153, UCS-2 70/67 y caracteres extendidos dobles', () => {
    expect(lib.contarSms('a'.repeat(200))).toMatchObject({ segmentos: 2, codificacion: 'GSM-7' });
    expect(lib.contarSms('ó'.repeat(70))).toMatchObject({ segmentos: 1, codificacion: 'UCS-2' });
    expect(lib.contarSms('ó'.repeat(71)).segmentos).toBe(2);
    expect(lib.contarSms('€'.repeat(81)).segmentos).toBe(2);
    expect(lib.avisoPartes(3)).toBe('El mensaje se enviará en 3 partes y tendrá mayor costo: cada parte se cobra como un SMS.');
    expect(lib.avisoPartes(1)).toBeNull();
  });
});

describe('acceso', () => {
  it('solo el administrador ve "Plantillas" en el menú', () => {
    expect(menuPara({ rol: 'admin' }).map((m) => m.ruta)).toContain('/plantillas');
    expect(menuPara({ rol: 'operario' }).map((m) => m.ruta)).not.toContain('/plantillas');
  });
});
