import { CRATES, type CrateSocket } from "../world/layout";
import { CONTAINER_SOCKETS, DEMO, inDemo, type ContainerSocket } from "../world/map/grove";
import { CONTAINERS, type ContainerType } from "./containers";

export const RAID_CRATES = 15;
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
/** typed containers for this raid (L01): every socket rolls its type's presence chance once per raid (always-on ones,
 *  the grotto's den, are always there). 61 sockets at 0.5-0.85 put about 43 in a raid */
export function selectContainers(rng: () => number, forced?: ReadonlySet<string>): ContainerSocket[] {
  // forced = sockets a job needs this raid (story/raid.ts: the guard's coat while Sal wants the road map). The presence
  // roll is still drawn for them, so every other container rolls exactly as it would have
  return CONTAINER_SOCKETS.filter(socket => inDemo(socket.x, socket.z) && (socket.always || rng() < CONTAINERS[socket.type as ContainerType].presenceChance || !!forced?.has(socket.id)));
}
