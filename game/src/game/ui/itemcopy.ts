// What an item is and does, in plain English, for the leather item tag (UI v3, G1.5 row 24: "find out what an item
// does" without help). Numbers come from the systems (combat/weapons.ts HEALS, loot/equipment.ts); the words live here.
import { HEALS } from "../combat/weapons";
import { equipDef } from "../loot/equipment";
import { itemDef } from "../loot/raidloot";
import { equipLines, SLOT_NAME } from "./equipui";
import { attachmentDef, SLOT_LABEL, statLines, type StatLine } from "../loot/attachments";
import { TIERS } from "../loot/tiers";
import { CALIBERS, CLASS_LABEL, gunOf, isCaliber } from "../combat/guns";
import { STORY_BLURBS } from "../loot/storyitems";

/** the tier names (loot/tiers.ts) */
const RARITY: Record<string, string> = Object.fromEntries(Object.values(TIERS).map(t => [t.key, t.name]));
/** one short line about the thing itself, written as the Businessman would label it */
const BLURB: Record<string, string> = {
  banana: "A bunch of island bananas. The Fence takes them by the crate.",
  coconut: "Heavy, hairy and worth a little at the Fence.",
  vine_rope: "Strong jungle rope. Smuggler Sal is always short of it.",
  golden_banana: "A banana that is somehow gold all the way through.",
  honey_pot: "Wild honey in a clay pot. Sells well.",
  paper: "A ream of office paper. The coupon press eats it.",
  ink: "A green ink cartridge. Very convincing green.",
  premium_bunch: "Ripened in the vault, polished by hand. The Fence pays extra.",
  machine_parts: "Pressed from scrap in the vault. Precise, shiny, very sellable.",
  lockbox_fine: "Sealed tight. The odds are printed on the tag. The Fence has the key.",
  lockbox_uncommon: "Sealed tight. The odds are printed on the tag. The Fence has the key.",
  lockbox_rare: "An executive's lockbox. Heavy. Rattles promisingly.",
  lockbox_epic: "A boardroom lockbox with a brass seal. Somebody important lost this.",
  old_gear: "A rusty cog from the plantation machines. Sal wants these.",
  sunset_mango: "The island's best mango. Collectors pay for it.",
  brass_compass: "An old ship's compass. It still points north.",
  banana_idol: "A carved idol the Sleeper guards. Worth a fortune.",
  smoothie: "Thick banana smoothie. Slow to drink, heals a lot.",
  bandage: "A banana-leaf wrap. Quick to put on, heals a little.",
  firstaid: "A proper first-aid kit from the ferry.",
  boomerang: "A bandit's banana boomerang. Sells as a curiosity.",
  ammo45: "Pistol and SMG rounds: the Kingpin and every .45 gun take them.",
  ammo_rifle: "Rifle rounds for assault rifles and the machine gun.",
  ammo_shell: "Shotgun shells, five pellets in each.",
  ammo_sniper: "Long, heavy sniper rounds.",
  vine_key: "Opens the vault door. Get it home and it stays on your keyring.",
  radio_key: "Opens the radio shack.",
  plantation_seal: "The workshop seal from the Old Plantation.",
  spring: "A coiled spring. Useful for repairs.",
  plank: "A sturdy plank. Heavy for what it is worth.",
  kingpin: "Your pistol. It never leaves your hand.",
  briefcase: "Your briefcase. Swing it with V when the gun runs dry.",
};

/** lines = the stat changes of a gun attachment, each marked better or worse for you (the tag colours them) */
export type ItemCopy = { name: string; rarity: string; rarityLine: string; blurb: string; does: string[]; use: string; lines?: StatLine[] };
export function itemCopy(inst: string): ItemCopy {
  const d = itemDef(inst), e = equipDef(inst), id = inst.split(/[#@]/)[0];
  const rarity = d.rarity, r = RARITY[rarity] ?? "Common";
  let does: string[] = [], use = "", lines: StatLine[] | undefined, blurb = BLURB[id] ?? STORY_BLURBS[id] ?? "";
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
  } else if (d.kind === "gun") {
    const g = gunOf(inst);
    if (g) {
      blurb = g.blurb;
      does = [g.trait, `${CALIBERS[g.caliber].name}, ${g.mag} in the ${g.pellets > 1 ? "tube" : "magazine"}`];
      use = "Drag it onto gun 1 or gun 2, or double-click it to fill an empty gun slot";
      rarityLine = g.bound ? "Yours for good: never lost" : `${r} ${CLASS_LABEL[g.cls].toLowerCase()}`;
    }
  } else if (d.kind === "ammo") {
    const cal = id.split("~")[0];
    does = [`${d.stack ?? 8} ${isCaliber(cal) ? CALIBERS[cal].name.toLowerCase() : "rounds"}`, "Goes straight into your ammo pouch; only guns of this caliber load it"];
    use = "Take it to add the rounds";
    rarityLine = "Ammunition";
  } else if (d.kind === "note") {
    does = ["Click it to read it", "Reading it counts for jobs that want it"];
    use = "Click it to read it. The Fence buys paper for a banana";
    rarityLine = "Lore note";
  } else if (d.kind === "key" && (id === "road_map" || id === "cove_flare")) {
    does = ["A job wants this", "Sorted to your cheek pouch: safe if you get bonked"];
    use = "Carry it home to your stash";
    rarityLine = `${r} job item`;
  } else if (d.kind === "key") {
    does = ["Opens something on the island", "Kept on your keyring when you get home"];
    use = "Carry it home";
    rarityLine = `${r} key`;
  } else if (d.kind === "attachment") {
    const a = attachmentDef(id);
    lines = statLines(id); does = lines.map((l) => l.text); blurb = a?.blurb ?? blurb;
    use = "Drag it onto the Kingpin, or double-click it in your pack, to fit it";
    rarityLine = `${r} ${a ? SLOT_LABEL[a.slot].toLowerCase() : "gun part"} attachment`;
  } else if (d.kind === "lockbox") {
    does = ["Sealed: the odds of each prize tier are on the tag", "Found only in raids; the Fence won't buy it sealed"];
    use = "Bring it home and have the Fence open it for a fee";
    rarityLine = `${r} lockbox`;
  } else if (d.kind === "part") {
    use = "Bring it home and sell it, or keep it for Sal's orders";
    rarityLine = `${r} part, sells at the Fence`;
  } else {
    use = "Bring it home and sell it at the Fence";
  }
  return { name: d.name, rarity: r, rarityLine, blurb, does, use, lines };
}
