# Fable model TODO: the factory floor and the Fence's gambling props (Wave 5a)

The economy wave (Progression v0.2) ships with code-built blockouts in `home/factory-models.ts`. Each model below
replaces one blockout. Keep the named nodes: the game shows, hides, spins and bobs them by name. Common rules match
the vault kit: origin at the footprint centre, front +z, floor at y 0, inside w × d metres, toon look, no ink outlines,
`blender-asset-qa` before handing over, GLB into `public/models/build/vault.glb` as `fac_<id>`.

| # | Asset | Footprint | Named nodes the game drives | Notes |
|---|---|---|---|---|
| 1 | Banana Ripening Room (`fac_ripen`) | 3 × 2 | `hopper`, `conveyor` (+ `roller_0..n`, spin on x/z), `output_tray` (+ `tray_slot0..5`, shown as the tray fills), `machine`, `ripening_racks`, `heat_lamp` (pulses) | Open shelving with bunches going green → yellow left to right; reads from the top-down vault camera |
| 2 | Smoothie Bottling Line (`fac_bottler`) | 4 × 2 | as #1 plus `bottle_line`, `filler_nozzle` (bobs up and down) | A row of pink smoothie bottles under a filler; a coconut in the hopper |
| 3 | Scrap Press (`fac_scrappress`) | 3 × 2 | as #1 plus `press_ram` (bobs), `press_bed` | Heavy hydraulic press beside the coin-op ammo press; brass gauges; rifle rounds in the tray |
| 4 | Counterfeit Coupon Press (`fac_coupon`) | 3 × 2 | as #1 plus `printer_roller_0..1` (spin on x), `coupon_stack`, `ink_tank` | A cartoon money printer: green ink tank, rollers, a stack of banana coupons; needs the generator (cable to it) |
| 5 | The Fence's roulette wheel (`fence_props/roulette_wheel`) | sits on the teller counter | `roulette_wheel`, `roulette_top` (spins during a red/black roll) | 37 pockets: 18 red, 18 black, 1 green; brass rim; about 0.6 m across |
| 6 | The Fence's coin (`fence_props/fence_coin`) | on the counter | `fence_coin` | Big brass coin, banana face (heads), bank face (tails); thick enough to land on its edge |
| 7 | Sealed lockboxes (4 icons + ground items) | item | none | Standard / Premium / Executive / Boardroom, tinted by tier colour (loot/tiers.ts), brass seal, a printed odds tag; icons into `public/icons/lockbox_<tier>.png` |
| 8 | New item icons | item | none | Office Paper, Ink Cartridge, Premium Bunch, Machined Parts (emoji fallbacks today) |

Audio TODO for ElevenLabs (tagged `TODO(audio)` in `home/econ-ui.ts`): coin toss and landing, the wheel's slowing
ticks, a win fanfare, a sad trombone for a loss, and a Performance Review sting. Today they borrow `throw`, `tick`,
`stingExtract`, `stingBonk` and `stingRare`.
