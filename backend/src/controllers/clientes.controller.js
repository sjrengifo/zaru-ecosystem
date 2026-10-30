// HU-03 y HU-04 — Lógica de clientes.
// - Multi-tenant (HU-41): todo acceso a datos pasa por req.tenant.
// - Validación (HU-43): las rutas validan con schemas/clientes.schemas.js antes de llegar aquí.
// - Cifrado (HU-50): el correo se guarda cifrado (AES-256-GCM) y se descifra solo al responder.
import { AppError } from '../shared/errores.js';
import { cifrar, descifrarCampos } from '../shared/cifrado.js';

/** Quita los caracteres que alteran la sintaxis de filtros de PostgREST (coma, paréntesis, comodines). */
const textoBuscable = (texto) => String(texto).replace(/[,()*%\\]/g, ' ').trim();

/** HU-04 CA1: listar y buscar por nombre o teléfono. */
export async function listar(req, res, next) {
  try {
    let consulta = req.tenant
      .listar('clientes', 'id, nombre, telefono, correo, vehiculos(placa)')
      .order('nombre');

    const buscar = req.query.buscar ? textoBuscable(req.query.buscar) : '';
    if (buscar) {
      consulta = consulta.or(`nombre.ilike.%${buscar}%,telefono.ilike.%${buscar}%`);
    }

    const { data, error } = await consulta;
    if (error) throw error;
    res.json(data.map((c) => descifrarCampos(c)));
  } catch (err) {
    next(err);
  }
}

export async function obtener(req, res, next) {
  try {
    res.json(descifrarCampos(await req.tenant.obtener('clientes', req.params.id, '*, vehiculos(*)', 'Cliente')));
  } catch (err) {
    next(err);
  }
}

async function buscarPorTelefono(tenant, telefono) {
  const { data, error } = await tenant.listar('clientes', 'id, nombre').eq('telefono', telefono).maybeSingle();
  if (error) throw error;
  return data;
}

const telefonoRepetido = (existente) =>
  new AppError('CONFLICTO', 'Ya existe un cliente con ese teléfono', [
    { campo: 'telefono', mensaje: `El teléfono ya está registrado a nombre de ${existente.nombre}`, clienteId: existente.id },
  ]);

/** HU-03 y HU-51: registrar cliente con autorización de datos (Ley 1581). */
export async function crear(req, res, next) {
  try {
    const { nombre, telefono, correo } = req.body;

    // CA3: teléfono repetido en el mismo establecimiento.
    const existente = await buscarPorTelefono(req.tenant, telefono);
    if (existente) throw telefonoRepetido(existente);

    // HU-51: cliente y evidencia de autorización en una sola transacción. Si la versión aceptada no es
    // la vigente, la base rechaza todo y no queda ningún dato personal guardado (CA3).
    let cliente;
    try {
      [cliente] = await req.tenant.rpc('crear_cliente_con_consentimiento', {
        p_nombre: nombre,
        p_telefono: telefono,
        p_correo: cifrar(correo),
        p_autoriza: req.body.autorizacionDatos,
        p_politica_version: req.body.politicaVersion,
        p_canal: 'panel',
        p_ip: req.ip ?? null,
        p_registrado_por: req.ctx.usuarioId,
      });
    } catch (err) {
      // CA3: dos registros simultáneos pasan la consulta anterior y la base rechaza el segundo;
      // se responde igual que un duplicado normal para poder ofrecer abrir el cliente existente.
      const ganador = err.codigo === 'CONFLICTO' ? await buscarPorTelefono(req.tenant, telefono) : null;
      throw ganador ? telefonoRepetido(ganador) : err;
    }
    res.status(201).json(descifrarCampos(cliente));
  } catch (err) {
    next(err);
  }
}

/** HU-04 CA2: editar datos de contacto. */
export async function actualizar(req, res, next) {
  try {
    const { nombre, telefono, correo } = req.body;
    const cambios = { nombre, telefono, correo: correo === undefined ? undefined : cifrar(correo) };
    res.json(descifrarCampos(await req.tenant.actualizar('clientes', req.params.id, cambios, '*', 'Cliente')));
  } catch (err) {
    next(err);
  }
}

/** HU-51: consultar la evidencia de autorización de un cliente (de la más reciente a la más antigua). */
export async function consentimientos(req, res, next) {
  try {
    await req.tenant.obtener('clientes', req.params.id, 'id', 'Cliente');
    const { data, error } = await req.tenant
      .listar('consentimientos', 'tipo, otorgado, canal, politica_version, created_at')
      .eq('cliente_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data.map((c) => ({ tipo: c.tipo, otorgado: c.otorgado, canal: c.canal, politicaVersion: c.politica_version, fecha: c.created_at })));
  } catch (err) {
    next(err);
  }
}
