// The menu tab bar (UI v4, the Duckov frames: frames/m-map, a row of icons centred across the top of every full-screen
// menu, inventory with its weight under it, character, quests, map, keys, notes; the open one in a filled circle).
// Ours, in the ui3 suit: Pack (the Tab screen, your load under it), Jobs, Map and Notes in a raid; Jobs and Notes in
// the vault's job log. Every menu screen reports itself here when it opens or closes; opening one closes the others,
// so the bar switches screens in place. The keys stay as they were: Tab the pack, M the map, J the vault's job log.
// The raid's Jobs and Notes pages live here too (a ledger plate; their HTML comes from story/raid.ts).
import { G } from "../core/state";
import { sfx } from "../core/audio";
import { carriedWeight } from "../actors/player";
import { carryLimit } from "./equipui";

export type MenuTab = "pack" | "jobs" | "map" | "notes";
type Screen = { open: () => void; close: () => void; isOpen: () => boolean };
const screens: Partial<Record<MenuTab, Screen>> = {};
/** the pages' HTML (story/raid.ts in a raid; the vault registers its own Jobs and Notes screens) */
export const menuPages: Partial<Record<"jobs" | "notes", () => string>> = {};
/** where the Jobs and Notes tabs go (story/vault.ts: the raid's pages, or the vault's job log plate) */
export const menuHooks = { page: null as null | ((t: "jobs" | "notes") => void) };

const I = (d: string) => `<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" fill="currentColor" d="${d}"/></svg>`;
const TABS: Record<MenuTab, { name: string; key: string; icon: string }> = {
  // the satchel: a flap bag with a buckle
  pack: { name: "Pack", key: "Tab", icon: I("M8.5 3.2h7a1.5 1.5 0 0 1 1.5 1.5V6h1.8A2.2 2.2 0 0 1 21 8.2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.2A2.2 2.2 0 0 1 5.2 6H7V4.7a1.5 1.5 0 0 1 1.5-1.5zm.3 1.8V6h6.4V5zM4.8 8.4v3.8c2.2 1.3 4.6 2 7.2 2s5-.7 7.2-2V8.4zm6 4.4h2.4v3h-2.4z") },
  // a clipboard with a tick
  jobs: { name: "Jobs", key: "J", icon: I("M9 2.6h6a1 1 0 0 1 1 1V4.4h2.2A1.8 1.8 0 0 1 20 6.2v13.4a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 19.6V6.2a1.8 1.8 0 0 1 1.8-1.8H8V3.6a1 1 0 0 1 1-1zm.8 1.8v1.8h4.4V4.4zm6.4 6.2-5.3 5.3-2.9-2.9-1.4 1.4 4.3 4.3 6.7-6.7z") },
  // a folded map
  map: { name: "Map", key: "M", icon: I("M2.5 5.2 8.6 3l6.8 2.3 6.1-2.2v15.7l-6.1 2.2-6.8-2.3-6.1 2.2zm7.2.2v12.4l4.6 1.6V7z") },
  // a curled note
  notes: { name: "Notes", key: "", icon: I("M6 2.6h9.4L20 7.2v12.4a1.8 1.8 0 0 1-1.8 1.8H6a1.8 1.8 0 0 1-1.8-1.8V4.4A1.8 1.8 0 0 1 6 2.6zm8.6 1.8v3.6h3.6zM7.4 11h9.2v1.6H7.4zm0 3.4h9.2V16H7.4zm0 3.4h6v1.6h-6z") },
};

let bar: HTMLDivElement | null = null, active: MenuTab | null = null;
const tabsHere = (): MenuTab[] => (G.scene === "raid" ? ["pack", "jobs", "map", "notes"] : ["jobs", "notes"]);

export function registerMenu(tab: MenuTab, s: Screen) { screens[tab] = s; }
/** a menu screen opened: close the others, show the bar with it lit */
export function menuOpened(tab: MenuTab) {
  active = tab;
  for (const [t, s] of Object.entries(screens) as [MenuTab, Screen][]) if (t !== tab && s.isOpen()) s.close();
  if (tab !== "jobs" && tab !== "notes") closePage();
  draw();
}
/** a menu screen closed: the bar goes with it (unless another screen took over first) */
export function menuClosed(tab: MenuTab) { if (active !== tab) return; active = null; bar?.remove(); bar = null; }
export const menuBarOpen = () => !!bar;

function draw() {
  if (!active) return;
  if (!bar) {
    bar = document.createElement("div"); bar.className = "mb3"; bar.setAttribute("role", "tablist"); bar.setAttribute("aria-label", "Menu");
    document.body.appendChild(bar);
    bar.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-tab]"); if (b) go(b.dataset.tab as MenuTab); });
  }
  const tabs = tabsHere(), w = carriedWeight(), lim = carryLimit();
  bar.innerHTML = `<div class="ui-ref"><div class="mb3-row">${tabs.map((t) => `<button role="tab" data-tab="${t}" class="${t === active ? "on" : ""}" aria-selected="${t === active}" title="${TABS[t].name}${TABS[t].key ? ` (${TABS[t].key})` : ""}">${TABS[t].icon}<span class="nm">${TABS[t].name}</span>${t === "pack" ? `<small class="num ${w > lim ? "over" : ""}">${w.toFixed(1)}/${lim}kg</small>` : ""}</button>`).join("")}<i class="mb3-rule"></i></div></div>`;
}
/** switch to a tab from the bar */
function go(tab: MenuTab) {
  if (tab === active) return; sfx("ui");
  const s = screens[tab];
  if (s) { s.open(); return; }
  if (tab === "jobs" || tab === "notes") (menuHooks.page ?? openPage)(tab);
}

// ---------------------------------------------------------------- the raid's Jobs and Notes pages
let page: HTMLDivElement | null = null;
export const menuPageOpen = () => !!page;
export function openPage(tab: "jobs" | "notes") {
  const html = menuPages[tab]?.(); if (html === undefined) return;
  if (!page) {
    page = document.createElement("div"); page.className = "mb3-page"; page.setAttribute("role", "dialog");
    document.body.appendChild(page);
    addEventListener("keydown", onPageKey, true);
  }
  page.setAttribute("aria-label", TABS[tab].name);
  page.innerHTML = `<div class="dim"></div><div class="ui-ref"><section class="plate mb3-sheet"><i class="brk tl"></i><i class="brk tr"></i><i class="brk bl"></i><i class="brk br"></i><header><h2>${TABS[tab].name}</h2><small>Esc to close</small></header><div class="tie"></div><div class="mb3-body">${html}</div></section></div>`;
  page.dataset.tab = tab; menuOpened(tab);
}
export function refreshPage() { if (page) openPage(page.dataset.tab as "jobs" | "notes"); }
export function closePage() {
  if (!page) return; const t = page.dataset.tab as MenuTab; page.remove(); page = null; removeEventListener("keydown", onPageKey, true); menuClosed(t);
}
function onPageKey(e: KeyboardEvent) {
  if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); closePage(); sfx("ui"); }
}
/** the pack's weight under its icon, kept fresh while a raid menu is open (hud.update) */
export function menuTick() { if (bar && active && G.scene === "raid") { const sm = bar.querySelector("small"); const t = `${carriedWeight().toFixed(1)}/${carryLimit()}kg`; if (sm && sm.textContent !== t) sm.textContent = t; } }
