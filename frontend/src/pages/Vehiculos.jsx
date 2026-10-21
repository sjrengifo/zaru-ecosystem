// HU-05 y HU-06 · Vehículos (ZARU-6, ZARU-7)
import EnConstruccion from '../components/EnConstruccion.jsx';

export default function Vehiculos() {
  return (
    <EnConstruccion
      titulo="Vehículos"
      historias={['ZARU-6 · HU-05 Registrar vehículo asociado a un cliente', 'ZARU-7 · HU-06 Consultar historial de servicios']}
    />
  );
}
