import { G } from "./state";
import { commitSave } from "./save";
import { checkpointRaid } from "./settlement";
import { instanceId } from "../loot/instances";
import { heldRounds } from "../combat/arsenal";

let signature = "";
/** extra item holders the world lists don't cover (the ?dev test containers in ui/devhooks.ts): their items count as present */
export const externalHolders: (() => string[])[] = [];
export function consumeInstance(inst: string) {
  const active = G.save.activeRaid;
  if (active && instanceId(inst) && !active.consumed.some(item => instanceId(item) === instanceId(inst))) active.consumed.push(inst);
}
export function checkpointInventory(force = false) {
  if (!G.save.activeRaid) return;
  const world = G.pickups.map(pickup => pickup.item);
  let satchel = G.save.satchel;
  for (const crate of G.crates) {
    const items = crate.session ? crate.session.slots.filter(slot => !slot.taken).map(slot => slot.item) : crate.items ?? [];
    if (crate.fixed === "satchel") satchel = items.length ? { items, x: crate.x, z: crate.z } : null;
    else world.push(...items);
  }
  for (const holder of externalHolders) world.push(...holder());
  for (const enemy of G.enemies) world.push(...enemy.stolen, ...enemy.carry, ...Object.values(enemy.gear ?? {}).filter((inst): inst is string => !!inst));
  const snapshot = { pack: G.pack, gear: G.gear, guns: G.save.guns, world, consumed: G.save.activeRaid.consumed, ammo: heldRounds(), x: G.pp.x, z: G.pp.z, elapsed: G.raidT };
  const nextSignature = JSON.stringify([snapshot.pack, snapshot.gear, snapshot.guns, world, snapshot.consumed, snapshot.ammo, satchel, G.save.locker, G.save.fixtures, Math.floor(G.raidT)]);
  if (!force && nextSignature === signature) return;
  const next = checkpointRaid({ ...G.save, satchel }, snapshot);
  G.save = commitSave(next); signature = nextSignature;
}
