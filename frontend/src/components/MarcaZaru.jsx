// Marca de Zaru: una gota con un destello (lavado + brillo). Es decorativa; el texto "Zaru" da el nombre.
export function GotaZaru({ tamano = 32 }) {
  return (
    <svg className="gota-zaru" viewBox="0 0 32 32" width={tamano} height={tamano} aria-hidden="true">
      <defs>
        <linearGradient id="gota-zaru-relleno" x1="6" y1="4" x2="26" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3dd6ec" />
          <stop offset="1" stopColor="#0b7285" />
        </linearGradient>
      </defs>
      <path d="M16 2.5S6 13.2 6 19.6a10 10 0 0 0 20 0C26 13.2 16 2.5 16 2.5Z" fill="url(#gota-zaru-relleno)" />
      <path d="M19.6 14.2l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" fill="#ffd400" />
      <path d="M11.2 18.5a5.2 5.2 0 0 0 3 5" fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Gota + nombre. `claro` para fondos oscuros. */
export default function MarcaZaru({ claro = false, tamano = 32 }) {
  return (
    <span className={`marca-zaru${claro ? ' marca-zaru-clara' : ''}`}>
      <GotaZaru tamano={tamano} />
      <span className="marca-zaru-nombre">Zaru</span>
    </span>
  );
}
