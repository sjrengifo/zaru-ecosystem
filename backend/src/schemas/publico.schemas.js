// HU-17 — Validación de la búsqueda del cliente final (HU-43 CA2).
// El cliente escribe su placa O su celular; se normalizan igual que se guardan en la base.
import { z } from 'zod';
import { normalizarCelular, normalizarPlaca } from '../shared/accesoCliente.js';

const opcionalTexto = z
  .string({ invalid_type_error: 'Debe ser texto' })
  .max(30, 'Es demasiado largo')
  .optional();

export const busquedaPublica = z
  .object({ placa: opcionalTexto, celular: opcionalTexto })
  .superRefine((datos, ctx) => {
    const conPlaca = Boolean(datos.placa?.trim());
    const conCelular = Boolean(datos.celular?.trim());
    if (conPlaca === conCelular) {
      ctx.addIssue({ code: 'custom', path: [], message: 'Escribe tu placa o tu número de celular' });
      return;
    }
    if (conPlaca && !normalizarPlaca(datos.placa)) {
      ctx.addIssue({ code: 'custom', path: ['placa'], message: 'Escribe la placa sin espacios, por ejemplo ABC123' });
    }
    if (conCelular && !normalizarCelular(datos.celular)) {
      ctx.addIssue({ code: 'custom', path: ['celular'], message: 'Escribe tu celular de 10 dígitos, por ejemplo 3001234567' });
    }
  })
  .transform((datos) =>
    datos.placa?.trim() ? { placa: normalizarPlaca(datos.placa) } : { celular: normalizarCelular(datos.celular) },
  );
