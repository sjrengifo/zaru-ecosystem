// Preparación común de las pruebas del frontend.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);

// Los flujos del cliente final (HU-29, HU-38) guardan el pase en localStorage.
// Node expone un getter sin soporte y jsdom no siempre lo inyecta como global: se provee uno en memoria.
if (!globalThis.localStorage || !globalThis.localStorage.getItem) {
  const datos = new Map();
  const almacen = {
    clear: () => datos.clear(),
    getItem: (clave) => (datos.has(String(clave)) ? datos.get(String(clave)) : null),
    setItem: (clave, valor) => { datos.set(String(clave), String(valor)); },
    removeItem: (clave) => { datos.delete(String(clave)); },
    key: (indice) => [...datos.keys()][indice] ?? null,
    get length() { return datos.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: almacen, configurable: true, writable: true });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', { value: almacen, configurable: true, writable: true });
  }
}

// jsdom no implementa <dialog>: se simula lo mínimo que usa components/Modal.jsx.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  HTMLDialogElement.prototype.close = function close() { this.open = false; };
}
