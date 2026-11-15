// Story items (LORE.md "Story in the demo", G1.5 row 40): the readable lore notes (item kind "note"), the quest items
// the jobs ask for, and the Grove Keeper's carving. Data only, no imports from loot/tables.ts (tables spreads these
// into ITEMS), so there is no import cycle. Where each one turns up is world data: world/map/grove.ts STORY_SOCKETS.
//
// Notes are ordinary owned items ("type@uuid", Sol's ledger): you find one in a container or on the ground, click it
// in the loot or Tab screen to read it (that counts for quests, core/quests.ts), and the Fence buys the paper for a
// banana. Quest items are kind "key": they sort to the top of the pack (the cheek pouch keeps them through a bonk-out),
// the Fence never sells them, and the job that wants them takes them at turn-in.
import type { ItemDef } from "../contracts";

export type NoteDef = { id: string; title: string; where: string; text: string };
/** each note is under 60 words, in LORE.md's voice: satire, short punchy lines, the island's crooked economy */
export const NOTES: NoteDef[] = [
  { id: "note_guard_log", title: "Checkpoint Guard Log", where: "the checkpoint guard's lunchbox",
    text: "Day 41. Nothing to report. Day 42. A bandit stole my lunch. Day 43. The bandit brought my lunch back and ate it in front of me. Day 44. The foreman says guard his road map with my life. It's in my coat. My coat is on the wall. I'm at lunch." },
  { id: "note_foreman_ledger", title: "The Foreman's Ledger (the real one)", where: "the plantation office safe",
    text: "Bananas harvested: 4,000. Bananas reported: 400. Difference: \"rot.\" Paid: two Hired Guns to sit on this safe and look tough. The Warden's cut: one crate a week. My cut: the rest. Note to self: burn this ledger. Note to self: buy matches." },
  { id: "note_pirate_iou", title: "Rum Runner IOU", where: "the smugglers' picnic at the cove",
    text: "I.O.U. one chest of the good bananas, payable when the green flare goes up over the cove. Signed, Captain Saltbeard of the Rum Runners. Witnessed by: a parrot. Interest: also the parrot." },
  { id: "note_alien_report", title: "Lookout's Strange Report", where: "under the camp watchtower",
    text: "To the boss. At midnight a green light came down over the north jungle. It hummed. The trees went quiet. I did not drink anything. I drank a little. Requesting a transfer, or binoculars that see less." },
  { id: "note_grove_board", title: "Carved Keeper Board", where: "by the Grove Keeper's camp in the mangrove",
    text: "Carved deep, between rows of leaf marks: THE ISLAND WAS HERE BEFORE THE WALLS. WALK SOFT IN THE MANGROVE. TAKE FRUIT, NOT ROOTS. THE LANTERN-KEEPER TRADES BY THE WATER. WHOEVER HARMS A KEEPER TRADES WITH NO ONE." },
  { id: "note_merc_invoice", title: "Hired Guns Invoice #0071", where: "the overseer's coat in the plantation office",
    text: "Client: the Plantation Foreman. Service: two Hired Guns in matching vests, to stand by one safe and look expensive. Rate: 30 bananas a day, helmets extra. Late fee: we take the safe. Thank you for choosing Hired Guns. We're already behind you." },
  { id: "note_ferry_manifest", title: "Prison Ferry Manifest", where: "the ferry guard's coat",
    text: "Passengers: one. Crime: creative accounting, 312 counts. Luggage: one suit, one briefcase, one bowler (prisoner refused to part with it). Destination: the Island. Return trip: none scheduled. Captain's note: he tried to sell me a timeshare. I nearly bought it." },
  { id: "note_gang_dues", title: "Peel Gang Dues Book", where: "the gang boss's safe at the camp",
    text: "Monthly dues: 5 bananas. Members who paid: 0. Members who say they paid: all of them. Treasury: one button, some string and an IOU from Sal. Boss says the next one who robs the gang gets thrown out of the gang. Nobody got the joke." },
  { id: "note_robot_memo", title: "Warden's Memo: Prototype R-1", where: "the barn's parts bins",
    text: "To all staff. Security prototype R-1 was shipped to the plantation barn by mistake. Do not open its panel. Do not feed it bananas. Do not say \"audit\" near it. If it starts counting, leave the barn. The Warden. P.S. Who ordered forty robots?" },
  // a hint at the later acts' twist (LORE.md "The tech boom and the twist"): intriguing, gives nothing away, gates nothing
  { id: "note_courier_slip", title: "Mainland Courier Slip", where: "the ferry's guard locker, where the captain kept the mail",
    text: "SEALED. CAPTAIN'S EYES ONLY. A certain investor, V.P., will make the crossing once the exile's enterprise is worth the trip. Extend every courtesy. Ask nothing. Our usual arrangement applies. Burn after reading. (Pressed in green wax: a bank seal, filed off. Badly.)" },
];
export const noteOf = (id: string) => NOTES.find((n) => n.id === id);
export const isNote = (type: string) => NOTES.some((n) => n.id === type);

export const STORY_ITEMS: Record<string, ItemDef> = {
  ...Object.fromEntries(NOTES.map((n) => [n.id, { id: n.id, name: n.title, icon: "📜", rarity: "common" as const, value: 1, kind: "note" as const, weight: 0.05 }])),
  // quest items: kind "key" keeps them safe from the Fence and in the cheek pouch. Tiers (loot/tiers.ts, Duckov quality):
  // notes are paper worth a banana, Petty (q1); the two quest items Premium (q3: blue, a 1 s reveal, never slowed down);
  // the carving is a trophy, Boardroom (q5)
  road_map: { id: "road_map", name: "Foreman's Road Map", icon: "🗺️", rarity: "uncommon", value: 0, kind: "key", weight: 0.1 },
  cove_flare: { id: "cove_flare", name: "Cove Signal Flare", icon: "🧨", rarity: "uncommon", value: 0, kind: "key", weight: 0.3 },
  // the Grove Keeper's trade good: an epic curiosity (it goes on the trophy wall), priced above what the Fence pays
  keeper_carving: { id: "keeper_carving", name: "Keeper Seed Carving", icon: "🪵", rarity: "epic", value: 70, kind: "sell", weight: 0.4 },
};
/** the item tag's one line about each (ui/itemcopy.ts BLURB style) */
export const STORY_BLURBS: Record<string, string> = {
  road_map: "The foreman's map of the inland roads. Sal wants it: with it, the pod can fly you to the plantation road.",
  cove_flare: "A green flare the Rum Runners answer. Keep it in your stash and the pod can drop you at Smuggler's Cove.",
  keeper_carving: "A seed pod carved into a tiny lantern by the Grove Keepers. Collectors pay well. The trophy wall pays better.",
  ...Object.fromEntries(NOTES.map((n) => [n.id, "A note. Click it to read it."])),
};
