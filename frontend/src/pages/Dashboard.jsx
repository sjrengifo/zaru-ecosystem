// HU-08, HU-09, HU-10, HU-11 · Dashboard operativo en tiempo real (ZARU-9 a ZARU-12)
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const ESTADOS = [
  { id: 'recibido', titulo: 'Recibido' },
  { id: 'en_lavado', titulo: 'En lavado' },
  { id: 'listo', titulo: 'Listo' },
  { id: 'entregado', titulo: 'Entregado' },
];

export default function Dashboard() {
  const [ordenes, setOrdenes] = useState([]);

  async function cargarOrdenes() {
    // TODO HU-09: cambiar por api.get('/ordenes/activas') cuando el backend esté listo.
    const { data } = await supabase
      .from('ordenes')
      .select('id, estado, created_at, vehiculos(placa)')
      .order('created_at');
    setOrdenes(data || []);
  }

  useEffect(() => {
    cargarOrdenes();

    // HU-09 CA2: escuchar cambios en tiempo real, sin recargar la página.
    const canal = supabase
      .channel('ordenes-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes' }, cargarOrdenes)
      .subscribe();

    return () => supabase.removeChannel(canal);
  }, []);

  return (
    <section>
      <div className="encabezado">
        <h2>Dashboard</h2>
        {/* TODO HU-08: abrir formulario de ingreso de vehículo */}
        <button className="boton">+ Ingresar vehículo</button>
      </div>

      {/* TODO HU-09 CA3: resumen del día (vehículos atendidos e ingresos) */}

      <div className="tablero">
        {ESTADOS.map((estado) => (
          <div key={estado.id} className="columna">
            <h3>{estado.titulo}</h3>
            {ordenes
              .filter((o) => o.estado === estado.id)
              .map((o) => (
                // TODO HU-10: botón para avanzar estado (máx. 2 clics)
                // TODO HU-11: resaltar si supera la duración estimada
                <div key={o.id} className="tarjeta tarjeta-vehiculo">
                  <strong>{o.vehiculos?.placa}</strong>
                  <span className="texto-suave">
                    {new Date(o.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}
