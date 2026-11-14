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
fresh.look.hat.color = "#000000";
assert(load().look.hat.color === DEFAULT_LOOK.hat.color, "fresh nested defaults are not shared");
data.set("bv_g1", "{bad json");
assert(load().money === 0, "corrupt JSON recovers");
for (const raw of [null, undefined, 2, false, "bad", [], { v: 999, money: 100 }]) {
  assert(migrate(raw).money === 0, "invalid root/future version recovers");
}
const partial = migrate({ v: 0, money: 42, raids: 2, look: { eyes: { style: "monocle" }, fur: "#aabbcc" } });
assert(partial.money === 42 && partial.raids === 2 && partial.look.eyes.style === "monocle", "older partial save migrates");
assert(partial.look.eyes.spacing === 1 && partial.look.fur === "#aabbcc", "nested partials merge independently");
const bad = migrate({
  money: "30", raids: -1, ammo: NaN, lookDone: "true", createdAt: "nonsense",
  upgrades: { mag: 1, pack: 900, heart: 0.5 }, keys: ["vine_key", null, 3, "vine_key"], trophies: false,
  reserved: ["vine_rope"], salMovedIn: true, fixtures: ["lamp"],
  look: { headSize: Infinity, ears: { style: "triangle", size: 8 }, brows: { style: "thin", tilt: -0.5 }, hat: { style: "cap", color: "red" }, tail: { curl: 2 } },
  stats: { bonkOuts: -5, extracts: 3, best: "9" },
  order: { id: "sal", progress: { vine_rope: 2, old_gear: "3", bad: -2 }, done: "yes" },
});
equal([bad.money, bad.raids, bad.ammo, bad.lookDone], [0, 0, 16, false], "reject wrong scalar types/ranges");
equal(bad.upgrades, { mag: 1, pack: 0, heart: 0 }, "upgrade levels validated");
equal(bad.keys, ["vine_key"], "mixed arrays sanitized and deduplicated");
equal(bad.trophies, [], "wrong list type defaults");
equal(bad.reserved, ["vine_rope"], "valid sibling list retained");
assert(bad.look.headSize === DEFAULT_LOOK.headSize && bad.look.ears.size === DEFAULT_LOOK.ears.size, "invalid look numbers default");
assert(bad.look.ears.style === DEFAULT_LOOK.ears.style && bad.look.hat.color === DEFAULT_LOOK.hat.color, "invalid enum/color defaults");
assert(bad.look.hat.style === "cap" && bad.look.brows.tilt === -0.5 && bad.look.brows.style === "thin", "valid look siblings survive");
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
console.log(`Save self-test: PASS (${checks} checks; migration, corrupt data, nested types, storage failures, reset)`);
