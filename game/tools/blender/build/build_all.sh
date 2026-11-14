#!/usr/bin/env bash
# Rebuild every group (in parallel), merge the manifests, optionally render the Blender review sheets.
#   tools/blender/build/build_all.sh [--render] [group ...]
set -euo pipefail
cd "$(dirname "$0")/../../.."
BLENDER="${BLENDER:-/home/moo/.local/bin/blender}"
RENDER=""; GROUPS_=()
for a in "$@"; do if [ "$a" = "--render" ]; then RENDER="--render"; else GROUPS_+=("$a"); fi; done
[ ${#GROUPS_[@]} -eq 0 ] && GROUPS_=(loot camp walls ruins landmarks traversal bunker)
mkdir -p /tmp/bv_build
pids=()
for g in "${GROUPS_[@]}"; do
  "$BLENDER" -b --factory-startup --python-exit-code 1 --python tools/blender/build/build.py -- --group "$g" $RENDER > "/tmp/bv_build/$g.log" 2>&1 &
  pids+=($!)
done
fail=0
for i in "${!pids[@]}"; do if ! wait "${pids[$i]}"; then echo "FAILED: ${GROUPS_[$i]}"; grep -v "INFO" "/tmp/bv_build/${GROUPS_[$i]}.log" | tail -15; fail=1; fi; done
[ $fail -eq 0 ] || exit 1
grep -h "^\[build\] " /tmp/bv_build/*.log | grep -v baked
python3 tools/blender/build/merge_manifest.py
