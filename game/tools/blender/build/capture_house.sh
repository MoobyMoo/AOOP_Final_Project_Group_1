#!/usr/bin/env bash
# Capture the house kit review views at the gameplay camera: tools/blender/build/capture_house.sh <tag> [base-url]
# (needs the dev server: npx vite --port 5343 --strictPort)
set -euo pipefail
cd "$(dirname "$0")/../../.."
TAG="${1:?tag}"; B="${2:-http://localhost:5343}/house.html"
O="spikes/house"; mkdir -p "$O"
shot() { node tools/shot.mjs "$B?$2" "$O/${TAG}_$1.png" 3200 2>&1 | grep -i "^ERRORS" | grep -v "404" || true; }
IDS="guard_hut cellblock farmhouse barn boathouse radio_shack"
for id in $IDS; do shot "${id}_on" "view=prefab&id=$id" & done; wait
for id in $IDS; do shot "${id}_faded" "view=prefab&id=$id&roof=0" & done; wait
for id in $IDS; do shot "${id}_open" "view=prefab&id=$id&roof=0&open=1&broken=1" & done; wait
for id in $IDS; do shot "${id}_col" "view=prefab&id=$id&roof=0&open=1&col=1&nomonkey=1" & done; wait
for id in $IDS; do shot "${id}_states" "view=states&id=$id" & done; wait
shot plantation "view=plantation" & shot plantation_faded "view=plantation&fade=smart&open=1" & shot colony "view=colony" & shot colony_faded "view=colony&fade=smart&open=1" & shot landing "view=landing" & shot landing_faded "view=landing&fade=smart&open=1" &
wait
shot all "view=all" & shot modules_walls "view=modules&group=wall&cols=7&rows=4&cell=3.6&dist=46" & shot modules_walls_cut "view=modules&group=wall&cols=7&rows=4&cell=3.6&dist=46&roof=0&open=1&col=1" &
shot modules_roofs "view=modules&names=roof_thatch_hip,roof_thatch,roof_thatch_end,roof_tin,roof_tin_end,roof_plank,roof_plank_end,roof_tin_gambrel,roof_tin_shed,porch,steps,floor_plank,floor_stone,floor_dirt,cell_bars,cell_door,corner_plank,corner_stone&cols=6&rows=3&cell=8&dist=62" &
shot modules_props "view=modules&names=bunk,cot_iron,cot,table,table_cards,chair,stool,shelf,shelf_files,stove,desk,cabinet,cabinet_open,crate_stack,barrel,drum,sacks,haybale,haystack,radio,generator,bench,workbench,stall,trough,boat,net_rack,buoys,rope_coil,noticeboard,key_rack,lantern,plant,firewood,mooring,ladder,wheel,bucket&cols=8&rows=5&cell=3.4&dist=44" &
wait
echo "captured $TAG"
