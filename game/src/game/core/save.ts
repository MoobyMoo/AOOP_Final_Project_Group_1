import type { MonkeyLook, SaveV1, Gear } from "../contracts";
import { BOUND_KIT, SLOTS, equipDef, fmtInst, parseInst } from "../loot/equipment";
import { DEFAULT_LOOK, sanitizeLook, type MonkeyLookX } from "../actors/look";
import { KINGPIN } from "../combat/weapons";
import { ITEMS, PRICES, itemDef } from "../loot/tables";
import { EMPTY_GUN, isAttachment, sanitizeGun } from "../loot/attachments";
import { emptyBase, legacyBase, sanitizeBase } from "../home/facilities";
import { itemType } from "../loot/instances";
import { claimDelivery, identifySave, settleRaid, validateOwnership } from "./settlement";

export function retainKeys(save: SaveV1, kept: readonly string[]) {
  for (const id of kept) if (itemDef(id).kind === "key" && !save.keys.includes(itemType(id))) save.keys.push(itemType(id));
}

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
    look: structuredClone(DEFAULT_LOOK), lookDone: false, gear: { ...BOUND_KIT }, locker: [], satchel: null,
    upgrades: { mag: 0, pack: 0, heart: 0 }, keys: [], trophies: [], reserved: [], order: null,
    fixtures: [], salMovedIn: false, gun: { ...EMPTY_GUN }, stats: { bonkOuts: 0, extracts: 0, best: 0 },
    base: emptyBase(), // a new vault starts empty (G1.5 row 17)
  };
}

function look(value: unknown): MonkeyLook {
  const defaults = DEFAULT_LOOK;
  const raw = object(value);
  const ears = object(raw.ears), eyes = object(raw.eyes), brows = object(raw.brows);
  const tie = object(raw.tie), feet = object(raw.feet), tail = object(raw.tail);
  const ext = (sanitizeLook({ ...raw, v: 2 }) as MonkeyLookX | null)?.x;
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
    ...(ext ? { x: ext } : {}), // creator extras (build, jacket, pocket square, extra colour zones, gear tints): look.ts sanitizes them
  } as MonkeyLook;
}

function gear(value: unknown, legacy: boolean): Gear {
  const raw = object(value), out: Gear = { ...BOUND_KIT };
  for (const slot of SLOTS) {
    const inst = raw[slot], parsed = typeof inst === "string" ? parseInst(inst) : null;
    if (inst === null) out[slot] = slot === "body" && legacy ? "suit" : null;
    else if (parsed && equipDef(inst as string)?.slot === slot) out[slot] = fmtInst(inst as string, parsed.dur);
  }
  return out;
}
/** G1.5 row 36: the old one-off "extended_mag" item is the magazine attachment now */
const renamed = (inst: string) => (inst === "extended_mag" ? "att_mag_ext" : inst);
/** the locker: equipment instances and gun attachment ids */
const instances = (value: unknown): string[] => Array.isArray(value) ? value.flatMap(raw => {
  const inst = typeof raw === "string" ? renamed(raw) : null, parsed = inst ? parseInst(inst) : null;
  return parsed ? [fmtInst(inst!, parsed.dur)] : inst && isAttachment(inst) ? [inst] : [];
}) : [];
const loot = (value: unknown): string[] => Array.isArray(value) ? value.flatMap(raw => {
  if (typeof raw !== "string" || !raw) return [];
  const inst = renamed(raw), parsed = parseInst(inst);
  return parsed ? [fmtInst(inst, parsed.dur)] : Object.hasOwn(ITEMS, itemType(inst)) && ITEMS[itemType(inst)].kind !== "wear" ? [inst] : [];
}) : [];
function satchel(value: unknown): SaveV1["satchel"] {
  const raw = object(value), items = loot(raw.items).filter(inst => !equipDef(inst)?.bound);
  return items.length && typeof raw.x === "number" && Number.isFinite(raw.x) && typeof raw.z === "number" && Number.isFinite(raw.z) ? { items, x: raw.x, z: raw.z } : null;
}
export function migrate(value: unknown): SaveV1 {
  const defaults = fresh();
  try {
    const raw = object(value);
    if (raw.v !== undefined && raw.v !== 0 && raw.v !== 1) return defaults;
    const upgrades = object(raw.upgrades), stats = object(raw.stats), order = object(raw.order);
    const rawGear = object(raw.gear);
    const legacy = Array.isArray(raw.wardrobe) || (!Object.hasOwn(rawGear, "body") && !Object.hasOwn(rawGear, "ears")) || (rawGear.body === null && strings(raw.locker).some(inst => equipDef(inst)?.bound && Object.values(rawGear).includes(inst)));
    const worn = gear(raw.gear, legacy);
    const locker = instances(raw.locker ?? raw.wardrobe);
    if (legacy) for (const inst of Object.values(worn)) { const index = inst ? locker.indexOf(inst) : -1; if (index >= 0) locker.splice(index, 1); }
    locker.push(...instances(raw.reserved));
    // the Kingpin's attachments. A save from before attachments has no "gun": its extended mag (found in the vault =
    // the "extended_mag" fixture, or bought at the workbench = upgrades.mag) becomes the fitted magazine attachment.
    const gun = sanitizeGun(raw.gun), fixtures = strings(raw.fixtures);
    if (!Object.hasOwn(raw, "gun") && (fixtures.includes("extended_mag") || integer(upgrades.mag, 0) > 0) && !locker.includes("att_mag_ext")) gun.mag ??= "att_mag_ext";
    const fixturesOut = fixtures.filter(f => f !== "extended_mag");
    for (const slot of SLOTS) {
      const starter = BOUND_KIT[slot];
      if (starter && equipDef(worn[slot])?.id !== starter && !locker.some(inst => equipDef(inst)?.id === starter)) locker.push(starter);
    }
    return {
      ...(raw.activeRaid && typeof raw.activeRaid === "object" ? { activeRaid: structuredClone(raw.activeRaid) as SaveV1["activeRaid"] } : {}),
      ...(Array.isArray(raw.settlements) ? { settlements: structuredClone(raw.settlements) as SaveV1["settlements"] } : {}),
      ...(Array.isArray(raw.delivery) ? { delivery: loot(raw.delivery) } : {}),
      ...(typeof object(raw.deployReceipt).id === "string" && integer(object(raw.deployReceipt).paid, -1) >= 0 ? { deployReceipt: { id: object(raw.deployReceipt).id as string, paid: object(raw.deployReceipt).paid as number } } : {}),
      v: 1,
      createdAt: typeof raw.createdAt === "string" && Number.isFinite(Date.parse(raw.createdAt)) ? raw.createdAt : defaults.createdAt,
      raids: integer(raw.raids, defaults.raids), money: integer(raw.money, defaults.money), ammo: integer(raw.ammo, defaults.ammo),
      look: look(raw.look), lookDone: boolean(raw.lookDone, defaults.lookDone), gear: worn, locker, satchel: satchel(raw.satchel),
      upgrades: {
        mag: integer(upgrades.mag, 0, PRICES.upgrades.mag.length),
        pack: integer(upgrades.pack, 0, PRICES.upgrades.pack.length),
        heart: integer(upgrades.heart, 0, PRICES.upgrades.heart.length),
      },
      keys: strings(raw.keys), trophies: strings(raw.trophies), reserved: loot(raw.reserved).filter(inst => !equipDef(inst) && !isAttachment(inst)),
      order: typeof order.id === "string" && order.id.length > 0 ? {
        id: order.id,
        progress: Object.fromEntries(Object.entries(object(order.progress)).filter((entry): entry is [string, number] => integer(entry[1], -1) >= 0)),
        done: boolean(order.done, false),
      } : null,
      fixtures: fixturesOut, salMovedIn: boolean(raw.salMovedIn, defaults.salMovedIn), gun,
      stats: { bonkOuts: integer(stats.bonkOuts, 0), extracts: integer(stats.extracts, 0), best: integer(stats.best, 0) },
      // a save from before the buildable vault had the fixed room's stations: they come along, already placed
      base: Object.hasOwn(raw, "base") ? sanitizeBase(raw.base) : Object.keys(raw).length ? legacyBase() : emptyBase(),
      ...(typeof object(raw.boundWeapons).kingpin === "string" && typeof object(raw.boundWeapons).briefcase === "string" ? { boundWeapons: { kingpin: object(raw.boundWeapons).kingpin as string, briefcase: object(raw.boundWeapons).briefcase as string } } : {}),
    };
  } catch {
    return defaults;
  }
}

export function load(): SaveV1 {
  let next: SaveV1, raw: string | null;
  try {
    raw = globalThis.localStorage.getItem(KEY);
    next = identifySave(migrate(raw === null ? null : JSON.parse(raw)));
    validateOwnership(next);
  } catch {
    return identifySave(fresh());
  }
  try {
    if (next.activeRaid) return commitSave(settleRaid(next, "reload", 2));
    if (next.deployReceipt) {
      const refunded = structuredClone(next);
      refunded.money += refunded.deployReceipt!.paid; delete refunded.deployReceipt;
      return commitSave(refunded);
    }
    if (JSON.stringify(next) !== raw) return commitSave(next);
  } catch {}
  return next;
}

export function commitSave(value: SaveV1): SaveV1 {
  const next = identifySave(value);
  claimDelivery(next);
  validateOwnership(next);
  globalThis.localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function save(value: SaveV1): boolean {
  try { Object.assign(value, commitSave(value)); return true; } catch { return false; }
}

export function reset(): SaveV1 {
  const value = identifySave(fresh());
  try {
    globalThis.localStorage.removeItem(KEY);
  } catch {}
  save(value);
  return value;
}
