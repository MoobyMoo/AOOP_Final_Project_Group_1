# Bananaville Tripo preparation — dry runs only

Status: blocked before artwork creation, not ready for sheet approval.
No paid mode is implemented here, even after approval.

## Reuse and safety

`run_tripo.py` imports Brainrot's runner; `preflight.py` imports its checks.
No upstream file is copied or edited. Upstream location:
`/home/moo/Workspace/Brainrot-Boss-Rush/pipeline/tripo/`.
Its method-registry check still validates the shared Brainrot implementation.
All input approvals, consistency notes, ledger and override paths point here,
not at Brainrot's approvals. Only the skill's provenance *path* is rebound;
its live gate-rule values are unchanged.

The wrapper requires `--dry-run`, refuses alternate gate roots and `--no-quad`,
blocks socket creation/connect/DNS, and replaces the upstream gate-service call
with an offline preflight. It never reads the API key or calls the paid service.
Refusals produce exit 3 and no success ledger entry. No new paid job, retry,
balance read, upload or Tripo image-generation call is permitted.

Use `--kind limbed` for this body: unlike `part`, it retains A-pose arm/leg gap
checks while still passing the parts-only rule. Gear remains separate. The
complex-body face limit is 8,000, not the runner's generic 25,000 default.
The extra local framing check requires subject height 70–85% of 2048 pixels.
The batch ceiling remains 600 credits; this body would use 100 after approval.

## Repeat the actual dry run

From the Bananaville project root:

```sh
python3 -B tools/tripo/run_tripo.py \
  --batch businessman-body-20261115 --name businessman_body \
  --front concept/tripo/businessman/inputs/businessman_body_front.png \
  --side concept/tripo/businessman/inputs/businessman_body_right.png \
  --back concept/tripo/businessman/inputs/businessman_body_back.png \
  --side-is right --kind limbed --model-version P2-20260801 \
  --face-limit 8000 --no-texture --no-pbr --model-seed 20261115 --dry-run
```

The full captured output is `dry-run.txt`. It must not be described as a pass:
the input images are absent, the consistency review is pending and approvals
are empty. Once real crops exist, upstream also refuses the missing fourth view.
Do not mirror a crop or alter the rule to hide that conflict.

## Artwork and cropping

See `../../concept/tripo/businessman/NOTES.md` for the unexecuted prompt,
reference inspection and required next steps. The example crop config is only
a starting layout; measure the actual generated sheet before using it.
Invoke Brainrot's `sheet_crops.py` directly with a local config; it writes direct
RGBA crops, a source-pixel comparison and provenance without model redraws.
Check native source subject height before cropping: its shared scale must be
at most 1.0, never upscale low-resolution art to satisfy the 2048 frame rule.

## Later production boundary

Moo's general Tripo OK on November 15 is not approval of unseen input pixels.
Only Moo adds approval and override lines. Even after those lines exist, this
wrapper stays offline; paid activation needs separate authorized integration.
Paid-account commercial evidence and a live balance check remain prerequisites
for that later integration. Raw Tripo output is a hidden sculpt reference only.
Rebuild face, tail, bowler, shades, gun and briefcase in Blender; retopologize and
test deformation before game use. P2 quads may return FBX, so do not hand FBX to
Brainrot's GLB-only postcheck reader: convert locally in Blender first. Review
the five views, geometry and by-eye postcheck before a production handoff.
