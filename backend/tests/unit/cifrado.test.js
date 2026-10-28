// HU-50 CA2: cifrado de campos con AES-256-GCM.
import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { cifrar, descifrar, descifrarCampos, estaCifrado } from '../../src/shared/cifrado.js';

beforeAll(() => {
  process.env.ZARU_CLAVE_CIFRADO ||= randomBytes(32).toString('base64');
});

describe('cifrado de campos', () => {
  it('el valor guardado no contiene el texto original y se recupera al descifrar', () => {
    const guardado = cifrar('ana.gomez@correo.com');
    expect(guardado.startsWith('v1:')).toBe(true);
    expect(guardado).not.toContain('ana');
    expect(descifrar(guardado)).toBe('ana.gomez@correo.com');
  });

  it('el mismo texto produce un cifrado distinto cada vez (IV aleatorio)', () => {
    expect(cifrar('ana@correo.com')).not.toBe(cifrar('ana@correo.com'));
  });

  it('un valor alterado en la base no se descifra (integridad GCM)', () => {
    const guardado = cifrar('ana@correo.com');
    const bytes = Buffer.from(guardado.slice(3), 'base64');
    bytes[bytes.length - 1] ^= 1;
    expect(() => descifrar(`v1:${bytes.toString('base64')}`)).toThrow();
  });

  it('con otra clave no se puede descifrar', () => {
    const guardado = cifrar('ana@correo.com');
    const original = process.env.ZARU_CLAVE_CIFRADO;
    process.env.ZARU_CLAVE_CIFRADO = randomBytes(32).toString('base64');
    expect(() => descifrar(guardado)).toThrow();
    process.env.ZARU_CLAVE_CIFRADO = original;
  });

  it('sin clave configurada no cifra (falla cerrado en vez de guardar en claro)', () => {
    const original = process.env.ZARU_CLAVE_CIFRADO;
    delete process.env.ZARU_CLAVE_CIFRADO;
    expect(() => cifrar('ana@correo.com')).toThrow(/ZARU_CLAVE_CIFRADO/);
    process.env.ZARU_CLAVE_CIFRADO = original;
  });

  it('null se conserva y los datos anteriores en claro se leen mientras se migran', () => {
    expect(cifrar(null)).toBeNull();
    expect(descifrar('legado@correo.com')).toBe('legado@correo.com');
    expect(estaCifrado('legado@correo.com')).toBe(false);
  });

  it('descifrarCampos solo toca los campos indicados', () => {
    const fila = { id: '1', nombre: 'Ana', correo: cifrar('ana@correo.com') };
    expect(descifrarCampos(fila)).toEqual({ id: '1', nombre: 'Ana', correo: 'ana@correo.com' });
  });
});
