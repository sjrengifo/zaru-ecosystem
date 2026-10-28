// Prototipo del Spike HU-58 (ZARU-64).
// Comprueba, con dos establecimientos de prueba, que:
//   1. Cada administrador solo ve las filas de su establecimiento (RLS).
//   2. Un administrador no puede leer ni modificar datos del otro.
//   3. Un cambio de estado en `ordenes` llega por Supabase Realtime solo
//      al establecimiento dueño de la orden.
//
// Uso:
//   node --env-file=.env.spike.local scripts/spike-hu58.mjs [segundosDeEspera]
//
// Mientras el script espera, cambie el estado de la orden del establecimiento A
// (por ejemplo desde el SQL Editor de Supabase):
//   update ordenes set estado = 'en_lavado', estado_desde = now()
//   where id = '00000000-0000-0000-0000-0000000a0d58';
//
// El resultado queda en docs/arquitectura/spike-hu58-resultado.json.

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SPIKE_A_EMAIL,
  SPIKE_B_EMAIL,
  SPIKE_PASSWORD,
} = process.env;

for (const [nombre, valor] of Object.entries({ SUPABASE_URL, SUPABASE_ANON_KEY, SPIKE_A_EMAIL, SPIKE_B_EMAIL, SPIKE_PASSWORD })) {
  if (!valor) {
    console.error(`Falta la variable ${nombre}`);
    process.exit(1);
  }
}

const ESPERA_SEGUNDOS = Number(process.argv[2] ?? 60);
const ORDEN_A = '00000000-0000-0000-0000-0000000a0d58';
const ORDEN_B = '00000000-0000-0000-0000-0000000b0d58';
const TABLAS = ['establecimientos', 'perfiles', 'clientes', 'vehiculos', 'ordenes'];

const pruebas = [];
const registrar = (nombre, ok, detalle) => {
  pruebas.push({ nombre, ok, detalle });
  console.log(`${ok ? 'PASA ' : 'FALLA'}  ${nombre}${detalle ? `  (${detalle})` : ''}`);
};

async function iniciarSesion(email) {
  const cliente = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await cliente.auth.signInWithPassword({ email, password: SPIKE_PASSWORD });
  if (error) throw new Error(`No se pudo iniciar sesión con ${email}: ${error.message}`);
  const { data: perfil } = await cliente.from('perfiles').select('establecimiento_id').eq('id', data.user.id).single();
  return { cliente, email, establecimientoId: perfil?.establecimiento_id };
}

async function probarAislamiento(sesion, otra, etiqueta) {
  for (const tabla of TABLAS) {
    const columna = tabla === 'establecimientos' ? 'id' : 'establecimiento_id';
    const { data, error } = await sesion.cliente.from(tabla).select(columna);
    if (error) {
      registrar(`${etiqueta} lee ${tabla}`, false, error.message);
      continue;
    }
    const ajenas = data.filter((fila) => fila[columna] !== sesion.establecimientoId).length;
    registrar(`${etiqueta} solo ve filas propias en ${tabla}`, data.length > 0 && ajenas === 0, `${data.length} propias, ${ajenas} ajenas`);
  }

  const ordenAjena = otra === 'A' ? ORDEN_A : ORDEN_B;
  const { data: lectura } = await sesion.cliente.from('ordenes').select('id').eq('id', ordenAjena);
  registrar(`${etiqueta} no puede leer la orden del establecimiento ${otra} por su id`, (lectura ?? []).length === 0, `${(lectura ?? []).length} filas`);

  const { data: cambio } = await sesion.cliente
    .from('ordenes')
    .update({ estado: 'entregado' })
    .eq('id', ordenAjena)
    .select('id');
  registrar(`${etiqueta} no puede modificar la orden del establecimiento ${otra}`, (cambio ?? []).length === 0, `${(cambio ?? []).length} filas modificadas`);

  const { error: errorInsercion } = await sesion.cliente
    .from('clientes')
    .insert({ establecimiento_id: sesion.establecimientoId, nombre: 'Intruso', telefono: '3999999999', autorizacion_datos: true });
  registrar(`${etiqueta} no escribe directo en la base (ADR-01: solo el backend escribe)`, Boolean(errorInsercion), errorInsercion?.code ?? 'insertó');
}

function escuchar(sesion, etiqueta, eventos) {
  return new Promise((resolver) => {
    sesion.cliente
      .channel(`spike-${etiqueta}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes' }, (payload) => {
        const evento = {
          recibidoPor: etiqueta,
          tipo: payload.eventType,
          ordenId: payload.new?.id,
          establecimientoId: payload.new?.establecimiento_id,
          estado: payload.new?.estado,
          latenciaMs: payload.commit_timestamp ? Date.now() - Date.parse(payload.commit_timestamp) : null,
        };
        eventos.push(evento);
        console.log(`EVENTO  ${etiqueta} recibió ${evento.tipo} de la orden ${evento.ordenId} (estado ${evento.estado}, ${evento.latenciaMs} ms)`);
      })
      .subscribe((estado) => {
        if (estado === 'SUBSCRIBED') resolver();
      });
  });
}

const inicio = new Date();
console.log(`Spike HU-58 · ${inicio.toISOString()}\n`);

const a = await iniciarSesion(SPIKE_A_EMAIL);
const b = await iniciarSesion(SPIKE_B_EMAIL);
registrar('Inicio de sesión de los dos administradores', Boolean(a.establecimientoId && b.establecimientoId && a.establecimientoId !== b.establecimientoId));

console.log('\n1. Aislamiento de datos (RLS)');
await probarAislamiento(a, 'B', 'A');
await probarAislamiento(b, 'A', 'B');

console.log('\n2. Tiempo real (Supabase Realtime)');
const eventos = [];
await Promise.all([escuchar(a, 'A', eventos), escuchar(b, 'B', eventos)]);
console.log(`Suscripciones activas. Esperando cambios durante ${ESPERA_SEGUNDOS} s...`);

const limite = Date.now() + ESPERA_SEGUNDOS * 1000;
while (Date.now() < limite && !eventos.some((e) => e.recibidoPor === 'A')) {
  await new Promise((r) => setTimeout(r, 500));
}
await new Promise((r) => setTimeout(r, 3000)); // margen para detectar fugas hacia B

const recibidosA = eventos.filter((e) => e.recibidoPor === 'A' && e.establecimientoId === a.establecimientoId);
const fugasB = eventos.filter((e) => e.recibidoPor === 'B' && e.establecimientoId !== b.establecimientoId);
registrar('El establecimiento A recibe en tiempo real el cambio de su orden', recibidosA.length > 0, recibidosA[0] ? `${recibidosA[0].latenciaMs} ms` : 'sin eventos');
registrar('El establecimiento B no recibe cambios de órdenes ajenas', fugasB.length === 0, `${fugasB.length} eventos ajenos`);

await a.cliente.removeAllChannels();
await b.cliente.removeAllChannels();

const total = pruebas.length;
const aprobadas = pruebas.filter((p) => p.ok).length;
console.log(`\nResultado: ${aprobadas}/${total} pruebas aprobadas`);

const salida = resolve(dirname(fileURLToPath(import.meta.url)), '../../docs/arquitectura/spike-hu58-resultado.json');
mkdirSync(dirname(salida), { recursive: true });
writeFileSync(
  salida,
  JSON.stringify({ fecha: inicio.toISOString(), aprobadas, total, pruebas, eventos }, null, 2) + '\n',
);
process.exit(aprobadas === total ? 0 : 1);
