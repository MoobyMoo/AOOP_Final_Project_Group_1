# Bananaville: plan and workflow

Run like the Shorts: the lead (Claude) owns design and creative calls, builds, and checks; Moo playtests each milestone and reacts. Every milestone is captured, judged against references, and its lessons are logged before the next one starts.

## The game (current direction, 2026-11-10)
An idle-arcade business game, PC first (Steam + browser demo), mobile later. The Businessman starts with nothing, picks bananas by hand, and grows a banana stand into a banana empire that ends in a theme park visible on the horizon from minute one. Every job in the chain can be automated by a monkey worker, but the player is always the fastest monkey in the shop. Bananas are the product; customers pay in Banana Bucks. Second product: banana chips (not smoothies, to stay clear of Monkey Mart).

Decided scope: see the cut line in the lead's memory note and `research/`. Demo: about 30 minutes, stand to street, two products, every worker role, first cinematic reveal. Launch: 3 districts, about 4 businesses, shared-screen co-op, decorating. Updates: Rival Street PvP, the theme park, real online play.

## Roles
- **Lead (Claude Opus):** design, creative direction, all visual/front-end work, integration, final checks.
- **Codex Sol (Aismart):** non-UI systems on request (economy simulation, save format, balance tools, later networking).
- **Research:** Antigravity (video/Google), Grok (X), Codex (docs and math); results in `research/`.
- **Judges:** Opus + Sol on milestone captures, as with the Shorts council.
- **Moo:** playtests each milestone; plays on Mac or phone through the dev server.

## Milestones
| ID | Goal | Gate to pass |
|---|---|---|
| M0 | Feel tests (spikes v1-v3) | Moo says the loop is fun and readable |
| M1 | Vertical slice: first 10 minutes at shipping quality (art, animation, sound, numbers from the economy model) | Council beats the M0 score; Moo playtest; 60 fps on a mid laptop and a mid phone |
| M2 | Full demo (about 30 minutes, chips line, every role, first reveal, save/load) | Council + 3 outside playtesters finish it unprompted |
| M3 | Steam "coming soon" page + devlog Shorts | Marketing kill rule in `research/marketing/FINDINGS.md` |

## Every milestone
1. Rows in `CHECKLIST.md`, one change per row, each citing the research rule or playtest note behind it.
2. Build; verify in a real browser (scripted playthrough + screenshots, desktop and phone sizes).
3. Capture frames and a short video; judges score against the target frames and the research rules.
4. Moo playtests; his notes become new rows.
5. Lessons go to `LESSONS.md`. After M1 proves the pipeline, the lessons become a Bananaville skill.

## Rules that never bend
- Never copy another game's art, names, data tables, prices, or layouts. Study patterns only.
- Code-built three.js visuals; no Blender pipeline unless the lead asks Moo first.
- Same content on every platform; PC gets quality settings, no ads, and the paid version.
- Earned rarities only; no loot boxes, no pay-to-win.
