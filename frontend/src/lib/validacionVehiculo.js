// Validación de los datos de un vehículo, para mostrar todos los errores de una vez.
// Usa los mismos mensajes de la API, que sigue siendo quien decide.

export const TIPOS_VEHICULO = { carro: 'Carro', moto: 'Moto' };

export const AYUDA_PLACA = { carro: 'Ejemplo: ABC123', moto: 'Ejemplo: ABC12D o ABC12' };

const FORMATO = {
  carro: { patron: /^[A-Z]{3}\d{3}$/, mensaje: 'La placa de un carro debe tener el formato ABC123' },
  moto: { patron: /^[A-Z]{3}\d{2}[A-Z]?$/, mensaje: 'La placa de una moto debe tener el formato ABC12D o ABC12' },
};

export const normalizarPlaca = (placa) => placa.replace(/[\s-]/g, '').toUpperCase();

export function validarVehiculo({ placa, tipo }) {
  const errores = {};
  const normalizada = normalizarPlaca(placa);
  if (!normalizada) errores.placa = 'La placa es obligatoria';
  else if (!FORMATO[tipo].patron.test(normalizada)) errores.placa = FORMATO[tipo].mensaje;
  return errores;
}
