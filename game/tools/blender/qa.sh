#!/usr/bin/env bash
# Asset QA gate (blender-asset-qa qa_check.py) for every character asset. Run the build scripts first.
# UV checks are off on purpose: the UV channel carries region id + AO, not a texture layout.
set -euo pipefail
cd "$(dirname "$0")/../.."
BL=${BLENDER:-/home/moo/.local/bin/blender}
QA=${QA_DIR:-$HOME/.agents/skills/blender-asset-qa/scripts}
run() { # blend, label, objects...
  local blend=$1 label=$2; shift 2
  "$BL" -b "tools/blender/build/$blend.blend" -P "$QA/qa_check.py" -- --objects "$@" --profile game --no-uv 2>&1 | grep "@@JSON@@" | python3 -c "
import sys, json
d = json.loads(sys.stdin.read().split('@@JSON@@')[-1])
tris = sum(o.get('tris', 0) for o in d.get('objects', {}).values())
print('%-28s %s  tris=%d  errors=%s  warnings=%s' % ('$label', 'PASS' if d.get('pass') else 'FAIL', tris, json.dumps(d.get('errors')), json.dumps(d.get('warnings'))))
sys.exit(0 if d.get('pass') else 1)" || FAIL=1
}
FAIL=0
H="p_head p_hands p_tail"
run monkey "monkey: businessman" $H p_ears_round p_eyes_round p_lids_round p_brows_bold p_mouth_smile p_torso_suit p_front_two p_tie_tie p_feet_round
run monkey "monkey: double-breasted" $H p_ears_pointy p_eyes_sleepy p_lids_sleepy p_brows_thin p_mouth_grin p_torso_suit p_front_double p_tie_bowtie p_square p_feet_shoes
run monkey "monkey: vest" $H p_ears_floppy p_eyes_sparkle p_lids_sparkle p_brows_bushy p_mouth_toothy p_torso_vest p_front_vest p_tie_tie p_feet_shoes
run monkey "monkey: open jacket" $H p_ears_round p_eyes_round p_lids_round p_brows_bold p_mouth_smirk p_torso_suit p_front_open p_tie_tie p_square p_feet_round
run monkey "monkey: wild" $H p_ears_round p_eyes_beady p_lids_beady p_brows_bushy p_mouth_whistle p_torso_fur p_feet_round p_tuft
run monkey "monkey: bandit" $H p_ears_round p_eyes_round p_lids_round p_brows_bold p_mouth_smirk p_torso_tee p_feet_round
run gorilla "gorilla: brute" p_body p_face
run gorilla "gorilla: sleeper" p_body p_face p_vest p_sleepmask p_chain
for w in bowler tophat fedora cap hardhat pith beanie crown shades aviators monocle eyepatch goggles heartglasses banditmask satchel bigpack cratepack prop_briefcase prop_boomerang prop_sack prop_bandana; do
  run wearables "wearable: $w" "$w"
done
exit $FAIL
