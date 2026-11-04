import { describe, it, expect } from 'vitest';
import { nuevoEstablecimiento } from '../../src/schemas/superadmin.schemas.js';

const valido = {
  nombre: 'Car Wash Central',
  plan: 'basico',
  correoAdministrador: 'ADMIN@EXAMPLE.COM',
  diasPrueba: 14,
};

describe('HU-57 · validación de registro de establecimiento', () => {
  it.each(['basico', 'intermedio', 'empresarial'])('acepta el plan %s', (plan) => {
    expect(nuevoEstablecimiento.safeParse({ ...valido, plan }).success).toBe(true);
  });

  it.each([14, 15, 30])('acepta un periodo de prueba de %i días', (diasPrueba) => {
    expect(nuevoEstablecimiento.safeParse({ ...valido, diasPrueba }).success).toBe(true);
  });

  it.each([13, 31, 14.5])('rechaza un periodo de prueba de %s días', (diasPrueba) => {
    expect(nuevoEstablecimiento.safeParse({ ...valido, diasPrueba }).success).toBe(false);
  });

  it('rechaza un plan no definido y normaliza el correo', () => {
    expect(nuevoEstablecimiento.safeParse({ ...valido, plan: 'premium' }).success).toBe(false);
    const resultado = nuevoEstablecimiento.parse(valido);
    expect(resultado.correoAdministrador).toBe('admin@example.com');
  });
});
