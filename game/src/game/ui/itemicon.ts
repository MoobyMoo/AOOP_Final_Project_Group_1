// Item icon markup: the rendered 3D icon (public/icons/<id>.png, Fable D; ids in ui/icons.ts) when it exists,
// else the emoji fallback.
import { itemDef, RAR_COLOR } from "../loot/raidloot";
import { hasIcon, iconUrl } from "./icons";
/** loot-table ids → rendered icon file names (the icon set used short names) */
const ALIAS: Record<string, string> = { banana: "bunch", vine_rope: "rope", golden_banana: "golden", honey_pot: "honey", old_gear: "gear", sunset_mango: "mango", brass_compass: "compass", banana_idol: "idol", vine_key: "key", extended_mag: "extmag", ammo45: "ammo" };
export const iconId = (item: string) => (hasIcon(item) ? item : ALIAS[item] ?? item);
export function iconHtml(item: string, size = 40) {
  const d = itemDef(item), id = iconId(item);
  return hasIcon(id) ? `<img class="ico" src="${iconUrl(id)}" srcset="${iconUrl(id, true)} 2x" width="${size}" height="${size}" alt="${d.name}" draggable="false">` : `<span class="emo" style="font-size:${Math.round(size * 0.62)}px">${d.icon}</span>`;
}
export const rarColor = (id: string) => RAR_COLOR[itemDef(id).rarity];
