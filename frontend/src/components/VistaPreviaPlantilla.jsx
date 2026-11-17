// HU-32 CA3 — Cómo se verá el mensaje en push, SMS y correo, con datos de ejemplo y la marca de la sede.
// El correo llega ya armado desde la API (con los datos escapados) y se muestra en un iframe aislado
// (sandbox sin scripts), igual que lo vería un cliente de correo.
import { Bell, Mail, MessageSquare } from 'lucide-react';
import { avisoPartes, explicacionTildes, textoPartes } from '../lib/plantillas.js';

function Canal({ icono: Icono, titulo, editado, children }) {
  return (
    <section className="previa-canal" aria-label={`Vista previa: ${titulo}`}>
      <h4 className="previa-canal-titulo">
        <Icono size={16} aria-hidden="true" /> {titulo}
        {editado && <span className="insignia insignia-pendiente">Lo que estás editando</span>}
      </h4>
      {children}
    </section>
  );
}

export default function VistaPreviaPlantilla({ previa }) {
  const { sede, push, sms, correo, datosEjemplo, canalEditado } = previa;
  const color = sede?.colorPrimario ?? undefined;
  const avisoSms = sms && avisoPartes(sms.segmentos);
  const tildes = sms && sms.codificacion === 'UCS-2' ? explicacionTildes(sms.caracteresEspeciales) : null;

  return (
    <div className="previa" style={color ? { '--previa-color': color } : undefined}>
      <p className="texto-suave previa-datos">
        Datos de ejemplo: {datosEjemplo.nombre_cliente} · placa {datosEjemplo.placa} · {datosEjemplo.hora} · {datosEjemplo.sede}
      </p>
      <div className="previa-canales">
        <Canal icono={Bell} titulo="Notificación push" editado={canalEditado === 'push'}>
          {push ? (
            <div className="previa-push">
              {sede?.logoUrl ? (
                <img className="previa-push-logo" src={sede.logoUrl} alt={`Logo de ${sede.nombre}`} />
              ) : (
                <span className="previa-push-logo previa-push-inicial" aria-hidden="true">{sede?.nombre?.[0] ?? 'Z'}</span>
              )}
              <div>
                <p className="previa-push-app">{sede?.nombre} · ahora</p>
                <p className="previa-push-titulo">{push.titulo}</p>
                <p className="previa-push-texto">{push.texto}</p>
              </div>
            </div>
          ) : (
            <p className="texto-suave">Sin plantilla.</p>
          )}
        </Canal>

        <Canal icono={MessageSquare} titulo="SMS" editado={canalEditado === 'sms'}>
          {sms ? (
            <>
              <p className="previa-sms">{sms.texto}</p>
              <p className="previa-sms-conteo">
                {sms.caracteres} caracteres · {textoPartes(sms.segmentos)}
              </p>
              {avisoSms && <p className="aviso aviso-advertencia previa-aviso">{avisoSms}</p>}
              {tildes && <p className="aviso aviso-info previa-aviso">{tildes}</p>}
            </>
          ) : (
            <p className="texto-suave">Sin plantilla.</p>
          )}
        </Canal>

        <Canal icono={Mail} titulo="Correo" editado={canalEditado === 'correo'}>
          {correo ? (
            <>
              <p className="previa-correo-asunto"><span className="texto-suave">Asunto:</span> {correo.asunto}</p>
              <iframe className="previa-correo" title={`Correo de ejemplo: ${correo.asunto}`} sandbox="" srcDoc={correo.html} />
            </>
          ) : (
            <p className="texto-suave">Sin plantilla.</p>
          )}
        </Canal>
      </div>
    </div>
  );
}
