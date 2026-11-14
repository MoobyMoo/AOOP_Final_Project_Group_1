#!/usr/bin/env bash
# Side-by-side sheet, Duckov frame (left) vs our capture (right), two rows:
#   tools/blender/build/compare_house.sh <tag>      -> spikes/house/compare_<tag>_vs_duckov.png
set -euo pipefail
cd "$(dirname "$0")/../../.."
T="${1:?tag}"; R=research/look/refs; O=spikes/house
montage "$R/ref_291.jpg" "$O/${T}_plantation_faded.png" "$R/ref_565.jpg" "$O/${T}_colony.png" "$R/ref_652.jpg" "$O/${T}_landing.png" -tile 2x3 -geometry 1000x562+4+4 -background "#1d1a22" "$O/compare_${T}_vs_duckov.png"
echo "$O/compare_${T}_vs_duckov.png"
