# G1 pacing: real-game bot runs

Local run date: 2026-11-15 (Asia/Taipei). 18 completed raids, three fresh-save campaigns, bot seeds 1/2/3, greed 0.3/0.5/0.8, 250 ms simulated reaction lag throughout. These are real rendered production-build raids, not the loot simulator. Build and source identities are recorded in the accompanying JSON.

## Gates

| Gate | Result | Measurement |
| --- | --- | --- |
| Human-estimated raid length 4–8 min | FAIL | 0/18 in range; 1.63–3.97 min; mean 2.78 min |
| Briefcase ≥30% of all kills | PASS | 104/169 = 61.5% |
| <20% of raids end with zero ammo | FAIL | 5/18 = 27.8%; loaded + reserve |
| Every raid yields a useful find | PASS | 18/18 raids rolled ≥1 useful item; minimum 1 |
| 10–30% bonk-out at greed 0.8 / 250 ms lag | FAIL | 0/10 = 0.0% |
| Zero softlocks | PASS | 0/18; longest raid 179.30 s <900 s |

The length gate applies to every completed raid, including bonk-outs. Human estimates are raid simulation time ×1.33, not wall-clock duration. The useful-find gate follows the shipped `isUseful` / `LootContext.usefulFound` definition: a useful item was generated, not necessarily collected or brought home. This is not evidence of a delivery guarantee. These small samples do not establish population rates. Post-processing was off as requested; FPS, asset quality, council scores and human feel were not evaluated.

## Per-raid measurements

Kills are pistol / briefcase / environment. HP lost sums observed raw-HP decreases at fixed ticks; `log.hurt` also retains the game's incoming damage counter (which can include lethal overkill). Value extracted means retained item value plus raft bonus; on bonk-outs this is the safe-pouch value, not the lost pack. Upgrade purchases happen after the listed raid, before the next deployment; numbers in parentheses are prices.

| Greed / bot seed / raid | Exit | Bot s | Human min | Crates | Kills P / B / E | Rounds | HP lost | Value extracted | End ammo | Useful rolled | Upgrades bought |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 0.3 / 1 / 1 | hatch | 112.77 | 2.50 | 6 | 4 / 3 / 0 | 8 | 0 | 104 | 24 | 4 | — |
| 0.3 / 1 / 2 | hatch | 100.25 | 2.22 | 4 | 1 / 6 / 0 | 2 | 12 | 311 | 38 | 4 | mag 1 (240) |
| 0.3 / 1 / 3 | hatch | 73.38 | 1.63 | 4 | 4 / 1 / 0 | 17 | 0 | 147 | 21 | 2 | — |
| 0.3 / 1 / 4 | hatch | 85.75 | 1.90 | 4 | 2 / 4 / 0 | 13 | 0 | 129 | 8 | 1 | — |
| 0.5 / 2 / 1 | raft | 134.27 | 2.98 | 6 | 3 / 10 / 0 | 15 | 8 | 196 | 17 | 9 | — |
| 0.5 / 2 / 2 | hatch | 101.42 | 2.25 | 5 | 3 / 3 / 0 | 6 | 0 | 306 | 19 | 6 | mag 1 (240) |
| 0.5 / 2 / 3 | hatch | 91.17 | 2.02 | 4 | 2 / 4 / 0 | 14 | 8 | 188 | 13 | 3 | — |
| 0.5 / 2 / 4 | hatch | 133.63 | 2.96 | 7 | 4 / 3 / 0 | 8 | 0 | 252 | 32 | 7 | — |
| 0.8 / 3 / 1 | raft | 137.07 | 3.04 | 6 | 8 / 6 / 0 | 38 | 10 | 169 | 10 | 2 | — |
| 0.8 / 3 / 2 | raft | 128.17 | 2.84 | 5 | 6 / 7 / 0 | 30 | 10 | 241 | 2 | 3 | mag 1 (240) |
| 0.8 / 3 / 3 | raft | 127.78 | 2.83 | 4 | 2 / 8 / 0 | 16 | 12 | 181 | 0 | 1 | — |
| 0.8 / 3 / 4 | raft | 122.32 | 2.71 | 7 | 3 / 6 / 0 | 15 | 0 | 306 | 17 | 6 | — |
| 0.8 / 3 / 5 | raft | 141.32 | 3.13 | 7 | 4 / 7 / 0 | 25 | 7 | 559 | 0 | 8 | pack 1 (720) |
| 0.8 / 3 / 6 | raft | 179.30 | 3.97 | 9 | 3 / 10 / 0 | 24 | 0 | 631 | 0 | 6 | heart 1 (1050) |
| 0.8 / 3 / 7 | raft | 159.90 | 3.54 | 8 | 4 / 6 / 0 | 24 | 0 | 407 | 0 | 10 | — |
| 0.8 / 3 / 8 | raft | 133.95 | 2.97 | 7 | 3 / 6 / 0 | 15 | 7 | 606 | 9 | 6 | — |
| 0.8 / 3 / 9 | raft | 163.58 | 3.63 | 8 | 6 / 5 / 0 | 31 | 14 | 498 | 9 | 8 | — |
| 0.8 / 3 / 10 | raft | 134.58 | 2.98 | 7 | 3 / 9 / 0 | 24 | 16 | 497 | 0 | 6 | — |

| Greed | Bot seed | Raids | Mean human min | Bonked | Zero ammo |
| --- | --- | ---: | ---: | ---: | ---: |
| 0.3 | 1 | 4 | 2.06 | 0 | 0 |
| 0.5 | 2 | 4 | 2.55 | 0 | 0 |
| 0.8 | 3 | 10 | 3.17 | 0 | 5 |

## What changed and why

- Combat events originate in `shoot` / `knockOut`; finish outcomes originate in `raid.finish`. Serial numbers deduplicate combat events and the raid ID remains stable across the result transition. The runner checks shot and kill totals against each game's own per-raid log, requires exactly one non-inferred outcome, and rejects inferred events.
- The adapter latches deployment until the asynchronous fade changes scenes. Previously every bunker simulation tick scheduled another deployment; the reset enemy arrays appeared as a burst of inferred kills. The actual creator has its own bot-aware completion callback. Summary panels are closed using normal Intent interaction; sale, cheapest affordable upgrade, and deployment use the existing home API.
- A crate is searched from 1.9 u and an A* endpoint can sit about 1.5 u from its centre. Arrival now uses 1.8 u, while pickup arrival uses 0.8 u for the game's 1.1 u collection radius. Pickup goals track their coordinates and use the existing scatter destination rather than the temporarily blocked crate centre. An unarmed exit gets a departure-and-return route. Searches and extraction countdowns are exempt from the bot's short recovery watchdog, not from the runner's 20-second non-extraction check.
- HP/maxHP, healing-in-progress, upgrades and authoritative outcomes are exposed without converting HP into fictional hearts. Compatibility hearts remain available. A non-stunned Sleeper is not shot; a quiet policy that declines firing returns to navigation rather than waiting forever.

## Top five game issues and recommended tuning

1. **The measured loop is too short.** The observed human-estimated range is 1.63–3.97 min, versus 4–8 min. Nearby crates can satisfy the bot's pack/greed policy before deeper map rewards matter. Recommend moving worthwhile objectives and rewards farther into route choices, then validating with human runs. Do not add idle waits or multiply movement times just to pass the bot gate.
2. **High greed does not produce the requested risk.** At greed 0.8 and 250 ms lag, 0/10 raids ended bonked. The bot repeatedly reaches the raft without needing to defeat the Sleeper or stay in a contested extraction ring. Recommend testing encounters on rewarding routes and extraction approaches; do not raise all enemy damage based on one small sample.
3. **The useful-find guarantee has an eligibility gap.** 18/18 raids rolled a useful item. Every sampled raid passed the shipped roll condition. `rollCrate` only forces useful loot after the third crate. Recommend guaranteeing a useful item on the first eligible loot opportunity, or stating the three-crate condition honestly. Also validate scatter positions and track collection: `usefulFound` counts generated items, not acquired ones, and scattering currently ignores collision.
4. **Persistent collision state accumulates across raids.** `grid.block` appends blockers and marks PROP cells; `startRaid` rebuilds props and crates but does not restore either collection. Old crate sockets can remain solid when the next raid chooses different sockets. Recommend a static baseline plus a resettable per-raid collision layer. Left unchanged because grid/props are outside this task's edit scope.
5. **The seed query is not a world seed.** The three requested bot seeds are exercised, but `startRaid` derives world seeds from `save.raids * 7919 + 13` regardless of the query. AI also uses `Math.random` for timers, so identical URLs are not deterministic replays. Recommend separate explicit bot/world seeds and routing simulation randomness through the raid RNG. Raw reports retain actual world seeds; do not treat these as three independent seeded maps per greed.

Contract problem: `BotView` describes hearts but the game uses 100 HP (+25 per health upgrade), and its exit union excludes the real tunnel. The local observation extension carries HP and tunnel outcomes, but tunnel navigation remains untested/excluded by the adapter. The shared contract needs a central update followed by an underground/tunnel scenario; it is unchanged here as requested.

Risk tuning: the greed-0.8/250-ms sample is 0/10 bonk-outs (0.0%), outside the target band. If this persists with larger samples, tune contested extraction approaches and route incentives before changing enemy damage. Ammo tuning: 5/18 finish empty; adjust ammo availability only after the collision and pickup-delivery issues are addressed. Melee share is 61.5%; preserve close-range bandit counterplay rather than forcing the bot to waste ammunition or melee invulnerable targets.

## Reproduction and evidence

`npx tsc --noEmit -p .` and `node tools/botrun.mjs --self-test` validate types and the bot regressions. Build: `npx vite build --outDir /tmp/bv-sol-dist --emptyOutDir`. Serve separately: `npx vite preview --outDir /tmp/bv-sol-dist --port 5330 --strictPort --host 127.0.0.1`. Run `node tools/botrun.mjs --matrix` (4 low, 4 medium, 10 high), then `node tools/botrun.mjs --report`. Campaigns use isolated browser contexts, fresh saves, Chromium at `/usr/bin/chromium`, the requested GPU flags, `ts=4`, `post=0`, `dpr=1`, `fixdpr=1`. Port 5318 was never used.

The runner samples every 100 ms wall time, retaining roughly one trace point per simulated second. A softlock is no movement exceeding 0.5 u for 20 simulated raid seconds while not counting down extraction, or a raid exceeding 900 s. Detection aborts the campaign and writes its failure context. All accepted campaigns have zero page errors and zero softlocks, traverse creator/bunker/raid/result/bunker, and start another raid after the final result so its home purchases are recorded. Diagnostic pre-fix runs under `diagnostic/` are excluded from every gate.

Raw evidence: `g0.3-s1.json`, `g0.5-s2.json`, `g0.8-s3.json`; machine-readable aggregate: `G1_PACING.json`. Build entry: `game-IlIz7cad.js`; SHA-256: `20340f17ab28b38695b3598f6c2e51ffbe5bda0581138967cf53d721b0fe5665`. The aggregate also records source hashes. Implementation choices are grounded in the shipped interaction distances, collision/path implementation, actual HP constants and home API, rather than outdated brief numbers.

Validation: TypeScript passes; all seven bot regression checks pass; rebuilding after the final type-only correction produces the identical game bundle SHA-256 used by these runs. Home file audit reports four pre-existing entries: `/home/moo/0f840a8ea5fae3927f1d1022d7b10fcd0e677cde4bf3681a5fa5d4218c333b86.png`, `/home/moo/nltk_data`, `/home/moo/shorts-pilot`, and `/home/moo/tiny-apps`. None was created or moved by this task.
