// STUB (lead): replaced by Fable A's rig v2. Look record defaults = the brand Businessman (BRAND.md).
import type { MonkeyLook } from "../contracts";
export const DEFAULT_LOOK: MonkeyLook = {
  v: 1, fur: "#e07a32", face: "#f6c896", headSize: 0,
  ears: { style: "round", size: 1 }, eyes: { style: "shades", spacing: 1 }, brows: { style: "bold", tilt: 0 }, mouth: "smile",
  hat: { style: "bowler", color: "#26222c", band: "#ffb02a" }, suit: "#3c5a8c", pants: "#2c3550", tie: { style: "tie", color: "#ff8a2a" },
  tail: { curl: 0.7 }, feet: { style: "round", color: "#c4612a" },
};
export const LOOK_PRESETS: { name: string; look: MonkeyLook }[] = [{ name: "The Businessman", look: DEFAULT_LOOK }];
export const randomLook = (_rng: () => number): MonkeyLook => structuredClone(DEFAULT_LOOK);
export const encodeLook = (l: MonkeyLook) => btoa(JSON.stringify(l));
export function decodeLook(s: string): MonkeyLook | null { try { const l = JSON.parse(atob(s.trim())); return l && l.v === 1 ? l : null; } catch { return null; } }
