// HU-57: integración del ciclo de vida de un establecimiento afiliado.
// Usa Supabase real para Postgres/Auth, pero simula únicamente el envío del correo de invitación:
// la simulación crea un usuario Auth confirmado para poder probar el inicio de sesión.
// Requiere un proyecto Supabase EXCLUSIVO para pruebas y ZARU_INTEGRATION_TEST=true.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import '../helpers/entorno.js'; // carga backend/.env y backend/.env.spike.local si existen.

const variablesRequeridas = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'];
const faltantes = variablesRequeridas.filter((nombre) => !process.env[nombre]);
const habilitada = process.env.ZARU_INTEGRATION_TEST === 'true' && faltantes.length === 0;
const motivoOmitida = process.env.ZARU_INTEGRATION_TEST !== 'true'
  ? 'define ZARU_INTEGRATION_TEST=true solo después de confirmar que Supabase es un proyecto exclusivo de pruebas'
  : `faltan variables: ${faltantes.join(', ')}`;

const base = `hu57-${randomUUID()}`;
const superadmin = {
  email: `${base}-superadmin@zaru.test`,
  password: `Zaru-${randomUUID()}-Aa1!`,
};
const administrador = {
  email: `${base}-admin@zaru.test`,
  password: `Zaru-${randomUUID()}-Bb2!`,
};

// El nombre del test incluye la razón para que Vitest deje claro por qué se omitió.
describe.skipIf(!habilitada)(`HU-57 · integración${habilitada ? '' : ` (omitida: ${motivoOmitida})`}`, () => {
  let request;
  let app;
  let admin;
  let crearCliente;
  let tokenSuperadmin;
  let tokenAdministrador;
  let idSuperadmin;
  let idAdministrador;
  let idEstablecimiento;
  let idCliente;
  let invitacionSpy;

  async function iniciarSesion(email, password) {
    const cliente = crearCliente(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await cliente.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session.access_token;
  }

  const conSuperadmin = (peticion) => peticion.set('Authorization', `Bearer ${tokenSuperadmin}`);
  const conAdministrador = (peticion) => peticion.set('Authorization', `Bearer ${tokenAdministrador}`);

  beforeAll(async () => {
    request = (await import('supertest')).default;
    app = (await import('../../src/app.js')).default;
    admin = (await import('../../src/config/supabase.js')).supabase;
    ({ createClient: crearCliente } = await import('@supabase/supabase-js'));

    // Usuario global de prueba: no pertenece a ningún establecimiento.
    const altaSuperadmin = await admin.auth.admin.createUser({
      email: superadmin.email,
      password: superadmin.password,
      email_confirm: true,
    });
    if (altaSuperadmin.error) throw altaSuperadmin.error;
    idSuperadmin = altaSuperadmin.data.user.id;

    const perfilSuperadmin = await admin.from('perfiles').insert({
      id: idSuperadmin,
      establecimiento_id: null,
      nombre: '[HU-57] Superadministrador de prueba',
      rol: 'superadmin',
      activo: true,
    });
    if (perfilSuperadmin.error) throw perfilSuperadmin.error;

    tokenSuperadmin = await iniciarSesion(superadmin.email, superadmin.password);

    // El endpoint real llama a inviteUserByEmail. Para no enviar correos reales en cada ejecución,
    // interceptamos esa llamada y creamos un usuario Auth confirmado con el Admin API real.
    invitacionSpy = vi.spyOn(admin.auth.admin, 'inviteUserByEmail').mockImplementation(async (email, opciones) => {
      const alta = await admin.auth.admin.createUser({
        email,
        password: administrador.password,
        email_confirm: true,
        user_metadata: opciones?.data ?? {},
      });
      if (alta.error) return { data: null, error: alta.error };
      idAdministrador = alta.data.user.id;
      return { data: { user: alta.data.user }, error: null };
    });
  }, 60000);

  afterAll(async () => {
    invitacionSpy?.mockRestore();

    // Limpieza de los datos creados por esta prueba; no se borran establecimientos ajenos.
    if (idCliente) await admin.from('clientes').delete().eq('id', idCliente);
    if (idEstablecimiento) await admin.from('establecimientos').delete().eq('id', idEstablecimiento);
    if (idAdministrador) await admin.auth.admin.deleteUser(idAdministrador);
    if (idSuperadmin) await admin.auth.admin.deleteUser(idSuperadmin);
  }, 60000);

  it('CA1, CA2 y CA3: registra, vence, activa, suspende y conserva los datos del establecimiento', async () => {
    // CA1: alta del establecimiento e invitación del administrador inicial.
    const alta = await conSuperadmin(
      request(app).post('/api/superadmin/establecimientos'),
    ).send({
      nombre: `Establecimiento ${base}`,
      plan: 'basico',
      correoAdministrador: administrador.email,
      diasPrueba: 14,
    });

    expect(alta.status).toBe(201);
    expect(alta.body.establecimiento).toMatchObject({
      nombre: `Establecimiento ${base}`,
      plan: 'basico',
      estado: 'prueba',
    });
    expect(alta.body.invitacion).toEqual({ correo: administrador.email, enviada: true });
    expect(invitacionSpy).toHaveBeenCalledWith(administrador.email, expect.objectContaining({
      redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/aceptar-invitacion`,
    }));

    idEstablecimiento = alta.body.establecimiento.id;
    expect(idAdministrador).toBeTruthy();

    const { data: perfil, error: errorPerfil } = await admin
      .from('perfiles')
      .select('id, establecimiento_id, nombre, rol, activo')
      .eq('id', idAdministrador)
      .single();
    expect(errorPerfil).toBeNull();
    expect(perfil).toMatchObject({
      id: idAdministrador,
      establecimiento_id: idEstablecimiento,
      rol: 'admin',
      activo: true,
    });

    tokenAdministrador = await iniciarSesion(administrador.email, administrador.password);
    const sesionInicial = await conAdministrador(request(app).get('/api/me'));
    expect(sesionInicial.status).toBe(200);
    expect(sesionInicial.body.establecimiento).toMatchObject({ id: idEstablecimiento, estado: 'prueba' });

    // CA1/CA2: crea un dato de negocio para comprobar que la suspensión no lo elimina.
    const altaCliente = await admin.from('clientes').insert({
      establecimiento_id: idEstablecimiento,
      nombre: '[HU-57] Cliente de prueba',
      telefono: `57${Date.now()}`,
      autorizacion_datos: true,
    }).select('id').single();
    expect(altaCliente.error).toBeNull();
    idCliente = altaCliente.data.id;

    const listadoInicial = await conSuperadmin(request(app).get('/api/superadmin/establecimientos'));
    expect(listadoInicial.status).toBe(200);
    expect(listadoInicial.body.some((item) => item.id === idEstablecimiento)).toBe(true);

    const inicioPruebaVencida = new Date(
      Date.now() - 15 * 24 * 60 * 60 * 1000
    );

    const finPruebaVencida = new Date(
      inicioPruebaVencida.getTime() + 14 * 24 * 60 * 60 * 1000
    );

    const vencimiento = await admin
      .from('establecimientos')
      .update({
        prueba_inicia_at: inicioPruebaVencida.toISOString(),
        prueba_finaliza_at: finPruebaVencida.toISOString(),
      })
      .eq('id', idEstablecimiento);

    expect(vencimiento.error).toBeNull();

    const listadoVencido = await conSuperadmin(request(app).get('/api/superadmin/establecimientos'));
    expect(listadoVencido.status).toBe(200);
    expect(listadoVencido.body.find((item) => item.id === idEstablecimiento)?.estado).toBe('pendiente_activacion');

    const accesoVencido = await conAdministrador(request(app).get('/api/me'));
    expect(accesoVencido.status).toBe(401);
    expect(accesoVencido.body.error.codigo).toBe('NO_AUTENTICADO');

    // CA3: el superadministrador activa el establecimiento y el administrador recupera el acceso.
    const activacion = await conSuperadmin(
      request(app).post(`/api/superadmin/establecimientos/${idEstablecimiento}/activar`),
    ).send({});
    expect(activacion.status).toBe(200);
    expect(activacion.body.estado).toBe('activo');

    const accesoActivo = await conAdministrador(request(app).get('/api/me'));
    expect(accesoActivo.status).toBe(200);
    expect(accesoActivo.body.establecimiento.id).toBe(idEstablecimiento);

    // CA3: suspender bloquea el acceso sin borrar el establecimiento ni sus datos.
    const suspension = await conSuperadmin(
      request(app).post(`/api/superadmin/establecimientos/${idEstablecimiento}/suspender`),
    ).send({});
    expect(suspension.status).toBe(200);
    expect(suspension.body.estado).toBe('suspendido');

    const accesoSuspendido = await conAdministrador(request(app).get('/api/me'));
    expect(accesoSuspendido.status).toBe(401);
    expect(accesoSuspendido.body.error.codigo).toBe('NO_AUTENTICADO');

    const { data: establecimientoConservado, error: errorEstablecimiento } = await admin
      .from('establecimientos')
      .select('id, estado')
      .eq('id', idEstablecimiento)
      .single();
    expect(errorEstablecimiento).toBeNull();
    expect(establecimientoConservado.estado).toBe('suspendido');

    const { data: clienteConservado, error: errorCliente } = await admin
      .from('clientes')
      .select('id, establecimiento_id')
      .eq('id', idCliente)
      .single();
    expect(errorCliente).toBeNull();
    expect(clienteConservado.establecimiento_id).toBe(idEstablecimiento);
  }, 60000);
});
