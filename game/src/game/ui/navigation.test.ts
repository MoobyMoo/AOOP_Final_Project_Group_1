import { destinationBearing, setMapDestination, mapDestination, clearMapDestination } from "./navigation";
let checks = 0;
function assert(ok: unknown, message: string) { checks++; if (!ok) throw new Error(message); }
const origin = { x: 0, z: 0 };
for (const [x, z, label] of [[0, -10, "N"], [10, -10, "NE"], [10, 0, "E"], [10, 10, "SE"], [0, 10, "S"], [-10, 10, "SW"], [-10, 0, "W"], [-10, -10, "NW"]] as const) {
  assert(destinationBearing(origin, { x, z }, 0).compass === label, `compass ${label}`);
}
assert(destinationBearing(origin, { x: 3, z: 4 }, 0).distance === 5, "distance matches world units");
assert(destinationBearing(origin, { x: 0, z: -10 }, 0).angle === 0, "screen-up points north with zero yaw");
assert(Math.abs(destinationBearing(origin, { x: 0, z: -10 }, Math.PI / 2).angle - 90) < 1e-6, "camera rotation changes on-screen arrow");
setMapDestination({ x: 1, z: 2, label: "Goal", raid: "one" });
assert(mapDestination("one")?.label === "Goal", "target retained for this raid");
assert(mapDestination("two") === null, "new raid does not inherit old destination");
setMapDestination({ x: NaN, z: 2, label: "Invalid", raid: "one" });
assert(mapDestination("one")?.label === "Goal", "invalid coordinates cannot replace target");
clearMapDestination(); assert(mapDestination("one") === null, "clear destination");
console.log(`Navigation: ${checks} checks passed`);
