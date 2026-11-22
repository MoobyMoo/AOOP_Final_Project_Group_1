export type MapDestination = { x: number; z: number; label: string; raid: string };
let destination: MapDestination | null = null;
export function setMapDestination(target: MapDestination) {
  if (Number.isFinite(target.x) && Number.isFinite(target.z)) destination = { ...target };
}
export const mapDestination = (raid: string) => destination?.raid === raid ? destination : null;
export const clearMapDestination = () => { destination = null; };
/** Same plane rotation as the map, measured clockwise from screen-up. */
export function destinationBearing(from: { x: number; z: number }, to: { x: number; z: number }, cameraYaw: number) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const screenX = dx * Math.cos(cameraYaw) - dz * Math.sin(cameraYaw);
  const screenY = dx * Math.sin(cameraYaw) + dz * Math.cos(cameraYaw);
  const compass = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = (Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) + 8) % 8;
  return { distance: Math.hypot(dx, dz), angle: Math.atan2(screenX, -screenY) * 180 / Math.PI, compass: compass[index] };
}
