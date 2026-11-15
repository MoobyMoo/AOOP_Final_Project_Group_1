// Live tuning registry (Moo 2026-11-15: "a lot of stuff needs to be tunable"). A group is a plain object the game
// already reads every frame; registering it gives each number a range, applies saved overrides in place, and lets the
// ?tune panel (ui/tunepanel.ts) change it live. Nothing is copied: code that reads GROUP.key sees the new value on its
// next read, so there is no reload and no subscription to forget.
//   const CAM = tune("camera", "lead", 0.22, { min: 0, max: 0.6, step: 0.01 });  // CAM.lead, live
//   tuneObject("player", PLAYER, { speed: { min: 2, max: 8 }, "stamina.max": { min: 20, max: 200 } });
// Overrides (only values that differ from the default) persist in localStorage "bv_tune"; export/import is that JSON.
export type Range = { min: number; max: number; step?: number; label?: string };
type Key = { path: string[]; def: number; range: Range };
export type TuneGroup = { name: string; obj: Record<string, unknown>; keys: Map<string, Key>; persist: boolean; onChange?: (key: string, v: number) => void; note?: string };

const LS = "bv_tune";
const groups = new Map<string, TuneGroup>();
const listeners = new Set<(group: string, key: string, v: number) => void>();
const store = (): Storage | null => (typeof localStorage === "undefined" ? null : localStorage);
let saved: Record<string, Record<string, number>> = (() => { try { return JSON.parse(store()?.getItem(LS) ?? "{}") ?? {}; } catch { return {}; } })();

function getPath(obj: Record<string, unknown>, path: string[]): number { let o: unknown = obj; for (const p of path) o = (o as Record<string, unknown>)[p]; return o as number; }
function setPath(obj: Record<string, unknown>, path: string[], v: number) { let o = obj; for (const p of path.slice(0, -1)) o = o[p] as Record<string, unknown>; o[path[path.length - 1]] = v; }
function persist() { store()?.setItem(LS, JSON.stringify(saved)); }
function group(name: string, obj?: Record<string, unknown>, opts: { persist?: boolean; onChange?: TuneGroup["onChange"]; note?: string } = {}): TuneGroup {
  let g = groups.get(name);
  if (!g) { g = { name, obj: obj ?? {}, keys: new Map(), persist: opts.persist ?? true }; groups.set(name, g); }
  if (opts.onChange) g.onChange = opts.onChange; if (opts.note) g.note = opts.note; if (opts.persist !== undefined) g.persist = opts.persist;
  return g;
}
function adopt(g: TuneGroup, key: string, range: Range) {
  const path = key.split("."), def = getPath(g.obj, path);
  if (typeof def !== "number") throw new Error(`tune ${g.name}.${key} is not a number`);
  g.keys.set(key, { path, def, range });
  const o = g.persist ? saved[g.name]?.[key] : undefined;
  if (typeof o === "number" && Number.isFinite(o)) setPath(g.obj, path, o);
}

/** register one number; returns the group's live object (the value is at obj[key]) */
export function tune(groupName: string, key: string, def: number, range: Range): Record<string, number> {
  const g = group(groupName);
  if (!g.keys.has(key)) { (g.obj as Record<string, number>)[key] = def; adopt(g, key, range); }
  return g.obj as Record<string, number>;
}
/** adopt an existing object (its current numbers are the defaults); keys may be dotted paths into nested objects */
export function tuneObject<T extends object>(groupName: string, obj: T, ranges: Record<string, Range>, opts: { persist?: boolean; onChange?: TuneGroup["onChange"]; note?: string } = {}): T {
  const g = group(groupName, obj as Record<string, unknown>, opts);
  for (const [key, range] of Object.entries(ranges)) if (!g.keys.has(key)) adopt(g, key, range);
  if (g.onChange) for (const key of Object.keys(ranges)) g.onChange(key, getPath(g.obj, g.keys.get(key)!.path));
  return obj;
}
export const getTune = (groupName: string, key: string) => { const g = groups.get(groupName), k = g?.keys.get(key); return g && k ? getPath(g.obj, k.path) : NaN; };
export function setTune(groupName: string, key: string, v: number) {
  const g = groups.get(groupName), k = g?.keys.get(key); if (!g || !k || !Number.isFinite(v)) return;
  setPath(g.obj, k.path, v);
  if (g.persist) {
    const s = (saved[g.name] ??= {});
    if (Math.abs(v - k.def) < 1e-9) delete s[key]; else s[key] = v;
    if (!Object.keys(s).length) delete saved[g.name];
    persist();
  }
  g.onChange?.(key, v);
  for (const f of listeners) f(groupName, key, v);
}
export function resetGroup(groupName: string) { const g = groups.get(groupName); if (!g) return; for (const [key, k] of g.keys) setTune(groupName, key, k.def); }
export function resetAll() { for (const name of groups.keys()) resetGroup(name); }
/** every persisted group's overrides, or (all = true) every current value */
export function exportTune(all = false): string {
  const out: Record<string, Record<string, number>> = {};
  for (const g of groups.values()) for (const [key, k] of g.keys) { const v = getPath(g.obj, k.path); if (all || Math.abs(v - k.def) > 1e-9) (out[g.name] ??= {})[key] = v; }
  return JSON.stringify(out, null, 1);
}
/** apply a JSON export; unknown groups and keys are kept in storage for when they register. Returns keys applied. */
export function importTune(json: string): number {
  const data = JSON.parse(json) as Record<string, Record<string, number>>; let n = 0;
  for (const [name, values] of Object.entries(data ?? {})) for (const [key, v] of Object.entries(values ?? {})) {
    if (typeof v !== "number") continue;
    if (groups.get(name)?.keys.has(key)) { setTune(name, key, v); n++; } else { (saved[name] ??= {})[key] = v; persist(); }
  }
  return n;
}
export const tuneGroups = () => [...groups.values()];
export function onTune(f: (group: string, key: string, v: number) => void) { listeners.add(f); return () => listeners.delete(f); }
export const tuneDefault = (groupName: string, key: string) => groups.get(groupName)?.keys.get(key)?.def ?? NaN;
// test and capture handle
(globalThis as unknown as { __tune: object }).__tune = { get: getTune, set: setTune, reset: resetGroup, resetAll, export: exportTune, import: importTune, groups: () => tuneGroups().map((g) => g.name) };
