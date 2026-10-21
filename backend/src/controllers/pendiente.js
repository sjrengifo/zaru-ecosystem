// Respuesta temporal para rutas que aún no se han desarrollado.
export const pendiente = (hu) => (req, res) =>
  res.status(501).json({ error: `Pendiente de desarrollo (${hu})` });
