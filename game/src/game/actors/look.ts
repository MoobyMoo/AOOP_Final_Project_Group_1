// Looks: the creator record (MonkeyLook), presets, random looks, the share code, and the seeded looks of the
// monkey enemies. DEFAULT_LOOK + DEFAULT_GEAR = the brand Businessman (BRAND.md).
import type { MonkeyLook, EnemyStyle, EarStyle, EyeStyle, BrowStyle, MouthStyle, TieStyle, FeetStyle } from "../contracts";
import { shade } from "./charmat";

/** DEFAULT_LOOK = the current brand Businessman (longform/cast/businessman_profile_v17_current.png): orange-brown fur, peach
 *  face, charcoal suit, white shirt, wide orange tie; with DEFAULT_GEAR: black bowler with a wide orange band, wayfarers. */
export const DEFAULT_LOOK: MonkeyLook = {
  v: 2, fur: "#e07a32", face: "#f6c896", headSize: 0,
  ears: { style: "round", size: 1 }, eyes: { style: "round", spacing: 1 }, brows: { style: "bold", tilt: 0 }, mouth: "smile",
  suit: "#4d4848", pants: "#3a3838", tie: { style: "tie", color: "#f46a10" },
  tail: { curl: 0.7 }, feet: { style: "round", color: "#c4612a" },
};
export const EARS: EarStyle[] = ["round", "pointy", "floppy"], EYES: EyeStyle[] = ["round", "sleepy", "sparkle", "beady"];
export const BROWS: BrowStyle[] = ["bold", "thin", "bushy", "none"], MOUTHS: MouthStyle[] = ["smile", "grin", "smirk", "toothy", "whistle"];
export const TIES: TieStyle[] = ["tie", "bowtie", "none"], FEET: FeetStyle[] = ["round", "shoes"];

// ---------------------------------------------------------------- creator options beyond contracts.ts (for the lead to fold into MonkeyLook)
/** suit front, a swappable mesh: two-button jacket, double-breasted jacket, vest over shirt sleeves, open jacket */
export type JacketStyle = "two" | "double" | "vest" | "open";
export const JACKETS: JacketStyle[] = ["two", "double", "vest", "open"];
/** Extra creator fields the rig understands. They ride on the look as the optional `x` property (MonkeyLookX), so the
 *  contract type is untouched; every field is optional and defaults to the brand look.
 *   build         -1 slim .. 0 standard .. 1 chubby (shape key "build" on the torso, sleeves, legs, suit front, tie)
 *   jacket        suit style (JacketStyle)                       pocketSquare  show the pocket square
 *   colors        zones the contract has no field for: innerEar (default: between fur and face), eyes, shirt, brows
 *                 (brows + nostrils + mouth line), buttons, square (pocket square), hands (default: the face colour)
 *   gear          recolour the worn gear per slot: main / accent (which region each maps to: wearables.ts WEAR_ZONES) */
export type LookExt = {
  build?: number; jacket?: JacketStyle; pocketSquare?: boolean;
  colors?: { innerEar?: string; eyes?: string; shirt?: string; brows?: string; buttons?: string; square?: string };
  gear?: { head?: GearTint; face?: GearTint; back?: GearTint; body?: GearTint; ears?: GearTint };
};
export type GearTint = { main?: string; accent?: string };
export type MonkeyLookX = MonkeyLook & { x?: LookExt };
export const lookExt = (l: MonkeyLook): LookExt => (l as MonkeyLookX).x ?? {};

const L = (o: Partial<MonkeyLook>, x?: LookExt): MonkeyLookX => ({ ...structuredClone(DEFAULT_LOOK), ...o, ...(x ? { x } : {}) });
export const LOOK_PRESETS: { name: string; look: MonkeyLook }[] = [
  { name: "The Businessman", look: DEFAULT_LOOK },
  { name: "Blue Monday", look: L({ suit: "#3c5a8c", pants: "#2c3550", tie: { style: "tie", color: "#ff8a2a" } }, { pocketSquare: true, colors: { square: "#ff8a2a" } }) },
  { name: "The Intern", look: L({ fur: "#b9824a", face: "#f3d2a8", suit: "#8a8f9c", pants: "#4a4f5c", tie: { style: "bowtie", color: "#d9493a" }, eyes: { style: "sparkle", spacing: 1.04 }, brows: { style: "thin", tilt: -0.5 }, mouth: "grin", ears: { style: "round", size: 1.15 }, headSize: 0.06, feet: { style: "shoes", color: "#3a2a22" } }, { build: -0.8, jacket: "vest", colors: { shirt: "#dfe8f2" } }) },
  { name: "Night Shift", look: L({ fur: "#5a4a46", face: "#d9b79a", suit: "#2a2630", pants: "#1e1b24", tie: { style: "tie", color: "#7a4ea0" }, eyes: { style: "sleepy", spacing: 0.96 }, brows: { style: "bold", tilt: 0.6 }, mouth: "smirk", ears: { style: "pointy", size: 0.95 }, tail: { curl: 0.3 }, feet: { style: "shoes", color: "#17141c" } }, { jacket: "double", colors: { buttons: "#c9ccd6", shirt: "#3a3640" } }) },
  { name: "Golden Boy", look: L({ fur: "#e8b84a", face: "#ffe6bd", suit: "#f3eadb", pants: "#cdbd8c", tie: { style: "tie", color: "#3a6ad1" }, eyes: { style: "round", spacing: 1.08 }, brows: { style: "bushy", tilt: -0.2 }, mouth: "toothy", ears: { style: "floppy", size: 1.1 }, tail: { curl: 1 }, feet: { style: "round", color: "#b98a3a" } }, { build: 0.9, jacket: "open", pocketSquare: true, colors: { square: "#3a6ad1" } }) },
  { name: "Jungle Fresh", look: L({ fur: "#8a5a34", face: "#e6b483", suit: "#4a8a5a", pants: "#2f4a3a", tie: { style: "none", color: "#ffd84a" }, eyes: { style: "beady", spacing: 1.1 }, brows: { style: "bushy", tilt: 0.3 }, mouth: "whistle", ears: { style: "round", size: 1.3 }, headSize: -0.08, tail: { curl: 0.5 }, feet: { style: "round", color: "#6a4226" } }, { jacket: "open", build: 0.3 }) },
  { name: "Big Boss", look: L({ fur: "#c9c2b8", face: "#f0d2c0", suit: "#8a2f3a", pants: "#2a2024", tie: { style: "bowtie", color: "#e8b84a" }, eyes: { style: "sleepy", spacing: 0.9 }, brows: { style: "bold", tilt: 1 }, mouth: "grin", ears: { style: "pointy", size: 0.85 }, headSize: 0.16, tail: { curl: 0.9 }, feet: { style: "shoes", color: "#2a2024" } }, { build: 1, jacket: "double", pocketSquare: true, colors: { square: "#e8b84a" } }) },
];

const pick = <T,>(rng: () => number, a: readonly T[]): T => a[Math.min(a.length - 1, Math.floor(rng() * a.length))];
const hex = (h: number, s: number, l: number) => "#" + shade("#ff0000", 0).setHSL(h, s, l).getHexString();
export function randomLook(rng: () => number): MonkeyLook {
  const furH = 0.04 + rng() * 0.09, suitH = rng();
  return {
    v: 2, fur: hex(furH, 0.35 + rng() * 0.45, 0.3 + rng() * 0.32), face: hex(0.07 + rng() * 0.03, 0.5 + rng() * 0.35, 0.72 + rng() * 0.1),
    headSize: Math.round((rng() * 0.3 - 0.12) * 100) / 100,
    ears: { style: pick(rng, EARS), size: 0.85 + rng() * 0.45 }, eyes: { style: pick(rng, EYES), spacing: 0.9 + rng() * 0.22 },
    brows: { style: pick(rng, BROWS), tilt: rng() * 2 - 1 }, mouth: pick(rng, MOUTHS),
    suit: hex(suitH, 0.25 + rng() * 0.4, 0.28 + rng() * 0.3), pants: hex(suitH, 0.2 + rng() * 0.2, 0.16 + rng() * 0.14),
    tie: { style: pick(rng, TIES), color: hex(rng(), 0.7, 0.55) }, tail: { curl: rng() },
    feet: { style: pick(rng, FEET), color: hex(0.05 + rng() * 0.04, 0.5, 0.3 + rng() * 0.2) },
    x: { build: Math.round((rng() * 2 - 1) * 100) / 100, jacket: pick(rng, JACKETS), pocketSquare: rng() < 0.4, colors: { square: hex(rng(), 0.7, 0.6) } },
  } as MonkeyLookX;
}

const clamp = (v: unknown, a: number, b: number, d: number) => (typeof v === "number" && isFinite(v) ? Math.min(b, Math.max(a, v)) : d);
const col = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d);
const one = <T extends string>(v: unknown, a: readonly T[], d: T): T => (a.includes(v as T) ? (v as T) : d);
/** clamp every field to the creator's ranges (a pasted or old look can never break the rig) */
export function sanitizeLook(raw: unknown): MonkeyLook | null {
  const r = raw as Partial<MonkeyLook> | null, D = DEFAULT_LOOK;
  if (!r || typeof r !== "object" || r.v !== 2) return null;
  return {
    v: 2, fur: col(r.fur, D.fur), face: col(r.face, D.face), headSize: clamp(r.headSize, -0.25, 0.25, 0),
    ears: { style: one(r.ears?.style, EARS, "round"), size: clamp(r.ears?.size, 0.75, 1.35, 1) },
    eyes: { style: one(r.eyes?.style, EYES, "round"), spacing: clamp(r.eyes?.spacing, 0.85, 1.15, 1) },
    brows: { style: one(r.brows?.style, BROWS, "bold"), tilt: clamp(r.brows?.tilt, -1, 1, 0) }, mouth: one(r.mouth, MOUTHS, "smile"),
    suit: col(r.suit, D.suit), pants: col(r.pants, D.pants), tie: { style: one(r.tie?.style, TIES, "tie"), color: col(r.tie?.color, D.tie.color) },
    tail: { curl: clamp(r.tail?.curl, 0, 1, 0.7) }, feet: { style: one(r.feet?.style, FEET, "round"), color: col(r.feet?.color, D.feet.color) },
    ...(sanitizeExt((r as MonkeyLookX).x) ? { x: sanitizeExt((r as MonkeyLookX).x) } : {}),
  } as MonkeyLookX;
}
const optCol = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : undefined);
function sanitizeExt(x: LookExt | undefined): LookExt | undefined {
  if (!x || typeof x !== "object") return undefined;
  const zone = (z: { main?: string; accent?: string } | undefined) => (z && typeof z === "object" ? { main: optCol(z.main), accent: optCol(z.accent) } : undefined);
  const c = x.colors ?? {}, g = x.gear ?? {};
  return JSON.parse(JSON.stringify({
    build: clamp(x.build, -1, 1, 0), jacket: one(x.jacket, JACKETS, "two"), pocketSquare: !!x.pocketSquare,
    colors: { innerEar: optCol(c.innerEar), eyes: optCol(c.eyes), shirt: optCol(c.shirt), brows: optCol(c.brows), buttons: optCol(c.buttons), square: optCol(c.square) },
    gear: { head: zone(g.head), face: zone(g.face), back: zone(g.back), body: zone(g.body), ears: zone(g.ears) },
  }));
}
const r3 = (n: number) => Math.round(n * 1000) / 1000;
/** share code: compact JSON (floats trimmed to 3 decimals) as base64 */
export function encodeLook(l: MonkeyLook): string {
  return btoa(JSON.stringify({ ...l, headSize: r3(l.headSize), ears: { ...l.ears, size: r3(l.ears.size) }, eyes: { ...l.eyes, spacing: r3(l.eyes.spacing) }, brows: { ...l.brows, tilt: r3(l.brows.tilt) }, tail: { curl: r3(l.tail.curl) } }));
}
export function decodeLook(s: string): MonkeyLook | null { try { return sanitizeLook(JSON.parse(atob(s.trim()))); } catch { return null; } }

// ---------------------------------------------------------------- enemy looks (seeded)
export function mulberry(seed: number) {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** head / face / body / back / ears are the kind's own props (wearables.glb ids). They are not loot: the rig keeps them
 *  in any slot the enemy's loot gear leaves empty (rig.setGear, createRig's gear argument). */
export type MonkeyEnemySpec = { look: MonkeyLook; torso: "fur" | "tee"; scale: number; build: number; tuft: boolean; hand: string | null; face: string | null; back: string | null; head: string | null; body: string | null; ears: string | null; bandana?: string };
/** wild monkeys: no clothes, scrappy tuft, boomerang. Bandits (Peel Gang): striped shirt, bandana, loot sack, mean brows. */
export function monkeyEnemy(style: EnemyStyle): MonkeyEnemySpec {
  const rng = mulberry(style.seed * 2654435761), vary = (c: string, dh: number, dl: number) => { const k = shade(c, (rng() - 0.5) * dl), h = { h: 0, s: 0, l: 0 }; k.getHSL(h); return "#" + k.setHSL((h.h + (rng() - 0.5) * dh + 1) % 1, h.s, h.l).getHexString(); };
  const size = 1 + (rng() - 0.5) * 0.16;   // +-8 %
  if (style.kind === "bandit") {
    const fur = vary("#8a5a34", 0.03, 0.14);
    return {
      look: { v: 2, fur, face: vary("#e6b483", 0.01, 0.06), headSize: (rng() - 0.5) * 0.1, ears: { style: pick(rng, ["round", "pointy"] as const), size: 0.9 + rng() * 0.2 },
        eyes: { style: pick(rng, ["sleepy", "round", "beady"] as const), spacing: 0.94 + rng() * 0.12 }, brows: { style: "bold", tilt: 1 }, mouth: pick(rng, ["smirk", "grin"] as const),
        suit: "#f3eadb", pants: vary("#3a3340", 0.05, 0.06), tie: { style: "none", color: "#d9493a" }, tail: { curl: 0.3 + rng() * 0.5 }, feet: { style: "round", color: "#" + shade(fur, -0.1).getHexString() } },
      torso: "tee", scale: 0.92 * size, build: (rng() - 0.3) * 0.9, bandana: pick(rng, ["#d9493a", "#d9493a", "#7a4ea0", "#3a6ad1", "#2f7a4a"] as const), tuft: false, hand: null, face: "prop_bandana", back: "prop_sack", head: null, body: null, ears: null,
    };
  }
  const fur = vary("#9a6a3a", 0.05, 0.2);
  return {
    look: { v: 2, fur, face: vary("#e8c09a", 0.01, 0.08), headSize: (rng() - 0.5) * 0.12, ears: { style: pick(rng, EARS), size: 0.95 + rng() * 0.3 },
      eyes: { style: pick(rng, ["beady", "round", "beady"] as const), spacing: 0.95 + rng() * 0.18 }, brows: { style: pick(rng, ["bushy", "bold"] as const), tilt: 0.2 + rng() * 0.5 },
      mouth: pick(rng, ["toothy", "smirk", "whistle", "toothy"] as const), suit: fur, pants: fur, tie: { style: "none", color: fur }, tail: { curl: rng() },
      feet: { style: "round", color: "#" + shade(fur, -0.08).getHexString() } },
    torso: "fur", scale: 0.85 * size, build: (rng() - 0.5) * 1.2, tuft: true, hand: "prop_boomerang", face: null, back: null, head: null, body: null, ears: null,
  };
}
