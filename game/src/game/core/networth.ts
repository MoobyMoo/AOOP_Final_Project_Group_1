// Net worth is your level (LORE.md "Progression v0.2: bananas are power"). Lifetime bananas earned from every source
// (sales, factory output, wager and gamble winnings, job pay) set your title on the island's rich list. There is no
// separate EXP. Pure data, no imports: facilities.ts and deployment.ts gate on it, core/wallet.ts keeps the count.
//
// Duckov mechanism, ported (SYSTEMS_PORT E04, EXPManager): cumulative thresholds map one number to a level (Duckov's
// curve starts level 1 at 0, level 2 at 2,000, level 3 at 5,000). Ours are bananas, not EXP, and lifetime earned
// never goes down, so a title is never lost (a gamble loss costs bananas, never rank). The thresholds come from
// npm run sim (loot/sim.ts "Net worth"): a good first hour (about ten raids plus the jobs) reaches Manager; a poor one
// reaches Associate.
export type TitleDef = { name: string; at: number; blurb: string };
export const TITLES: readonly TitleDef[] = [
  { name: "Intern", at: 0, blurb: "Fetches coffee. Owns a suit." },
  { name: "Associate", at: 600, blurb: "Has a business card. It's laminated." },
  { name: "Manager", at: 2000, blurb: "Manages things. Mostly bananas." },
  { name: "Senior Manager", at: 6000, blurb: "Manages the managers. Has a plant." },
  { name: "Director", at: 15000, blurb: "Directs. People nod." },
  { name: "VP", at: 40000, blurb: "Vice President of Being Rich." },
  { name: "CEO", at: 100000, blurb: "Answers to the board. The board is him." },
  { name: "Chairman of the Board", at: 250000, blurb: "Owns the island's rich list. And the pen." },
];
export const TITLE = { intern: 0, associate: 1, manager: 2, seniorManager: 3, director: 4, vp: 5, ceo: 6, chairman: 7 } as const;
export function titleIndex(lifetime: number): number {
  let i = 0;
  while (i + 1 < TITLES.length && lifetime >= TITLES[i + 1].at) i++;
  return i;
}
export const titleName = (i: number) => TITLES[Math.max(0, Math.min(TITLES.length - 1, i))].name;
/** the gate's player-facing reason: "Needs the title Associate (net worth 🍌 600)" */
export const titleReason = (i: number) => `Needs the title ${titleName(i)} (net worth 🍌 ${TITLES[i].at.toLocaleString("en-US")})`;
