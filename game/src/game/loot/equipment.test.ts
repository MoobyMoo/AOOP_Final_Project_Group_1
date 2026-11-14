import { BOUND_KIT, EQUIP, enemyGear, fmtInst, gearStats, isEquip, parseInst, repairCost, saleValue, wear } from "./equipment";

let checks = 0;
function assert(ok: boolean, message: string): asserts ok {
  checks++;
  if (!ok) throw new Error(message);
}
assert(parseInst("hardhat#73")?.dur === 73, "instance condition parsed");
assert(parseInst("hardhat")?.dur === 100, "legacy ids mean full condition");
for (const invalid of ["__proto__", "constructor", "hardhat#x", "hardhat#73#2", "hardhat#Infinity", "hardhat#", "nope#50"]) assert(parseInst(invalid) === null, `reject ${invalid}`);
assert(parseInst("hardhat#999")?.dur === 100 && parseInst("hardhat#-9")?.dur === 0, "condition clamps");
assert(fmtInst("hardhat", 100) === "hardhat" && fmtInst("hardhat", 72.7) === "hardhat#73", "canonical formatting");
assert(isEquip("hardhat#50") && !isEquip("banana"), "equipment classification");
assert(gearStats(BOUND_KIT).headArmor === 0.2 && gearStats(BOUND_KIT).crit === 0.03, "starter stats");
assert(gearStats({ ...BOUND_KIT, head: "hardhat#1", body: "warden_vest#1" }).bodyArmor === 4, "partial armor retains full protection");
assert(gearStats({ ...BOUND_KIT, head: "hardhat#0", body: "warden_vest#0" }).headArmor === 0.2, "broken armor contributes nothing");
assert(gearStats({ ...BOUND_KIT, body: "leaf_vest", back: "cratepack" }).packSlots === 5, "pockets add to pack capacity");
assert(gearStats({ ...BOUND_KIT, body: "coconut_cuirass", back: "cratepack" }).speed === 0.95 * 0.97, "speed modifiers multiply");
assert(wear("hardhat#2", 10) === "hardhat#0" && wear("hardhat", 0) === "hardhat", "wear clamps and ignores zero hits");
assert(saleValue("hardhat#50") === 30 && saleValue("hardhat#0") === 0 && saleValue("shades") === 0, "condition and bound sale values");
assert(repairCost("hardhat") === 0 && repairCost("hardhat#0") > repairCost("hardhat#50"), "repair scales with missing condition");
for (const [id, def] of Object.entries(EQUIP)) if ((def.headArmor ?? 0) + (def.bodyArmor ?? 0) > 0) assert(def.dur === 100, `${id} armor durability`);
for (const kind of ["wild", "bandit", "brute", "sleeper"] as const) {
  assert(JSON.stringify(enemyGear(42, kind)) === JSON.stringify(enemyGear(42, kind)), `${kind} deterministic loadout`);
  assert(Object.values(enemyGear(42, kind)).every(inst => inst === null || isEquip(inst)), `${kind} valid pieces`);
}
assert(enemyGear(42, "brute").head === "coconut_helmet", "brute helmet");
console.log(`Equipment self-test: PASS (${checks} checks)`);
