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
  // the player: a round avatar badge (Duckov's "You" pin): a tie-orange disc in a cream ring, a monkey head in ink,
  // and a notch on the ring pointing the way you face (the badge is rotated to the heading; the head turns with it)
  me: `<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><path d="M17 1.2 21 6.4H13z" fill="#f3ead6"/><circle cx="17" cy="18" r="12.4" fill="#f46a10" stroke="#f3ead6" stroke-width="2.6"/><circle cx="10.6" cy="16.8" r="2.5" fill="${INK}"/><circle cx="23.4" cy="16.8" r="2.5" fill="${INK}"/><circle cx="17" cy="18.4" r="6" fill="${INK}"/><ellipse cx="17" cy="20.2" rx="3.9" ry="3" fill="#f6c896"/></svg>`,
};
/** the M map's "You" pin: the badge stays upright, a notch on its rim turns to your heading */
export const ME_FACE = ICON.me.replace(/<path d="M17 1.2 21 6.4H13z" fill="#f3ead6"\/>/, "");
export const ME_NOTCH = `<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><path d="M17 0.6 21.6 6.6H12.4z" fill="#f3ead6" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
/** what each marker is, for the hover tag (map v5: Duckov's map has no legend panel; the meaning sits on the marker) */
export const TIPS: Record<MarkKind | "me", [string, string]> = {
  me: ["You", "Where you stand, pointing the way you face"], exit: ["Extract", "Stand in the ring to get home"], boat: ["Cove boat", "An extract: row home from the cove"],
  link: ["Way down or up", "A way between the surface and the grotto"], zip: ["Zipline", "A one-way ride down to the beach"],
  lock: ["Route closed", "Shut for the demo: opens in the full game"], danger: ["Boss territory", "The boss holds this ground"],
  boss: ["Boss sighted", "Last seen here, and moving"], down: ["Boss bonked", "Taken care of"], pin: ["Your marker", "Right-click it to take it off the map"],
};

// ---------------------------------------------------------------- the player's map markers (Duckov: a row of icons and
// a row of colour swatches, right-click the map to place or remove one; markers show on the map only, never in the
// world). Twelve glyphs, all ours: Bananaville things (a banana, the briefcase, a crate, a skull in a bowler...).
// Each is a 24 u body in currentColor: white in the bar, the marker's colour on the map (an ink drop shadow outlines it).
const P = (d: string) => `<path fill-rule="evenodd" d="${d}" fill="currentColor"/>`;
export const PIN_GLYPHS: [string, string][] = [
  ["Banana", P("M4.2 5.6c-.2 6.6 5.6 11.6 14.6 10.6l2.2-.2c-1.4 3.8-5.4 6-9.6 5.4C5.4 20.6 1.4 14.4 2.4 7.4zM2.4 6.6 1.6 3.8l2.2-.7.8 2.8z")],
  ["Briefcase", P("M9 3.5h6A1.6 1.6 0 0 1 16.6 5.1v1.6h3.6A1.8 1.8 0 0 1 22 8.5v10A1.8 1.8 0 0 1 20.2 20.3H3.8A1.8 1.8 0 0 1 2 18.5v-10A1.8 1.8 0 0 1 3.8 6.7h3.6V5.1A1.6 1.6 0 0 1 9 3.5zm.4 1.9v1.3h5.2V5.4zM2 12.2h20v1.5H2zm8.6-.6h2.8v2.7h-2.8z")],
  ["Crate", P("M2.8 3.5h18.4v17H2.8zm2.4 2.4v12.2h13.6V5.9zM6.6 7.8l9.6 9 1.2-1.3-9.6-9z")],
  ["Danger", P("M7.2 8.2C7.2 4.9 9.2 3 12 3s4.8 1.9 4.8 5.2zM3.8 8.6h16.4v1.7H3.8zM6.4 11.6h11.2v2.9c0 2-1 3.1-2.6 3.7v2.9H9v-2.9c-1.6-.6-2.6-1.7-2.6-3.7zm2.3 1.5v2.3h2.4v-2.3zm4.2 0v2.3h2.4v-2.3z")],
  ["Target", P("M12 2.4a9.6 9.6 0 1 1 0 19.2 9.6 9.6 0 0 1 0-19.2zm0 2.3a7.3 7.3 0 1 0 0 14.6 7.3 7.3 0 0 0 0-14.6zm0 2.5a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6zm0 2.4a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z")],
  ["Key", P("M7.3 6a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2.9a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2z") + P("M12.4 9.8h9.4v2.4h-1.9v3h-2.4v-3h-1.4v2h-2.4v-2h-1.3z")],
  ["Med kit", P("M5 4.6h14a2 2 0 0 1 2 2v12.2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.6a2 2 0 0 1 2-2zm5.6 3.8v3.1H7.5v2.8h3.1v3.1h2.8v-3.1h3.1v-2.8h-3.1V8.4z")],
  ["Flag", P("M4.6 2.8h2.2v18.4H4.6zM7.6 3.8h12l-2.8 4.2 2.8 4.2h-12z")],
  ["Watch", P("M1.6 12C5.2 5.8 18.8 5.8 22.4 12 18.8 18.2 5.2 18.2 1.6 12zm10.4-3.9a3.9 3.9 0 1 0 0 7.8 3.9 3.9 0 0 0 0-7.8zm0 2.3a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2z")],
  ["Unknown", `<path d="M8.4 8.6a3.7 3.7 0 1 1 5.4 3.3c-1.2.7-1.8 1.4-1.8 2.8" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><circle cx="12" cy="19.2" r="1.7" fill="currentColor"/>`],
  ["Cross", `<path d="M5.5 5.5l13 13M18.5 5.5l-13 13" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>`],
  ["Way out", P("M12 2.6l7.4 8.2h-4.6v9.6H9.2v-9.6H4.6z")],
];
/** the colour swatches (Duckov: five, a white default first) */
export const PIN_COLORS = ["#f3ead6", "#e04060", "#f46a10", "#bfe08a", "#58c8e8"];
/** one marker on the map: the glyph in its colour (the CSS drop shadow is its outline) */
export const pinSvg = (i = 0, c = PIN_COLORS[0], size = 26) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="color:${c}" aria-hidden="true">${PIN_GLYPHS[i % PIN_GLYPHS.length][1]}</svg>`;
/** the glyph for the markers bar (white, currentColor) */
export const glyphSvg = (i: number) => `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">${PIN_GLYPHS[i][1]}</svg>`;
