// Punto de entrada: enciende el servidor.
import app from './app.js';

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`API de Zaru corriendo en http://localhost:${PORT}`);
});
