import { DEFAULT_LOOK } from "../actors/look";
import { load, migrate, reset, save } from "./save";

let checks = 0;
function assert(ok: boolean, message: string): asserts ok {
  checks++;
  if (!ok) throw new Error(message);
}
function equal(actual: unknown, expected: unknown, message: string) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

const data = new Map<string, string>();
const storage = {
  getItem: (key: string) => data.get(key) ?? null,
  setItem: (key: string, value: string) => { data.set(key, value); },
  removeItem: (key: string) => { data.delete(key); },
};
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });

const fresh = load();
assert(fresh.v === 1 && fresh.money === 0 && fresh.raids === 0, "missing storage returns defaults");
assert(Number.isFinite(Date.parse(fresh.createdAt)), "creation date is valid");
equal(fresh.look, DEFAULT_LOOK, "brand default look");
fresh.look.tie.color = "#000000";
assert(load().look.tie.color === DEFAULT_LOOK.tie.color, "fresh nested defaults are not shared");
assert(fresh.gear.head === "bowler" && fresh.gear.face === "shades" && fresh.satchel === null, "default gear and no satchel");
data.set("bv_g1", "{bad json");
assert(load().money === 0, "corrupt JSON recovers");
for (const raw of [null, undefined, 2, false, "bad", [], { v: 999, money: 100 }]) {
  assert(migrate(raw).money === 0, "invalid root/future version recovers");
}
const partial = migrate({ v: 0, money: 42, raids: 2, look: { eyes: { style: "monocle" }, fur: "#aabbcc" } });
assert(partial.money === 42 && partial.raids === 2 && partial.look.eyes.style === "round", "older partial save migrates (monocle is gear now, eyes fall back to round)");
assert(partial.look.eyes.spacing === 1 && partial.look.fur === "#aabbcc", "nested partials merge independently");
const bad = migrate({
  money: "30", raids: -1, ammo: NaN, lookDone: "true", createdAt: "nonsense",
  upgrades: { mag: 1, pack: 900, heart: 0.5 }, keys: ["vine_key", null, 3, "vine_key"], trophies: false,
  reserved: ["vine_rope"], salMovedIn: true, fixtures: ["lamp"],
  look: { headSize: Infinity, ears: { style: "triangle", size: 8 }, brows: { style: "thin", tilt: -0.5 }, tie: { style: "bowtie", color: "red" }, tail: { curl: 2 } },
  gear: { head: "crown", face: "nope", back: "satchel" }, wardrobe: ["crown", 5], satchel: { items: ["golden", 3], x: 4, z: "x" },
  stats: { bonkOuts: -5, extracts: 3, best: "9" },
  order: { id: "sal", progress: { vine_rope: 2, old_gear: "3", bad: -2 }, done: "yes" },
});
equal([bad.money, bad.raids, bad.ammo, bad.lookDone], [0, 0, 16, false], "reject wrong scalar types/ranges");
equal(bad.upgrades, { mag: 1, pack: 0, heart: 0 }, "upgrade levels validated");
equal(bad.keys, ["vine_key"], "mixed arrays sanitized and deduplicated");
equal(bad.trophies, [], "wrong list type defaults");
equal(bad.reserved, ["vine_rope"], "valid sibling list retained");
assert(bad.look.headSize === DEFAULT_LOOK.headSize && bad.look.ears.size === DEFAULT_LOOK.ears.size, "invalid look numbers default");
assert(bad.look.ears.style === DEFAULT_LOOK.ears.style && bad.look.tie.color === DEFAULT_LOOK.tie.color, "invalid enum/color defaults");
assert(bad.look.tie.style === "bowtie" && bad.look.brows.tilt === -0.5 && bad.look.brows.style === "thin", "valid look siblings survive");
assert(bad.gear.head === "crown" && bad.gear.face === "shades" && bad.wardrobe.includes("crown") && bad.satchel === null, "gear, wardrobe and satchel validated");
equal(bad.stats, { bonkOuts: 0, extracts: 3, best: 0 }, "stats validated field by field");
equal(bad.order, { id: "sal", progress: { vine_rope: 2 }, done: false }, "order progress sanitized");
assert(migrate({ order: { id: false } }).order === null, "invalid order id rejected");
assert(migrate({ money: Infinity }).money === 0, "infinite money rejected");
assert(migrate({ raids: Number.MAX_SAFE_INTEGER + 1 }).raids === 0, "unsafe counters rejected");
equal(migrate({ keys: { 0: "vine_key" } }).keys, [], "array-like objects rejected");
save(partial);
equal(load(), partial, "save round-trip");
assert(data.has("bv_g1"), "correct versioned key");
const clean = reset();
assert(clean.money === 0 && clean.raids === 0 && load().createdAt === clean.createdAt, "reset persists a fresh save");
const protectedProgress = migrate(JSON.parse('{"order":{"id":"safe","progress":{"__proto__":2,"constructor":3},"done":true}}'));
assert(protectedProgress.order?.progress["__proto__"] === 2, "progress keys do not mutate prototypes");
const hostile = new Proxy({}, { get() { throw new Error("hostile getter"); } });
assert(migrate(hostile).v === 1, "hostile raw input cannot throw");
Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
assert(load().money === 0, "blocked storage read cannot throw");
save(partial);
assert(reset().money === 0, "blocked storage reset cannot throw");
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { ...storage, setItem() { throw new Error("QuotaExceededError"); } } });
save(partial);
assert(load().v === 1, "quota errors cannot throw");
Reflect.deleteProperty(globalThis, "localStorage");
assert(load().v === 1, "Node without storage recovers");
save(partial);
assert(reset().v === 1, "Node without storage resets");
{ // creator extras (look.x) survive migration and are sanitized
  const withX = migrate({ v: 1, look: { ...DEFAULT_LOOK, x: { build: 0.5, jacket: "vest", pocketSquare: true, colors: { shirt: "#AABBCC", eyes: "nope" } } } });
  const x = (withX.look as unknown as { x?: { build?: number; jacket?: string; pocketSquare?: boolean; colors?: Record<string, string> } }).x;
  assert(x?.build === 0.5 && x.jacket === "vest" && x.pocketSquare === true, "look.x survives migration");
  assert(x?.colors?.shirt === "#aabbcc" && x.colors.eyes === undefined, "look.x colours are sanitized");
  const bad = migrate({ v: 1, look: { ...DEFAULT_LOOK, x: { build: 9, jacket: "cape" } } });
  const bx = (bad.look as unknown as { x?: { build?: number; jacket?: string } }).x;
  assert(bx?.build === 1 && bx.jacket === "two", "look.x out-of-range values clamp to safe defaults");
}
console.log(`Save self-test: PASS (${checks} checks; migration, corrupt data, nested types, storage failures, reset)`);
