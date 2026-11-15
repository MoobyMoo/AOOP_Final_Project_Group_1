// Map markers as inline SVG (UI direction A: ink outline, brass hardware, tie-orange for the player and pins).
// Roles follow Duckov's POI split (POLISH_FINDINGS 5): extracts green, the roaming boss a red "?", a fixed boss
// pocket a red danger area, plus our own route-closed barrier. All glyphs are ours.
import type { MarkKind } from "./mapdata";

const INK = "#17161a";
const svg = (body: string, s = 28) => `<svg width="${s}" height="${s}" viewBox="0 0 32 32" aria-hidden="true">${body}</svg>`;
export const ICON: Record<MarkKind | "me", string> = {
  // extract: a green ring with an arrow climbing out
  exit: svg(`<circle cx="16" cy="16" r="13" fill="${INK}" stroke="#5fd36a" stroke-width="3"/><path d="M16 23V10M10.5 15.5 16 10l5.5 5.5" fill="none" stroke="#5fd36a" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`),
  // the cove boat: the extract's green ring around a small rowboat (hull, oar and a ripple), a second way home
  boat: svg(`<circle cx="16" cy="16" r="13" fill="${INK}" stroke="#5fd36a" stroke-width="3"/><path d="M8.5 16.5h15l-2.6 4.6h-9.8z" fill="#5fd36a" stroke="#f3ead6" stroke-width="1.4" stroke-linejoin="round"/><path d="M12.5 10.5l7.5 8.5" stroke="#f3ead6" stroke-width="2" stroke-linecap="round"/><path d="M9 24.4c1.6-1 3.2 1 4.8 0s3.2 1 4.8 0 3.2 1 4.6 0" fill="none" stroke="#5fd36a" stroke-width="1.5" stroke-linecap="round"/>`),
  // a way between levels: a brass plate with stair steps
  link: svg(`<rect x="4" y="4" width="24" height="24" rx="3" fill="${INK}" stroke="#c29a5b" stroke-width="2.5"/><path d="M9 23h5v-5h5v-5h5" fill="none" stroke="#f3ead6" stroke-width="2.6" stroke-linejoin="round"/>`, 24),
  zip: svg(`<rect x="4" y="4" width="24" height="24" rx="3" fill="${INK}" stroke="#c29a5b" stroke-width="2.5"/><path d="M8 10 24 22" stroke="#f3ead6" stroke-width="2.2"/><path d="M15 15.3v4.2M13 19.5h4" stroke="#f3ead6" stroke-width="2" stroke-linecap="round"/>`, 24),
  // route closed: a striped barrier board on two legs, in a red plate
  lock: svg(`<rect x="2.5" y="5" width="27" height="22" rx="3" fill="#2a1414" stroke="#ff5b4a" stroke-width="2.5"/><rect x="6" y="11" width="20" height="6" fill="#f3ead6"/><path d="M8 11l-2 6M14 11l-3 6M20 11l-3 6M26 11l-3 6" stroke="#e5482f" stroke-width="2.6"/><path d="M9 17v6M23 17v6" stroke="#f3ead6" stroke-width="2.2"/>`),
  pin: svg(`<path d="M16 30s-9-9.2-9-16a9 9 0 0 1 18 0c0 6.8-9 16-9 16z" fill="#f46a10" stroke="${INK}" stroke-width="2.4"/><circle cx="16" cy="14" r="3.4" fill="${INK}"/>`, 26),
  // the roaming boss once spotted: Duckov's red uncertainty "?" (their colour 1/0.37/0.37), our badge
  boss: svg(`<rect x="3" y="3" width="26" height="26" rx="6" fill="#ff5f5f" stroke="#2a0f0f" stroke-width="2.5"/><path d="M11.6 12.2a4.6 4.6 0 1 1 6.8 4c-1.6.9-2.4 1.8-2.4 3.6" fill="none" stroke="#fff4ec" stroke-width="3.2" stroke-linecap="round"/><circle cx="16" cy="24.2" r="2" fill="#fff4ec"/>`, 30),
  // before the fight: the pocket where the boss holds (a knuckle-dusted fist reads as "big hitter")
  danger: svg(`<path d="M16 3 30 27H2z" fill="#2a1414" stroke="#ff5b4a" stroke-width="2.5" stroke-linejoin="round"/><path d="M16 11v8" stroke="#ff8a7a" stroke-width="3.2" stroke-linecap="round"/><circle cx="16" cy="23" r="1.9" fill="#ff8a7a"/>`, 28),
  down: svg(`<circle cx="16" cy="16" r="12" fill="${INK}" stroke="#7d7883" stroke-width="2.5"/><path d="M11 11l10 10M21 11 11 21" stroke="#b3a993" stroke-width="3" stroke-linecap="round"/>`, 24),
  // the player: a tie-orange chevron with an ink edge, pointing up (rotated to the heading)
  me: svg(`<path d="M16 2 27 28 16 22 5 28z" fill="#f46a10" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><path d="M16 7v12" stroke="#ffd9b8" stroke-width="2" stroke-linecap="round"/>`, 30),
};
/** legend rows for the side panel: [icon, label] */
export const LEGEND: [MarkKind | "me", string][] = [
  ["me", "You"], ["exit", "Extract"], ["boat", "Cove boat (extract)"], ["link", "Way down / up"], ["zip", "Zipline"], ["lock", "Route closed"],
  ["danger", "Boss territory"], ["boss", "Boss sighted"], ["pin", "Your pin"],
];
