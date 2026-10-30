// Error de un campo. El ícono acompaña al color para que no sea la única señal (WCAG 1.4.1).
export default function MensajeError({ id, children }) {
  return (
    <p id={id} className="mensaje-error">
      <span aria-hidden="true">⚠</span>
      <span>{children}</span>
    </p>
  );
}
