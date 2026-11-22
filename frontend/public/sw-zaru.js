// HU-40 (ZARU-70) — Service worker de las notificaciones push del cliente final.
//
// El backend envía (Web Push) un JSON { titulo, cuerpo, url, etiqueta }. Aquí se muestra la
// notificación aunque la web móvil esté cerrada, y al tocarla se abre el seguimiento del vehículo.
// No guarda caché ni intercepta peticiones: solo atiende push.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()));

self.addEventListener('push', (evento) => {
  let datos = {};
  try {
    datos = evento.data ? evento.data.json() : {};
  } catch {
    datos = { cuerpo: evento.data ? evento.data.text() : '' };
  }

  evento.waitUntil(
    self.registration.showNotification(datos.titulo || 'Zaru', {
      body: datos.cuerpo || '',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      // La misma etiqueta reemplaza la notificación anterior en vez de apilar duplicados.
      tag: datos.etiqueta || undefined,
      data: { url: datos.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = new URL(evento.notification.data?.url || '/', self.location.origin).href;

  evento.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const abierta = ventanas.find((ventana) => ventana.url === destino);
      if (abierta) return abierta.focus();
      return self.clients.openWindow(destino);
    })(),
  );
});
