// What an item is and does, in plain English, for the leather item tag (UI v3, G1.5 row 24: "find out what an item
// does" without help). Numbers come from the systems (combat/weapons.ts HEALS, loot/equipment.ts); the words live here.
import { HEALS } from "../combat/weapons";
import { equipDef } from "../loot/equipment";
import { itemDef } from "../loot/raidloot";
import { equipLines, SLOT_NAME } from "./equipui";

const RARITY: Record<string, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic" };
/** one short line about the thing itself, written as the Businessman would label it */
const BLURB: Record<string, string> = {
  banana: "A bunch of island bananas. The Fence takes them by the crate.",
  coconut: "Heavy, hairy and worth a little at the Fence.",
  vine_rope: "Strong jungle rope. Smuggler Sal is always short of it.",
  golden_banana: "A banana that is somehow gold all the way through.",
  honey_pot: "Wild honey in a clay pot. Sells well.",
  old_gear: "A rusty cog from the plantation machines. Sal wants these.",
  sunset_mango: "The island's best mango. Collectors pay for it.",
  brass_compass: "An old ship's compass. It still points north.",
  banana_idol: "A carved idol the Sleeper guards. Worth a fortune.",
  smoothie: "Thick banana smoothie. Slow to drink, heals a lot.",
  bandage: "A banana-leaf wrap. Quick to put on, heals a little.",
  firstaid: "A proper first-aid kit from the ferry.",
  boomerang: "A bandit's banana boomerang. Sells as a curiosity.",
  ammo45: "Rounds for your Kingpin .45.",
  vine_key: "Opens the vault door. Get it home and it stays on your keyring.",
  radio_key: "Opens the radio shack.",
  plantation_seal: "The workshop seal from the Old Plantation.",
  extended_mag: "A longer magazine for the Kingpin: 12 rounds a mag.",
  spring: "A coiled spring. Useful for repairs.",
  plank: "A sturdy plank. Heavy for what it is worth.",
  kingpin: "Your pistol. It never leaves your hand.",
  briefcase: "Your briefcase. Swing it with V when the gun runs dry.",
};

export type ItemCopy = { name: string; rarity: string; rarityLine: string; blurb: string; does: string[]; use: string };
export function itemCopy(inst: string): ItemCopy {
  const d = itemDef(inst), e = equipDef(inst), id = inst.split("#")[0];
  const rarity = d.rarity, r = RARITY[rarity] ?? "Common";
  let does: string[] = [], use = "";
  let rarityLine = `${r}, sells at the Fence`;
  if (e) {
    does = equipLines(inst);
    use = `Wear it on your ${SLOT_NAME[e.slot].toLowerCase()}`;
    rarityLine = e.bound ? "Yours for good: never lost" : `${r} ${SLOT_NAME[e.slot].toLowerCase()} gear`;
  } else if (d.kind === "heal") {
    const h = HEALS[id];
    does = h ? [`Heals ${h.heal} health`, `Takes ${h.time} s to use; you move slower meanwhile`, ...(h.uses ? [`${h.uses} uses`] : [])] : ["Heals you"];
    use = "Double-click it, press its quick key (3 to 8) or press Q";
    rarityLine = `${r} healing`;
  } else if (d.kind === "ammo") {
    does = [`${d.stack ?? 8} rounds for the Kingpin`, "Goes straight into your ammo pouch"];
    use = "Take it to add the rounds";
    rarityLine = "Ammunition";
  } else if (d.kind === "key") {
    does = ["Opens something on the island", "Kept on your keyring when you get home"];
    use = "Carry it home";
    rarityLine = `${r} key`;
  } else if (d.kind === "attachment") {
    does = ["The Kingpin holds 12 rounds instead of 8", "Fitted the moment you take it"];
    use = "Take it to fit it";
    rarityLine = `${r} gun part`;
  } else if (d.kind === "part") {
    use = "Bring it home and sell it, or keep it for Sal's orders";
    rarityLine = `${r} part, sells at the Fence`;
  } else {
    use = "Bring it home and sell it at the Fence";
  }
  return { name: d.name, rarity: r, rarityLine, blurb: BLURB[id] ?? "", does, use };
}
