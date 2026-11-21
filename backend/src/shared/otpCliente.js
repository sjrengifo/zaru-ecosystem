// RF-F5-11 / RF-F5-12 — Acceso del cliente final con un código de un solo uso por SMS.
//
// 1. El cliente escribe su celular. Si está registrado en la sede, le llega un código de 6 dígitos.
//    La respuesta es la misma exista o no el celular (RF-F5-11): no se revela quién es cliente.
// 2. Con el código correcto recibe el pase de 30 días (shared/paseCliente.js).
//
// Reglas (plan F5 §5, RNF-F5-02, RNF-F5-03):
// - Vigencia de 5 minutos, 5 intentos y un solo uso. Solo vale el último código pedido.
// - 3 solicitudes por celular cada 15 minutos.
// - Se guarda solo el HMAC del código, ligado al cliente: un código no sirve para otra persona.
import { createHmac, hkdfSync, randomInt, timingSafeEqual } from 'node:crypto';
import { supabase } from '../config/supabase.js';
import { crearAccesoTenant } from './tenant.js';
import { AppError } from './errores.js';
import { cargarSede } from './accesoCliente.js';
import { clavePase, firmarPase } from './paseCliente.js';
import { proveedorSms } from './proveedorSms.js';
import { conTiempoMaximo } from './correo.js';
import { enmascararCelular } from './mascaras.js';
import { crearLimiteIntentos } from './limiteIntentos.js';

export const VIGENCIA_OTP_MIN = 5;
export const MAX_INTENTOS_OTP = 5;
export const MAX_SOLICITUDES = 3;
export const VENTANA_SOLICITUDES_MS = 15 * 60 * 1000;

const MENSAJE_LIMITE = 'Pediste demasiados códigos. Espera unos minutos e inténtalo de nuevo';
const codigoInvalido = () =>
  new AppError('NO_AUTENTICADO', 'El código no es válido o ya venció. Revísalo o pide uno nuevo');

// Cuenta también los celulares que no existen, para que el límite no revele cuáles sí están registrados.
// La base vuelve a contar los de clientes reales (sobrevive a un reinicio del servidor).
export const limiteSolicitudes = crearLimiteIntentos({ maximo: MAX_SOLICITUDES, ventanaMs: VENTANA_SOLICITUDES_MS });

export const generarCodigo = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

/** Clave del HMAC de los códigos, derivada de la del pase (no se reutiliza la misma clave). */
function claveCodigo() {
  return Buffer.from(hkdfSync('sha256', clavePase(), Buffer.from('zaru'), Buffer.from('otp-acceso-cliente-v1'), 32));
}

export function hashCodigo(clienteId, codigo) {
  return createHmac('sha256', claveCodigo()).update(`${clienteId}:${codigo}`).digest('hex');
}

const iguales = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

export const textoCodigoAcceso = (codigo, sede) =>
  `${codigo} es tu código para entrar a ${sede?.nombre ?? 'tu car wash'}. Vence en ${VIGENCIA_OTP_MIN} minutos. No lo compartas.`;

async function contexto(slug, celular, db) {
  const sede = await cargarSede(slug, { db });
  const tenant = crearAccesoTenant(db, { establecimientoId: sede.id });
  const { data: cliente, error } = await tenant
    .listar('clientes', 'id, nombre')
    .eq('telefono', celular)
    .maybeSingle();
  if (error) throw error;
  return { sede, tenant, cliente };
}

/**
 * RF-F5-11: envía el código al celular registrado. `celular` llega normalizado (10 dígitos).
 * @returns {Promise<{ enviado: true, celular: string, expiraEn: string }>} igual para cualquier celular
 */
export async function solicitarCodigoAcceso(
  slug,
  { celular },
  { db = supabase, ahora = new Date(), proveedor, generar = generarCodigo } = {},
) {
  const { sede, tenant, cliente } = await contexto(slug, celular, db);

  const claveLimite = `${sede.id}:${celular}`;
  try {
    limiteSolicitudes.verificar(claveLimite);
  } catch {
    throw new AppError('LIMITE_EXCEDIDO', MENSAJE_LIMITE);
  }
  limiteSolicitudes.registrarFallo(claveLimite);

  const expiraEn = new Date(ahora.getTime() + VIGENCIA_OTP_MIN * 60_000);
  const respuesta = { enviado: true, celular: enmascararCelular(celular), expiraEn: expiraEn.toISOString() };
  if (!cliente) return respuesta;

  const { count, error } = await tenant
    .listar('otp_codigos', 'id', { count: 'exact', head: true })
    .eq('cliente_id', cliente.id)
    .gte('created_at', new Date(ahora.getTime() - VENTANA_SOLICITUDES_MS).toISOString());
  if (error) throw error;
  if ((count ?? 0) >= MAX_SOLICITUDES) throw new AppError('LIMITE_EXCEDIDO', MENSAJE_LIMITE);

  const codigo = generar();
  const fila = await tenant.crear('otp_codigos', {
    cliente_id: cliente.id,
    codigo_hash: hashCodigo(cliente.id, codigo),
    expira_at: expiraEn.toISOString(),
  }, 'id');

  try {
    const sms = proveedor ?? proveedorSms();
    await conTiempoMaximo(sms.enviar({ para: celular, texto: textoCodigoAcceso(codigo, sede) }));
  } catch (err) {
    console.error('[RF-F5-11] No se pudo enviar el código de acceso:', err?.message ?? err);
    // Un código que no salió no debe quedar vigente.
    await tenant.actualizar('otp_codigos', fila.id, { usado_at: ahora.toISOString() }, 'id', 'Código').catch(() => {});
    throw new AppError('ERROR_INTERNO', 'No pudimos enviar el código por SMS. Inténtalo de nuevo en unos minutos');
  }
  return respuesta;
}

/**
 * RF-F5-12: valida el código y emite el pase. Cualquier fallo responde igual (401), exista o no el
 * celular. Con 5 intentos fallidos el código queda invalidado.
 */
export async function verificarCodigoAcceso(slug, { celular, codigo }, { db = supabase, ahora = new Date() } = {}) {
  const { sede, tenant, cliente } = await contexto(slug, celular, db);
  if (!cliente) throw codigoInvalido();

  const { data, error } = await tenant
    .listar('otp_codigos', 'id, codigo_hash, intentos, expira_at, usado_at')
    .eq('cliente_id', cliente.id)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const otp = data?.[0];
  if (!otp || otp.usado_at || otp.intentos >= MAX_INTENTOS_OTP) throw codigoInvalido();
  if (new Date(otp.expira_at).getTime() <= ahora.getTime()) throw codigoInvalido();

  // La condición sobre `intentos` evita que dos peticiones en paralelo usen o adivinen el mismo código.
  const cerrar = (cambios) =>
    tenant.actualizar('otp_codigos', otp.id, cambios, 'id', 'Código', { intentos: otp.intentos });

  if (!iguales(hashCodigo(cliente.id, codigo), otp.codigo_hash)) {
    const intentos = otp.intentos + 1;
    await cerrar({ intentos, ...(intentos >= MAX_INTENTOS_OTP ? { usado_at: ahora.toISOString() } : {}) })
      .catch((err) => {
        if (err?.codigo !== 'NO_ENCONTRADO') throw err;
      });
    throw codigoInvalido();
  }

  try {
    await cerrar({ usado_at: ahora.toISOString() });
  } catch (err) {
    if (err?.codigo === 'NO_ENCONTRADO') throw codigoInvalido();
    throw err;
  }

  const { pase, expiraEn } = firmarPase({ establecimientoId: sede.id, clienteId: cliente.id, ahora: ahora.getTime() });
  return {
    pase,
    expiraEn,
    sede: { slug: sede.slug, nombre: sede.nombre },
    cliente: { nombre: cliente.nombre },
  };
}
