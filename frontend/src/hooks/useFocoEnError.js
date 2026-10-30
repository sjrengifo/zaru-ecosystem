// Tras cada intento de guardar, el foco va a lo primero que hay que resolver (WCAG 3.3.1).
import { useEffect } from 'react';

export function useFocoEnError(formulario, intentos) {
  useEffect(() => {
    if (!intentos) return;
    const control = formulario.current.querySelector('[aria-invalid="true"], [data-foco-error]');
    control?.focus();
    // El mensaje queda debajo del control y puede no verse aunque el control sí.
    const idMensaje = control?.getAttribute('aria-describedby')?.split(' ').pop();
    if (idMensaje) document.getElementById(idMensaje)?.scrollIntoView({ block: 'nearest' });
  }, [intentos, formulario]);
}
