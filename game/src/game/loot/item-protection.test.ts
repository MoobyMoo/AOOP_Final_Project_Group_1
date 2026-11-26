import { migrate } from "../core/save";
import { qs } from "../core/quests";
import { importantItemReasons } from "./item-protection";
let checks = 0;
function assert(ok: unknown, message: string) { checks++; if (!ok) throw new Error(message); }
const save = migrate(null);
assert(importantItemReasons(save, ["banana"]).length === 0, "ordinary items need no confirmation");
assert(importantItemReasons(save, ["golden_banana"]).length > 0, "rare items protected");
assert(importantItemReasons(save, ["road_map"]).length > 0, "key items protected");
qs(save).active.push("keeper_lanterns");
assert(importantItemReasons(save, ["honey_pot"]).some(s => s.includes("Seed Lanterns")), "active task materials protected");
save.reserved = ["honey_pot@a", "honey_pot@b"];
assert(importantItemReasons(save, save.reserved).some(s => s.includes("Seed Lanterns")), "ready task materials remain protected");
assert(importantItemReasons(save, save.reserved).length === 1, "duplicate reasons grouped");
console.log(`Item protection: ${checks} checks passed`);
