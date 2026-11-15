import { CRATES, type CrateSocket } from "../world/layout";
import { CONTAINER_SOCKETS, DEMO, inDemo, type ContainerSocket } from "../world/map/grove";
import type { ContainerType } from "./containers";

export const RAID_CRATES = 15;
/** typed containers spawned per raid, out of the 28 authored (8 food, 6 ammo, 8 parts, 4 medical, 2 weapon): about two
 *  thirds, so a raid's route still has to choose (Sol's demo routes open 6 to 9; a thorough human 3-6 min raid 10 to 14) */
export const RAID_CONTAINERS: Record<ContainerType, number> = { food: 5, ammo: 5, parts: 6, medical: 3, weapon: 2 }; // the grotto's three always-on sockets count in these

function shuffle<T>(list: T[], rng: () => number) {
  for (let index = list.length - 1; index > 0; index--) {
    const other = Math.floor(rng() * (index + 1));
    [list[index], list[other]] = [list[other], list[index]];
  }
  return list;
}
/** generic crates: every fixed one (in the demo: the ones on this side of the route locks) plus, outside the demo, the
 *  north's tiered sockets up to RAID_CRATES */
export function selectSockets(rng: () => number): CrateSocket[] {
  const fixed = CRATES.filter(socket => socket.fixed && inDemo(socket.x, socket.z));
  const optional = shuffle(CRATES.filter(socket => !socket.fixed && inDemo(socket.x, socket.z)), rng);
  return DEMO ? fixed : [...fixed, ...optional.slice(0, Math.max(0, RAID_CRATES - fixed.length))];
}
/** typed containers for this raid: a seeded, type-balanced share of the authored sockets */
export function selectContainers(rng: () => number): ContainerSocket[] {
  const out: ContainerSocket[] = [];
  for (const type of Object.keys(RAID_CONTAINERS) as ContainerType[]) {
    const all = CONTAINER_SOCKETS.filter(socket => socket.type === type && inDemo(socket.x, socket.z)), always = all.filter(socket => socket.always);
    out.push(...always, ...shuffle(all.filter(socket => !socket.always), rng).slice(0, Math.max(0, RAID_CONTAINERS[type] - always.length)));
  }
  return out;
}
