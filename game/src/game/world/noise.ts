// Value noise + fbm used by terrain colour, height and scatter masks.
export function vnoise(x: number, z: number) {
  const h = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  return (h(ix, iz) * (1 - ux) + h(ix + 1, iz) * ux) * (1 - uz) + (h(ix, iz + 1) * (1 - ux) + h(ix + 1, iz + 1) * ux) * uz;
}
export const fbm = (x: number, z: number) => vnoise(x, z) * 0.5 + vnoise(x * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, z * 4.3) * 0.2;
