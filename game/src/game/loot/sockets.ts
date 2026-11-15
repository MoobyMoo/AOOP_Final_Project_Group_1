import { CRATES, type CrateSocket } from "../world/layout";

export const RAID_CRATES = 15;

export function selectSockets(rng: () => number): CrateSocket[] {
  const fixed = CRATES.filter(socket => socket.fixed);
  const optional = CRATES.filter(socket => !socket.fixed);
  for (let index = optional.length - 1; index > 0; index--) {
    const other = Math.floor(rng() * (index + 1));
    [optional[index], optional[other]] = [optional[other], optional[index]];
  }
  return [...fixed, ...optional.slice(0, RAID_CRATES - fixed.length)];
}
