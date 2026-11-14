// STUB (lead): replaced by Fable A's rig v2. Defaults = the CURRENT brand Businessman (Shorts cast/businessman_profile_v17_current.png:
// charcoal suit, white shirt, wide orange tie #f46a10, black bowler with a wide orange band, wayfarer shades, orange-brown fur, peach face).
import type { MonkeyLook } from "../contracts";
export const DEFAULT_LOOK: MonkeyLook = {
  v: 2, fur: "#e07a32", face: "#f6c896", headSize: 0,
  ears: { style: "round", size: 1 }, eyes: { style: "round", spacing: 1 }, brows: { style: "bold", tilt: 0 }, mouth: "smile",
  suit: "#4d4848", pants: "#3a3838", tie: { style: "tie", color: "#f46a10" },
  tail: { curl: 0.7 }, feet: { style: "round", color: "#c4612a" },
};
export const LOOK_PRESETS: { name: string; look: MonkeyLook }[] = [{ name: "The Businessman", look: DEFAULT_LOOK }];
export const randomLook = (_rng: () => number): MonkeyLook => structuredClone(DEFAULT_LOOK);
export const encodeLook = (l: MonkeyLook) => btoa(JSON.stringify(l));
export function decodeLook(s: string): MonkeyLook | null { try { const l = JSON.parse(atob(s.trim())); return l && l.v === 2 ? l : null; } catch { return null; } }
