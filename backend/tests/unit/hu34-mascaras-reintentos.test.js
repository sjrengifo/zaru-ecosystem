// HU-34 — Enmascarado, clasificación de errores y canal alterno.
// Sin Supabase ni red: todo se prueba en funciones puras y en el proveedor de consola.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.ZARU_CLAVE_CIFRADO ||= Buffer.alloc(32, 7).toString('base64');

const { enmascararCelular, enmascararCorreo, enmascararDestino, celularEnmascarado } = await import('../../src/shared/mascaras.js');
const { clasificarError, esperaExponencial, esperasConfiguradas, ESPERAS_POR_DEFECTO_MS } = await import('../../src/shared/reintentos.js');
const { proveedorSms, textoAvisoListo, numerosReales } = await import('../../src/shared/proveedorSms.js');
const { cifrar } = await import('../../src/shared/cifrado.js');

describe('HU-34 CA3 · datos personales enmascarados', () => {
  it('deja visibles solo los extremos del celular', () => {
    expect(enmascararCelular('3001234567')).toBe('300****567');
    expect(enmascararCelular('+57 300 123 4567')).toBe('300****567');
    expect(enmascararCelular('123456')).toBe('******');
    expect(enmascararCelular('')).toBeNull();
    expect(celularEnmascarado(null)).toBe('—');
  });

  it('deja visibles los primeros caracteres del correo y el dominio', () => {
    expect(enmascararCorreo('yeliani@gmail.com')).toBe('yel****@gmail.com');
    expect(enmascararCorreo('ab@correo.com')).toBe('a****@correo.com');
    expect(enmascararCorreo('sin-arroba')).toBeNull();
    expect(enmascararCorreo('@correo.com')).toBeNull();
  });

  it('descifra el destino antes de enmascararlo según el canal', () => {
    expect(enmascararDestino('correo', cifrar('yeliani@gmail.com'))).toBe('yel****@gmail.com');
    expect(enmascararDestino('sms', cifrar('3001234567'))).toBe('300****567');
    expect(enmascararDestino('push', 'suscripcion-larga')).toBe('su****ga');
  });

  it('tolera destinos antiguos en texto plano', () => {
    expect(enmascararDestino('correo', 'luis@correo.com')).toBe('lui****@correo.com');
    expect(enmascararDestino('sms', '3001234567')).toBe('300****567');
  });
});

describe('HU-34 RF-F6-16 · qué errores se reintentan', () => {
  it('reintenta fallos temporales: red, tiempo agotado, 429 y 5xx', () => {
    for (const mensaje of ['timeout agotado', 'ECONNRESET', '429 Too Many Requests', '503 Service Unavailable']) {
      expect(clasificarError(new Error(mensaje))).toMatchObject({ recuperable: true });
    }
  });

  it('no reintenta errores permanentes: credenciales o destinatario inválido', () => {
    for (const mensaje of ['401 Unauthorized', 'API key inválida', 'destinatario inválido', 'invalid email address', 'mailbox unavailable']) {
      expect(clasificarError(new Error(mensaje))).toMatchObject({ recuperable: false });
    }
  });

  it('respeta la marca explícita del proveedor sobre el texto', () => {
    expect(clasificarError({ message: '503', recuperable: false })).toMatchObject({ recuperable: false });
    expect(clasificarError({ message: 'rechazado', recuperable: true })).toMatchObject({ recuperable: true });
  });

  it('ante un error no tipificado reintenta, pero el máximo de intentos evita el bucle', () => {
    expect(clasificarError(new Error('algo raro pasó')).recuperable).toBe(true);
  });
});

describe('HU-34 RF-F6-18 · espera exponencial acotada', () => {
  it('crece con el intento y nunca supera la última espera configurada (con jitter ≤ 10 %)', () => {
    const esperas = [1_000, 2_000, 4_000];
    const primero = esperaExponencial(1, esperas);
    expect(primero).toBeGreaterThanOrEqual(1_000);
    expect(primero).toBeLessThanOrEqual(1_100);

    const segundo = esperaExponencial(2, esperas);
    expect(segundo).toBeGreaterThanOrEqual(2_000);
    expect(segundo).toBeLessThanOrEqual(2_200);

    const ultimo = esperaExponencial(99, esperas);
    expect(ultimo).toBeGreaterThanOrEqual(4_000);
    expect(ultimo).toBeLessThanOrEqual(4_400);
  });

  it('lee las esperas del ambiente y cae al valor por defecto si no son válidas', () => {
    expect(esperasConfiguradas('1000, 2000, 4000')).toEqual([1000, 2000, 4000]);
    expect(esperasConfiguradas('')).toEqual(ESPERAS_POR_DEFECTO_MS);
    expect(esperasConfiguradas('no,son,números')).toEqual(ESPERAS_POR_DEFECTO_MS);
  });
});

describe('HU-34 RF-F6-17 · canal alterno por SMS', () => {
  it('arma un texto corto con placa, sede y total', () => {
    const texto = textoAvisoListo({ establecimiento: { nombre: 'Lavadero Norte' }, placa: 'XYZ987', total: 30000 });
    expect(texto).toContain('XYZ987');
    expect(texto).toContain('Lavadero Norte');
    expect(texto).toContain('30.000');
  });

  it('el proveedor de consola no expone el celular completo en el log', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const proveedor = proveedorSms({ SMS_PROVEEDOR: 'consola' });
    expect(proveedor).toMatchObject({ nombre: 'consola', configurado: true });

    const resultado = await proveedor.enviar({ para: '3001234567', texto: 'Tu vehículo está listo' });
    expect(resultado.idProveedor).toMatch(/^consola-/);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('300****567'));
    expect(log.mock.calls.flat().join(' ')).not.toContain('3001234567');
    log.mockRestore();
  });

  it('Twilio sin credenciales queda no configurado y falla sin reintento', async () => {
    const proveedor = proveedorSms({ SMS_PROVEEDOR: 'twilio' });
    expect(proveedor.configurado).toBe(false);
    await expect(proveedor.enviar({ para: '3001234567', texto: 'hola' })).rejects.toMatchObject({ recuperable: false });
  });
  describe('modo mixto: consola para todos y Twilio solo para SMS_NUMEROS_REALES', () => {
    const ENV = {
      SMS_PROVEEDOR: 'mixto',
      SMS_NUMEROS_REALES: '+57 305 123 4264, 3009998877, 12345',
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'secreto',
      TWILIO_FROM: '+15550001111',
    };
    let log;
    let fetchFalso;
    beforeEach(() => {
      log = vi.spyOn(console, 'log').mockImplementation(() => {});
      fetchFalso = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ sid: 'SM1' }) }));
      vi.stubGlobal('fetch', fetchFalso);
    });
    afterEach(() => {
      log.mockRestore();
      vi.unstubAllGlobals();
    });

    it('normaliza la lista y descarta números inválidos', () => {
      expect([...numerosReales(ENV)]).toEqual(['3051234264', '3009998877']);
      expect(numerosReales({}).size).toBe(0);
    });

    it('a un número de la lista lo escribe en consola y además lo envía por Twilio', async () => {
      const resultado = await proveedorSms(ENV).enviar({ para: '3051234264', texto: 'Tu vehículo está listo' });

      expect(log).toHaveBeenCalledWith(expect.stringContaining('305****264'));
      expect(fetchFalso).toHaveBeenCalledTimes(1);
      expect(String(fetchFalso.mock.calls[0][1].body)).toContain('To=%2B573051234264');
      expect(resultado.idProveedor).toBe('SM1');
    });

    it('a un número fuera de la lista solo lo escribe en consola', async () => {
      const resultado = await proveedorSms(ENV).enviar({ para: '3001234567', texto: 'hola' });

      expect(log).toHaveBeenCalledWith(expect.stringContaining('300****567'));
      expect(fetchFalso).not.toHaveBeenCalled();
      expect(resultado.idProveedor).toMatch(/^consola-/);
    });

    it('si Twilio falla, el error se propaga para que el worker reintente', async () => {
      fetchFalso.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ message: 'caído' }) });
      await expect(proveedorSms(ENV).enviar({ para: '3051234264', texto: 'hola' })).rejects.toMatchObject({ recuperable: true });
    });
  });
});
