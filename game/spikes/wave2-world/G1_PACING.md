# G1 pacing: real-game bot runs

Local run date: 2026-11-15 (Asia/Taipei). 18 completed raids, three fresh-save campaigns, bot seeds 1/2/3, greed 0.3/0.5/0.8, 250 ms simulated reaction lag throughout. These are real rendered production-build raids, not the loot simulator. Build and source identities are recorded in the accompanying JSON.

## Gates

| Gate | Result | Measurement |
| --- | --- | --- |
| Demo human-estimated raid length 3–6 min | FAIL | 0/18 in range; 0.63–2.34 min; mean 1.26 min |
| Briefcase ≥30% of all kills | FAIL | 1/58 = 1.7% |
| <20% of raids end with zero ammo | FAIL | 9/18 = 50.0%; loaded + reserve |
| Every raid yields a useful find | FAIL | 16/18 raids rolled ≥1 useful item; minimum 0 |
| Low-greed avoids the boss | PASS | 0/4 engaged |
| Boss-engaging high-greed bonk rate at least 40% | PASS | 10/10 engaged raids; all high-greed bonks 10/10 |
| Zero softlocks | PASS | 0/18; longest raid 105.63 s <900 s |

The length gate applies to every completed raid, including bonk-outs. Human estimates are raid simulation time ×1.33, not wall-clock duration. The useful-find gate follows the shipped `isUseful` / `LootContext.usefulFound` definition: a useful item was generated, not necessarily collected or brought home. This is not evidence of a delivery guarantee. These small samples do not establish population rates. Post-processing was off as requested; FPS, asset quality, council scores and human feel were not evaluated.

## Per-raid measurements

Kills are pistol / briefcase / environment. HP lost sums observed raw-HP decreases at fixed ticks; `log.hurt` also retains the game's incoming damage counter (which can include lethal overkill). Value extracted means retained item value plus raft bonus; on bonk-outs this is the safe-pouch value, not the lost pack. Upgrade purchases happen after the listed raid, before the next deployment; numbers in parentheses are prices.

| Greed / bot seed / raid | Exit | Bot s | Human min | Crates | Kills P / B / E | Rounds | HP lost | Value extracted | End ammo | Useful rolled | Upgrades bought |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 0.3 / 1 / 1 | hatch | 79.70 | 1.77 | 6 | 2 / 0 / 0 | 5 | 0 | 112 | 43 | 10 | — |
| 0.3 / 1 / 2 | hatch | 66.10 | 1.47 | 6 | 3 / 0 / 0 | 7 | 0 | 194 | 36 | 4 | mag 1 (160) |
| 0.3 / 1 / 3 | hatch | 71.20 | 1.58 | 5 | 4 / 0 / 0 | 12 | 0 | 277 | 48 | 8 | pack 1 (260) |
| 0.3 / 1 / 4 | hatch | 62.28 | 1.38 | 6 | 4 / 0 / 0 | 10 | 0 | 170 | 54 | 7 | — |
| 0.5 / 2 / 1 | hatch | 86.03 | 1.91 | 8 | 4 / 0 / 0 | 12 | 12 | 162 | 12 | 6 | mag 1 (160) |
| 0.5 / 2 / 2 | boat | 104.17 | 2.31 | 8 | 7 / 0 / 0 | 19 | 0 | 151 | 45 | 7 | — |
| 0.5 / 2 / 3 | hatch | 90.97 | 2.02 | 8 | 8 / 0 / 0 | 22 | 0 | 135 | 71 | 9 | pack 1 (260) |
| 0.5 / 2 / 4 | boat | 105.63 | 2.34 | 7 | 6 / 0 / 0 | 17 | 7 | 274 | 70 | 11 | — |
| 0.8 / 3 / 1 | bonked | 44.50 | 0.99 | 1 | 1 / 0 / 0 | 24 | 100 | 40 | 0 | 1 | — |
| 0.8 / 3 / 2 | bonked | 28.40 | 0.63 | 1 | 1 / 0 / 0 | 18 | 100 | 40 | 6 | 1 | — |
| 0.8 / 3 / 3 | bonked | 33.18 | 0.74 | 1 | 3 / 0 / 0 | 24 | 100 | 23 | 0 | 0 | — |
| 0.8 / 3 / 4 | bonked | 32.82 | 0.73 | 1 | 3 / 0 / 0 | 40 | 100 | 0 | 0 | 2 | — |
| 0.8 / 3 / 5 | bonked | 34.38 | 0.76 | 1 | 1 / 0 / 0 | 24 | 100 | 0 | 0 | 2 | — |
| 0.8 / 3 / 6 | bonked | 33.18 | 0.74 | 1 | 2 / 1 / 0 | 24 | 100 | 40 | 0 | 1 | — |
| 0.8 / 3 / 7 | bonked | 38.25 | 0.85 | 1 | 1 / 0 / 0 | 24 | 124 | 6 | 0 | 2 | — |
| 0.8 / 3 / 8 | bonked | 40.28 | 0.89 | 1 | 2 / 0 / 0 | 24 | 100 | 40 | 0 | 0 | mag 1 (160) |
| 0.8 / 3 / 9 | bonked | 35.82 | 0.79 | 1 | 3 / 0 / 0 | 24 | 100 | 20 | 0 | 2 | — |
| 0.8 / 3 / 10 | bonked | 33.45 | 0.74 | 1 | 2 / 0 / 0 | 24 | 100 | 40 | 0 | 1 | — |

| Greed | Bot seed | Raids | Mean human min | Bonked | Zero ammo |
| --- | --- | ---: | ---: | ---: | ---: |
| 0.3 | 1 | 4 | 1.55 | 0 | 0 |
| 0.5 | 2 | 4 | 2.14 | 0 | 0 |
| 0.8 | 3 | 10 | 0.79 | 10 | 9 |

## Systems tuning and interpretation

This run includes the Plantation boss and typed pools on the existing map-v3 sockets. The wave-2 demo boundaries, new container props, search screen and cove exit are not part of this worker. Bot crate quotas remain 6/8/10. Bots avoid the boss below greed 0.75 and deliberately approach it above that threshold. The bot shoots rather than trying to path into melee through a camp fence. No minimum duration or idle wait was added.

The updated demo target is 3–6 human-estimated minutes, using the unchanged ×1.33 estimator. Bonk-outs count too. The old world can still send bots north, so this matrix is a regression check, not proof of the final slice's timing. The isolated boss matrix separately tests unprepared and prepared encounter outcomes.

Tunnel extraction coverage: 0/18. Shared contracts.ts remains unchanged. The lead should widen BotView.exits to hatch | raft | tunnel, expose open state, and adopt the optional portal/gate/safePath observations from BotObservation.

See research/economy/G1_5_SYSTEMS.md for API details, the economy comparison and integration boundaries. Completing a campaign does not imply the numeric gates pass.

## Reproduction and evidence

Build with npx vite build --outDir /tmp/bv-systems-dist and serve it on 5347. Set BASE=http://127.0.0.1:5347 BOT_DIST=/tmp/bv-systems-dist BOT_OUT=<evidence-directory>, then run node tools/botrun.mjs --matrix and --report. Use --boss-matrix with a separate output directory for live arena fixtures. Campaigns use isolated browser contexts, fresh saves, Chromium at /usr/bin/chromium, ts=4, post=0, dpr=1 and fixdpr=1. The runner rejects ports 5318 and 5340.

The runner samples every 100 ms wall time. It aborts on no movement beyond 0.5 u for 20 simulated raid seconds outside extraction, or a raid above 900 s. It checks authoritative shot, kill and outcome events against game logs, rejects inferred outcomes and requires another deployment after each final result. Diagnostic runs are excluded from this aggregate. Bot seeds differ from actual world seeds; both are retained in raw evidence.

Raw evidence: `g0.3-s1.json`, `g0.5-s2.json`, `g0.8-s3.json`; aggregate G1_PACING.json. Build entry: game-B7VKXvdz.js; SHA-256: 93c17cc001876e327f188a159b27bbe1fb0f3f0fffcaffb63da511e00a8a3e2f. The JSON records source hashes.
