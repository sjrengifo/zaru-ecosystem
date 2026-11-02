// HU-03, HU-04 y HU-52 — Lógica de clientes.
// - Multi-tenant (HU-41): todo acceso a datos pasa por req.tenant.
// - Validación (HU-43): las rutas validan con schemas/clientes.schemas.js antes de llegar aquí.
// - Cifrado (HU-50): el correo se guarda cifrado (AES-256-GCM) y se descifra solo al responder.
import { AppError, noEncontrado } from '../shared/errores.js';
import { cifrar, descifrarCampos } from '../shared/cifrado.js';
import { registrarAuditoria } from '../shared/auditoria.js';

/** Quita los caracteres que alteran la sintaxis de filtros de PostgREST (coma, paréntesis, comodines). */
const textoBuscable = (texto) => String(texto).replace(/[,()*%\\]/g, ' ').trim();

const COLUMNAS_LISTA = 'id, nombre, telefono, correo, vehiculos(placa)';

/** Búsqueda mientras un ambiente no tenga la migración de buscar_clientes: igual, pero distingue tildes. */
async function buscarSinFuncion(tenant, buscar) {
  const texto = textoBuscable(buscar);
  if (!texto) return [];
  const compacto = texto.replace(/[\s-]/g, '');
  const filtros = [`nombre.ilike.%${texto}%`];
  if (compacto) {
    const { data: vehiculos, error } = await tenant.listar('vehiculos', 'cliente_id').ilike('placa', `%${compacto}%`);
    if (error) throw error;
    filtros.push(`telefono.ilike.%${compacto}%`);
    if (vehiculos.length) filtros.push(`id.in.(${vehiculos.map((v) => v.cliente_id).join(',')})`);
  }
  const { data, error } = await tenant.listar('clientes', COLUMNAS_LISTA).or(filtros.join(',')).order('nombre');
  if (error) throw error;
  return data;
}

/** HU-04 CA1: buscar por nombre, teléfono o placa, sin distinguir tildes ni mayúsculas. */
async function buscarClientes(tenant, buscar) {
  const { data, error } = await tenant.consultarFuncion('buscar_clientes', { p_texto: buscar }, COLUMNAS_LISTA).order('nombre');
  if (error?.code === 'PGRST202') return buscarSinFuncion(tenant, buscar); // La función aún no existe en este ambiente.
  if (error) throw error;
  return data;
}

export async function listar(req, res, next) {
  try {
    const buscar = req.query.buscar;
    let clientes;
    if (buscar) {
      clientes = await buscarClientes(req.tenant, buscar);
    } else {
      const { data, error } = await req.tenant.listar('clientes', COLUMNAS_LISTA).order('nombre');
      if (error) throw error;
      clientes = data;
    }
    res.json(clientes.map((c) => descifrarCampos(c)));
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
    let cliente;
    try {
      cliente = await req.tenant.actualizar('clientes', req.params.id, cambios, '*', 'Cliente');
    } catch (err) {
      // El teléfono ya es de otro cliente: se responde igual que al registrar (HU-03 CA3).
      const dueno = err.codigo === 'CONFLICTO' && telefono ? await buscarPorTelefono(req.tenant, telefono) : null;
      throw dueno && dueno.id !== req.params.id ? telefonoRepetido(dueno) : err;
    }
    res.json(descifrarCampos(cliente));
  } catch (err) {
    next(err);
  }
}

/**
 * HU-52 CA1: eliminar los datos personales de un cliente a su solicitud. Es irreversible.
 * La auditoría solo guarda el identificador y las cantidades: ningún dato personal del titular.
 */
export async function eliminar(req, res, next) {
  try {
    await req.tenant.obtener('clientes', req.params.id, 'id', 'Cliente');

    let resultado;
    try {
      resultado = await req.tenant.rpc('eliminar_cliente', { p_cliente_id: req.params.id });
    } catch (err) {
      if (err.code === 'PGRST202') throw new AppError('NO_IMPLEMENTADO', 'Eliminar clientes aún no está disponible en este ambiente');
      throw err;
    }

    if (resultado.resultado === 'no_encontrado') throw noEncontrado('Cliente');
    if (resultado.resultado === 'servicios_en_curso') {
      throw new AppError('CONFLICTO', 'Este cliente tiene un servicio en curso. Podrás eliminarlo cuando se entregue el vehículo.');
    }

    await registrarAuditoria(req, {
      accion: 'ELIMINAR_CLIENTE',
      resultado: 'permitido',
      detalle: { vehiculos: resultado.vehiculos, ordenesConservadas: resultado.ordenes },
    });
    res.status(204).end();
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
