import type { MonkeyLook, SaveV1, Gear } from "../contracts";
import { DEFAULT_GEAR, WEARABLES } from "../actors/wearables";
import { DEFAULT_LOOK } from "../actors/look";
import { KINGPIN } from "../combat/weapons";
import { PRICES } from "../loot/tables";

const KEY = "bv_g1";
type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const integer = (value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : fallback;
const boolean = (value: unknown, fallback: boolean): boolean => typeof value === "boolean" ? value : fallback;
const strings = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0))] : [];
const scalar = (value: unknown, fallback: number, min: number, max: number): number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
const color = (value: unknown, fallback: string): string => typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
const choice = <Value extends string>(value: unknown, fallback: Value, choices: readonly Value[]): Value => typeof value === "string" && choices.includes(value as Value) ? value as Value : fallback;

function fresh(): SaveV1 {
  return {
    v: 1, createdAt: new Date().toISOString(), raids: 0, money: 0, ammo: KINGPIN.startAmmo,
    look: structuredClone(DEFAULT_LOOK), lookDone: false, gear: { ...DEFAULT_GEAR }, wardrobe: [DEFAULT_GEAR.head!, DEFAULT_GEAR.face!, DEFAULT_GEAR.back!], satchel: null,
    upgrades: { mag: 0, pack: 0, heart: 0 }, keys: [], trophies: [], reserved: [], order: null,
    fixtures: [], salMovedIn: false, stats: { bonkOuts: 0, extracts: 0, best: 0 },
  };
}

function look(value: unknown): MonkeyLook {
  const defaults = DEFAULT_LOOK;
  const raw = object(value);
  const ears = object(raw.ears), eyes = object(raw.eyes), brows = object(raw.brows);
  const tie = object(raw.tie), feet = object(raw.feet), tail = object(raw.tail);
  return {
    v: 2, fur: color(raw.fur, defaults.fur), face: color(raw.face, defaults.face),
    headSize: scalar(raw.headSize, defaults.headSize, -0.25, 0.25),
    ears: { style: choice(ears.style, defaults.ears.style, ["round", "pointy", "floppy"]), size: scalar(ears.size, defaults.ears.size, 0.75, 1.35) },
    eyes: { style: choice(eyes.style, defaults.eyes.style, ["round", "sleepy", "sparkle", "beady"]), spacing: scalar(eyes.spacing, defaults.eyes.spacing, 0.85, 1.15) },
    brows: { style: choice(brows.style, defaults.brows.style, ["bold", "thin", "bushy", "none"]), tilt: scalar(brows.tilt, defaults.brows.tilt, -1, 1) },
    mouth: choice(raw.mouth, defaults.mouth, ["smile", "grin", "smirk", "toothy", "whistle"]),
    suit: color(raw.suit, defaults.suit), pants: color(raw.pants, defaults.pants),
    tie: { style: choice(tie.style, defaults.tie.style, ["tie", "bowtie", "none"]), color: color(tie.color, defaults.tie.color) },
    tail: { curl: scalar(tail.curl, defaults.tail.curl, 0, 1) },
    feet: { style: choice(feet.style, defaults.feet.style, ["round", "shoes"]), color: color(feet.color, defaults.feet.color) },
  };
}

/** gear slots hold a known wearable id for that slot, or null; anything else falls back to the default */
function gear(value: unknown, wardrobe: string[]): Gear {
  const raw = object(value), out: Gear = { ...DEFAULT_GEAR };
  for (const slot of ["head", "face", "back"] as const) {
    const id = raw[slot];
    if (id === null && slot !== "back") out[slot] = null;
    else if (typeof id === "string" && WEARABLES.some((w) => w.id === id && w.slot === slot) && wardrobe.includes(id)) out[slot] = id;
  }
  return out;
}
function satchel(value: unknown): SaveV1["satchel"] {
  const raw = object(value), items = strings(raw.items);
  return items.length && typeof raw.x === "number" && Number.isFinite(raw.x) && typeof raw.z === "number" && Number.isFinite(raw.z) ? { items: Array.isArray(raw.items) ? (raw.items as unknown[]).filter((i): i is string => typeof i === "string") : items, x: raw.x, z: raw.z } : null;
}
export function migrate(value: unknown): SaveV1 {
  const defaults = fresh();
  try {
    const raw = object(value);
    if (raw.v !== undefined && raw.v !== 0 && raw.v !== 1) return defaults;
    const upgrades = object(raw.upgrades), stats = object(raw.stats), order = object(raw.order);
    const wardrobe = [...new Set([...defaults.wardrobe, ...strings(raw.wardrobe).filter((id) => WEARABLES.some((w) => w.id === id))])];
    return {
      v: 1,
      createdAt: typeof raw.createdAt === "string" && Number.isFinite(Date.parse(raw.createdAt)) ? raw.createdAt : defaults.createdAt,
      raids: integer(raw.raids, defaults.raids), money: integer(raw.money, defaults.money), ammo: integer(raw.ammo, defaults.ammo),
      look: look(raw.look), lookDone: boolean(raw.lookDone, defaults.lookDone), gear: gear(raw.gear, wardrobe), wardrobe, satchel: satchel(raw.satchel),
      upgrades: {
        mag: integer(upgrades.mag, 0, PRICES.upgrades.mag.length),
        pack: integer(upgrades.pack, 0, PRICES.upgrades.pack.length),
        heart: integer(upgrades.heart, 0, PRICES.upgrades.heart.length),
      },
      keys: strings(raw.keys), trophies: strings(raw.trophies), reserved: strings(raw.reserved),
      order: typeof order.id === "string" && order.id.length > 0 ? {
        id: order.id,
        progress: Object.fromEntries(Object.entries(object(order.progress)).filter((entry): entry is [string, number] => integer(entry[1], -1) >= 0)),
        done: boolean(order.done, false),
      } : null,
      fixtures: strings(raw.fixtures), salMovedIn: boolean(raw.salMovedIn, defaults.salMovedIn),
      stats: { bonkOuts: integer(stats.bonkOuts, 0), extracts: integer(stats.extracts, 0), best: integer(stats.best, 0) },
    };
  } catch {
    return defaults;
  }
}

export function load(): SaveV1 {
  try {
    const raw = globalThis.localStorage.getItem(KEY);
    return migrate(raw === null ? null : JSON.parse(raw));
  } catch {
    return fresh();
  }
}

export function save(value: SaveV1): void {
  try {
    globalThis.localStorage.setItem(KEY, JSON.stringify(migrate(value)));
  } catch {}
}

export function reset(): SaveV1 {
  const value = fresh();
  try {
    globalThis.localStorage.removeItem(KEY);
  } catch {}
  save(value);
  return value;
}
