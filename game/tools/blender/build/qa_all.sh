#!/usr/bin/env bash
# QA gate over every built group (run build_all.sh first). Exits 1 if any asset fails.
cd "$(dirname "$0")/../../.."
BLENDER="${BLENDER:-/home/moo/.local/bin/blender}"
GROUPS_=("$@"); [ ${#GROUPS_[@]} -eq 0 ] && GROUPS_=(loot camp walls ruins landmarks traversal bunker containers projectiles)
for g in "${GROUPS_[@]}"; do "$BLENDER" -b "tools/blender/build/blend/$g.blend" --python tools/blender/build/qa.py > "/tmp/bv_build/qa_$g.log" 2>&1 & done
wait
grep -h "^\[qa\]" /tmp/bv_build/qa_*.log
! grep -q "^\[qa\] FAIL" /tmp/bv_build/qa_*.log
