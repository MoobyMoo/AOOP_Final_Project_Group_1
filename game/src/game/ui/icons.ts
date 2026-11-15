// Rendered 3D item icons: public/icons/<id>.png, one 256 x 256 transparent PNG per icon (G1.5 row 08, the icon spec
// in POLISH_FINDINGS 6: same camera for every icon, 30 degrees down and 35 degrees off the front, soft key light,
// only the object in the frame). Shown in 90 px inventory cells at 1080p, so 256 px covers 2x displays too.
// Built from the Blender models in tools/items/; the ids are the short loot ids (ui/itemicon.ts maps the table ids
// to them), the wearable ids in actors/wearables.ts, and the typed containers (kit_build.ts container(type)).
// tools/items/compose.py fails if this list and the rendered set drift apart.
export const ICON_IDS: string[] = [
  // loot
  "bunch", "coconut", "rope", "plank", "golden", "honey", "gear", "spring", "boomerang", "mango", "compass", "idol",
  "smoothie", "bandage", "firstaid", "ammo", "key", "extmag", "radio_key",
  // wearables: head, face, back
  "bowler", "tophat", "fedora", "cap", "hardhat", "pith", "beanie", "crown",
  "shades", "aviators", "monocle", "eyepatch", "goggles", "heartglasses", "banditmask",
  "satchel", "bigpack", "cratepack",
  // G1-23 loot gear: head, face, body, back, ears (tools/items/icon_gear.py stages the rig meshes), plus the bound suit
  "pot_helmet", "coconut_helmet", "warden_helmet", "snorkel",
  "leaf_vest", "life_jacket", "peel_jacket", "bamboo_plate", "coconut_cuirass", "warden_vest",
  "sack", "walkman", "radio_headset", "suit",
  // G1.5 row 26: the boss escorts' gear
  "guard_helmet", "guard_plate",
  // weapons (tools/items/icon_kingpin.py stages the game GLB)
  "kingpin",
  // Kingpin attachments, by their node id in attachments.glb (tools/items/icon_attachments.py stages that GLB)
  "att_sight_holo", "att_sight_2x", "att_muzzle_comp", "att_muzzle_supp", "att_mag_ext", "att_laser",
  // typed loot containers, for the looting screen and the map legend: iconUrl(`cont_${type}`)
  "cont_weapon", "cont_food", "cont_ammo", "cont_parts", "cont_medical",
  // G2 containers (tools/blender/build/g_containers.py)
  "cont_lunchbox", "cont_toolbox", "cont_medcabinet", "cont_safe", "cont_trash", "cont_sack",
];

const KNOWN = new Set(ICON_IDS);

/** True when a rendered icon exists for this id (callers can fall back to the emoji otherwise). */
export function hasIcon(id: string): boolean { return KNOWN.has(id); }

/** URL of the rendered icon. There is one 256 px file per icon; hiDpi is accepted for older callers and ignored. */
export function iconUrl(id: string, hiDpi = false): string {
  void hiDpi;
  return `${import.meta.env.BASE_URL}icons/${id}.png`;
}
