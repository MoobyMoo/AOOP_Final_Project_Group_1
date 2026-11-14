#!/usr/bin/env bash
# House kit: rebuild both groups, run the QA gate on them, merge the manifest.
#   tools/blender/build/house_all.sh [--render]      HOUSE_STAT=1 prints the triangle split per prefab
set -uo pipefail
cd "$(dirname "$0")/../../.."
BLENDER="${BLENDER:-/home/moo/.local/bin/blender}"
mkdir -p /tmp/bv_house
rm -f /tmp/bv_house/*.log
for g in house prefab; do
  "$BLENDER" -b --factory-startup --python-exit-code 1 --python tools/blender/build/build.py -- --group "$g" "$@" > "/tmp/bv_house/$g.log" 2>&1 &
done
wait
grep -h "Traceback\|Error\|^  File\|AssertionError\|\[check\]" /tmp/bv_house/*.log | sort | uniq -c | head -20
grep -h "^\[stat\]\|^        props" /tmp/bv_house/prefab.log
grep -h "^\[build\] " /tmp/bv_house/*.log | grep -v baked
for g in house prefab; do "$BLENDER" -b "tools/blender/build/blend/$g.blend" --python tools/blender/build/qa.py > "/tmp/bv_house/qa_$g.log" 2>&1 & done
wait
grep -h "^\[qa\]" /tmp/bv_house/qa_*.log
python3 tools/blender/build/merge_manifest.py
! grep -q "^\[qa\] FAIL" /tmp/bv_house/qa_*.log
