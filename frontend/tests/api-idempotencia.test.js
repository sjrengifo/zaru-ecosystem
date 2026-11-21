// HU-35 — El cliente HTTP acepta encabezados propios sin perder el token ni el Content-Type.
// Lo usan las campañas para enviar `Idempotency-Key` al confirmar.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'token-1' } } })), signOut: vi.fn() } },
}));
vi.mock('../src/lib/brandingGuardado.js', () => ({ borrarBranding: vi.fn() }));

const { api } = await import('../src/services/api.js');

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ guardado: true }) })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ultimaPeticion = () => globalThis.fetch.mock.calls.at(-1);

describe('HU-35 · encabezados del cliente HTTP', () => {
  it('envía el Idempotency-Key junto al token y al Content-Type', async () => {
    const respuesta = await api.post('/campanas', { promocionId: 'p1' }, { headers: { 'Idempotency-Key': 'clave-123' } });

    expect(respuesta).toEqual({ guardado: true });
    const [url, opciones] = ultimaPeticion();
    expect(url).toContain('/campanas');
    expect(opciones.method).toBe('POST');
    expect(opciones.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer token-1',
      'Idempotency-Key': 'clave-123',
    });
    expect(opciones.body).toBe(JSON.stringify({ promocionId: 'p1' }));
  });

  it('sin opciones no agrega encabezados extra', async () => {
    await api.post('/promociones', { nombre: 'Promo' });

    const [, opciones] = ultimaPeticion();
    expect(opciones.headers).not.toHaveProperty('Idempotency-Key');
    expect(opciones.headers.Authorization).toBe('Bearer token-1');
  });

  it('GET no envía cuerpo y conserva el token', async () => {
    await api.get('/campanas?pagina=1');

    const [url, opciones] = ultimaPeticion();
    expect(url).toContain('/campanas?pagina=1');
    expect(opciones.method).toBe('GET');
    expect(opciones.body).toBeUndefined();
    expect(opciones.headers.Authorization).toBe('Bearer token-1');
  });
});
