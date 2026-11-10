// HU-17 CA2 — Enlace y código QR de la sede para los clientes finales.
// El administrador lo imprime en la recepción o lo comparte por WhatsApp. Al abrirlo, el cliente
// escribe su placa o su celular y entra al seguimiento de su vehículo, sin contraseña.
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, ExternalLink, QrCode } from 'lucide-react';
import { enlaceSede } from '../lib/accesoCliente.js';
import '../styles/acceso-cliente.css';

const OPCIONES_QR = { errorCorrectionLevel: 'M', margin: 1, color: { dark: '#0c1a28', light: '#ffffff' } };

export default function EnlaceClientes({ slug, nombre }) {
  const enlace = enlaceSede(slug);
  const [qr, setQr] = useState('');
  const [copiado, setCopiado] = useState(false);
  const temporizador = useRef(null);

  useEffect(() => {
    let vigente = true;
    QRCode.toString(enlace, { ...OPCIONES_QR, type: 'svg' })
      .then((svg) => vigente && setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`))
      .catch(() => vigente && setQr(''));
    return () => {
      vigente = false;
    };
  }, [enlace]);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => setCopiado(false), 2000);
    } catch {
      window.prompt('Copia el enlace para tus clientes:', enlace);
    }
  };

  const descargar = async () => {
    const png = await QRCode.toDataURL(enlace, { ...OPCIONES_QR, width: 1024 });
    const a = document.createElement('a');
    a.href = png;
    a.download = `qr-${slug}.png`;
    a.click();
  };

  return (
    <section className="tarjeta enlace-clientes" aria-labelledby="enlace-clientes-titulo">
      <div className="enlace-clientes-qr">
        {qr ? <img src={qr} alt={`Código QR para que los clientes de ${nombre} sigan su vehículo`} /> : <QrCode size={64} aria-hidden="true" />}
      </div>
      <div>
        <h3 id="enlace-clientes-titulo">Enlace para tus clientes</h3>
        <p className="texto-suave">
          Imprime el código QR en la recepción o comparte el enlace. Tus clientes escriben su placa o su celular y ven
          cómo va su vehículo, sin contraseña.
        </p>
        <code className="enlace-clientes-url">{enlace}</code>
        <div className="enlace-clientes-acciones">
          <button type="button" className="boton secundario" onClick={copiar}>
            {copiado ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            {copiado ? 'Enlace copiado' : 'Copiar enlace'}
          </button>
          <button type="button" className="boton secundario" onClick={descargar}>
            <Download size={16} aria-hidden="true" />
            Descargar QR
          </button>
          <a className="boton secundario" href={enlace} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} aria-hidden="true" />
            Abrir
          </a>
        </div>
      </div>
    </section>
  );
}
