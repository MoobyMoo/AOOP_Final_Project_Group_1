#!/usr/bin/env bash
# Fauna gates (run build_fauna.py first): the asset QA gate on every animal, the clip gate on every clip, and the
# fauna clip contracts (chain_check.py). Exits 1 if anything fails.
set -uo pipefail
cd "$(dirname "$0")/../../.."
BL=${BLENDER:-/home/moo/.local/bin/blender}
QA=${QA_DIR:-$HOME/.agents/skills/blender-asset-qa/scripts}
F=tools/blender/build/fauna.blend
FAIL=0
for a in crab parrot frog boar croc; do          # --tol: kitbashed blobs meet by overlap; UV checks off: colour ships in COLOR_0
  "$BL" -b "$F" -P "$QA/qa_check.py" -- --objects "${a}_mesh" --profile game --no-uv --tol 0.01 2>&1 | grep "@@JSON@@" | python3 -c "
import sys, json
d = json.loads(sys.stdin.read().split('@@JSON@@')[-1])
tris = sum(o.get('tris', 0) for o in d.get('objects', {}).values())
print('%-14s %s  tris=%d  errors=%s  warnings=%s' % ('fauna: $a', 'PASS' if d.get('pass') else 'FAIL', tris, json.dumps(d.get('errors')), json.dumps(d.get('warnings'))))
sys.exit(0 if d.get('pass') else 1)" || FAIL=1
done
clip() { "$BL" -b "$F" --python-exit-code 1 --python tools/blender/clip_check.py -- --arm "fauna_$1" "${@:2}" 2>&1 | grep "^@@" ; [ "${PIPESTATUS[0]}" -eq 0 ] || FAIL=1; }
clip crab --loops crab_idle,crab_scuttle,crab_flee
clip parrot --loops parrot_perch_idle,parrot_fly
clip frog --loops frog_idle --clean frog_hop
clip boar --feet _lo_ --loops boar_idle,boar_walk,boar_run,boar_charge_windup,boar_charge --clean boar_hit --ground boar_idle,boar_walk,boar_run,boar_charge_windup,boar_charge,boar_hit
clip croc --loops croc_lurk,croc_swim --clean croc_bite
"$BL" -b "$F" --python-exit-code 1 --python tools/blender/fauna/chain_check.py 2>&1 | grep "^@@"; [ "${PIPESTATUS[0]}" -eq 0 ] || FAIL=1
exit $FAIL
