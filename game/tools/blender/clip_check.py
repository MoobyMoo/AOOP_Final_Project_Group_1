"""Clip gate for a built character .blend (blender-animation loop_check + an in-clip pop scan).

  blender -b tools/blender/build/monkey.blend --python-exit-code 1 --python tools/blender/clip_check.py -- [--loops a,b] [--clean dash] [--ground dash]
  blender -b tools/blender/build/fauna.blend ... -- --arm fauna_boar --feet _lo_ --loops boar_idle,boar_walk --ground boar_walk     (see fauna/gate.sh)

For every clip:  spikes = frames where one bone turns more than 45 degrees in a single frame and more than three times
                 as fast as on both neighbouring frames (a wrist roll or IK flip squeezed into one frame). Reported for
                 every clip; a failure only for the --clean clips (the older clips are listed, not gated).
--loops  (default: every looping clip) run loop_check: the last frame must equal the first (a pop, in deg / m per
         bone, fails). Speed changes across the seam are printed: the gaits kink at the seam by design, because a
         foot lands exactly there.
--clean  timed clips that must start and end on the same pose and ease out of / into it, so they blend against
         locomotion: loop_check pops must be zero, the first frame step must be slower than the second and the last
         slower than the one before it.
--ground clips whose feet must stay on the ground: the lowest foot-bone height over the clip (m; the walk dips to
         -0.025 because the bone tail is the toe tip, so the limit is -0.03).
--arm    the armature to check, by object name (default: the first one in the file; fauna.blend holds five).
--feet   substring that marks a foot bone for --ground (default: names starting with "foot").
Exits 1 on any failure.
"""
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.expanduser("~/.agents/skills/blender-animation/scripts"))
import loop_check  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
opt = lambda k: [x for x in argv[argv.index(k) + 1].split(",") if x] if k in argv else None   # noqa: E731
arm = bpy.data.objects[opt("--arm")[0]] if opt("--arm") else next(o for o in bpy.data.objects if o.type == "ARMATURE")
FEET = opt("--feet")[0] if opt("--feet") else None
ad = arm.animation_data
clips = {tr.name: tr.strips[0].action for tr in ad.nla_tracks}
for tr in ad.nla_tracks:
    tr.mute = True
MONKEY_LOOPS = ["idle", "walk", "run", "runBack", "strafeL", "strafeR", "cheer", "charge", "stunned", "sleep"]
loops = opt("--loops") if opt("--loops") is not None else [c for c in MONKEY_LOOPS if c in clips]
clean, ground = opt("--clean") or [], opt("--ground") or []
sc = bpy.context.scene
fail = 0


def speeds(act):
    ad.action = act
    if ad.action_slot is None:
        ad.action_slot = next(iter(ad.action_suitable_slots), None)
    f0, f1 = (int(round(v)) for v in act.frame_range)
    q, low = [], 1e9
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        q.append({pb.name: pb.matrix_basis.to_quaternion() for pb in arm.pose.bones})
        for pb in arm.pose.bones:
            if (FEET in pb.name) if FEET else pb.name.startswith("foot"):
                low = min(low, pb.head.z, pb.tail.z)
    v = [{k: math.degrees(a[k].rotation_difference(b[k]).angle) for k in a} for a, b in zip(q, q[1:])]
    v = [{k: min(x, 360 - x) for k, x in d.items()} for d in v]
    return f0, f1, v, low


for name, act in clips.items():
    f0, f1, v, low = speeds(act)
    spikes = []
    for i in range(1, len(v) - 1):
        for k, x in v[i].items():
            if x > 45 and x > 3 * max(v[i - 1][k], v[i + 1][k]):
                spikes.append((k, f0 + i, round(x, 1)))
    peak = max(max(d.values()) for d in v)
    line = f"@@ {name:18s} frames {f0}-{f1}  peak {peak:5.1f} deg/frame  spikes {spikes or 'none'}"
    bad = bool(spikes) and name in clean
    if name in loops or name in clean:
        r = loop_check.run(object=arm.name, action=act.name, frames=[f0, f1])
        line += f"  | seam pops {len(r['pops'])} hitches {len(r['hitches'])}"
        if r["pops"]:
            line += f" worst {r['pops'][0]}"
        if r["hitches"]:
            line += f" {r['hitches'][0]}"
        bad = bad or bool(r["pops"])
        if name in clean:
            tot = [sum(d.values()) for d in v]          # summed bone speed per frame step
            line += f"  | ease in {tot[0]:.0f} < {tot[1]:.0f}, ease out {tot[-1]:.0f} < {tot[-2]:.0f} (deg/frame, all bones)"
            bad = bad or tot[0] >= tot[1] or tot[-1] >= tot[-2]
    if name in ground:
        line += f"  | lowest foot {low:+.3f} m"
        bad = bad or low < -0.03
    print(line + ("   FAIL" if bad else "   ok"))
    fail += bad
ad.action = None
print(f"@@ clip gate: {len(clips) - fail}/{len(clips)} ok")
sys.exit(1 if fail else 0)
