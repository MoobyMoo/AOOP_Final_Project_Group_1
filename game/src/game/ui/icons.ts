// Rendered 3D item icons (public/icons/<id>.png at 256 px, <id>@2x.png at 512 px, transparent).
// Built from the Blender models in tools/items/ (same camera and lights for every icon); the ids are
// the loot ids in loot/interim.ts plus the wearable ids in actors/wearables.ts.
// tools/items/compose.py fails if this list and the rendered set drift apart.
export const ICON_IDS: string[] = [
  // loot
  "bunch", "coconut", "rope", "plank", "golden", "honey", "gear", "spring", "boomerang", "mango", "compass", "idol",
  "smoothie", "bandage", "firstaid", "ammo", "key", "extmag",
  // wearables: head, face, back
  "bowler", "tophat", "fedora", "cap", "hardhat", "pith", "beanie", "crown",
  "shades", "aviators", "monocle", "eyepatch", "goggles", "heartglasses", "banditmask",
  "satchel", "bigpack", "cratepack",
  // weapons (tools/items/icon_kingpin.py stages the game GLB)
  "kingpin",
];

const KNOWN = new Set(ICON_IDS);

/** True when a rendered icon exists for this id (callers can fall back to the emoji otherwise). */
export function hasIcon(id: string): boolean { return KNOWN.has(id); }

/** URL of the rendered icon. Pass hiDpi for the 512 px version (large panels, retina slots). */
export function iconUrl(id: string, hiDpi = false): string {
  return `${import.meta.env.BASE_URL}icons/${id}${hiDpi ? "@2x" : ""}.png`;
}
