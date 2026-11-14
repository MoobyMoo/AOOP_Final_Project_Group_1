#!/usr/bin/env bash
# Capture the review views at the gameplay camera: tools/blender/build/capture.sh <tag> [base-url]
# (needs the dev server: npx vite --port 5342 --strictPort)
set -euo pipefail
cd "$(dirname "$0")/../../.."
TAG="${1:?tag}"; B="${2:-http://localhost:5342}/build.html"
O="spikes/build"
shot() { node tools/shot.mjs "$B?$2" "$O/${TAG}_$1.png" 3200 2>&1 | grep -i "^ERRORS" | grep -v "404" || true; }
shot camp "view=camp" & shot camp_open "view=camp&open=1&broken=1" & shot ruin "view=ruin" & shot ruin_open "view=ruin&open=1&broken=1" &
wait
shot ferry "view=landmarks&which=ferry&fx=0.5" & shot bomber "view=landmarks&which=bomber" & shot vat "view=landmarks&which=vat&fx=-1&fz=1" & shot tractor "view=landmarks&which=tractor&dist=22" &
wait
shot falls "view=landmarks&which=falls&fz=-1" & shot landmarks "view=landmarks" & shot traversal "view=traversal" & shot bunker "view=bunker" &
wait
shot bunker_fx "view=bunker&fx=1" & shot bunker_wide "view=bunker&fx=1&dist=38" & shot lineup_loot "view=lineup&group=loot&dist=24&cols=6&rows=2&cell=3.2" & shot lineup_loot_open "view=lineup&group=loot&dist=24&cols=6&rows=2&cell=3.2&open=1" &
wait
shot lineup_camp "view=lineup&group=camp&cols=6&rows=3&cell=5" & shot lineup_walls "view=lineup&group=walls&cols=6&rows=3&cell=4.2&dist=36" & shot lineup_ruins "view=lineup&group=ruins&cols=5&rows=3&cell=6&dist=46" & shot lineup_traversal "view=lineup&group=traversal&cols=5&rows=3&cell=7&dist=52&nofog=1" &
wait
echo "captured $TAG"
