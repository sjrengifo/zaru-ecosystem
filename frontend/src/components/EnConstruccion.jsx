// Marcador para páginas que aún no se han desarrollado.
// Muestra la historia de usuario y sus criterios para guiar al equipo.
export default function EnConstruccion({ titulo, historias = [] }) {
  return (
    <section>
      <h2>{titulo}</h2>
      <div className="tarjeta">
        <p>🚧 Esta pantalla está pendiente. Historias de Jira relacionadas:</p>
        <ul>
          {historias.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
