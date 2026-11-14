// Item icon markup: the rendered 3D icon (public/icons/<id>.png, Fable D) when it exists, else the emoji fallback.
import { itemDef, RAR_COLOR } from "../loot/raidloot";
const have = new Set<string>();
/** call once at boot with the ids that have rendered icons (from ui/icons.ts once merged) */
export function registerIcons(ids: string[]) { for (const i of ids) have.add(i); }
export function iconHtml(id: string, size = 40) {
  const d = itemDef(id);
  return have.has(id) ? `<img class="ico" src="/icons/${id}.png" srcset="/icons/${id}@2x.png 2x" width="${size}" height="${size}" alt="${d.name}">` : `<span class="emo" style="font-size:${Math.round(size * 0.62)}px">${d.icon}</span>`;
}
export const rarColor = (id: string) => RAR_COLOR[itemDef(id).rarity];
