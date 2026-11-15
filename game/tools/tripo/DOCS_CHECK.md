---
checked: 2026-11-15
checked_by: Codex; live official pages read with web.run; Asia/Taipei date
max_age_days: 14
docs_urls: https://developers.tripo3d.ai/en/docs/models-and-versions https://developers.tripo3d.ai/en/docs/generation-multiview-to-model/p https://developers.tripo3d.ai/en/docs/migration-v2-to-v3 https://developers.tripo3d.ai/en/docs/files https://developers.tripo3d.ai/en/docs/task-query https://developers.tripo3d.ai/en/docs/account https://developers.tripo3d.ai/en/docs/billing
top_model_version: P2-20260801
allowed_model_versions: P2-20260801
refused_model_prefixes: P1 v2.5 v3.0
required_geometry_quality: detailed
allowed_texture_quality: detailed extreme
required_pbr: false
face_limit: 8000
slot_order: front left back right
side_semantics: character
slot_for_character_right: right
slot_for_character_left: left
price_multiview_v31: none=20 standard=30 detailed=40 extreme=50 geometry_detailed=+20
price_image_v31: none=20 standard=30 detailed=40 extreme=50 geometry_detailed=+20
price_p_series: 120
price_p2_untextured: 100
batch_cap: 600
---
# Tripo docs check — Bananaville body preparation

All seven URLs above were re-read on November 15, 2026, not merely inherited
from Brainrot's November 1 check. The v3.1 price fields are compatibility keys
required by the shared parser, inherited from Brainrot; v3.1 is not allowed here.
`price_p_series` is the shared parser's detailed-texture price; its no-texture
branch uses 100. This wrapper requires texture off.

## Sources driving the settings

- Models and Versions lists P2 for game characters, props and real-time pipelines,
  with up to 25,000 quads. Moo's recipe narrows this complex body to 8,000 quads.
- P-series multiview uses `model`, not `model_version`, and view-key input objects
  canonicalized as front, left, back, right. Front plus at least one other view
  is accepted by the API. Character-right belongs in `right`, not positional slot 1.
  Omit texture-only orientation/alignment fields when texture is false.
- Migration documents the v3 base and dedicated generation endpoints. No endpoint
  is called by this preparation wrapper.
- Files documents upload tokens; Account documents numeric available and frozen
  balances. Neither upload nor balance is called in this dry-only track.
- Task Query documents task status, output and numeric `credits_consumed`.
  Billing documents credit reservation at creation and release on failure/cancel.
- Additional source: `https://developers.tripo3d.ai/en/docs/changelog`, P2 entry:
  100 credits without texture, 110/120/130 with standard/detailed/extreme texture.
  Quads have no P2 surcharge in that schedule. This drives the 100-credit estimate.
  Billing's announced USD console display starts December 1, 2026, which is still
  in the future at this check. API credit fields remain credits.

## Local policy is stricter than the API

Brainrot `preflight.py` currently refuses three-view multiview inputs under
`g / views match`: it unconditionally demands a left view. The API allows omitted
non-front views, but that does not authorize weakening Moo's local gate.
The wrapper preserves the refusal. Moo must choose a fourth reviewed view or
write a narrow override himself; agents must not add it.

## Commercial licence gate

Also re-read `https://developers.tripo3d.ai/en/terms` (page dated July 11, 2025),
sections 5.2.1 and 5.2.2. The paid-user and free-user rights differ. Per the skill,
retain paid API top-up evidence before commercial use; unpaid trial credits are
not accepted as commercial clearance. Account paid status and receipts were NOT
verified here. No credential file was opened. Moo's original character is the
input IP; the Duckov reference supplies finish quality only, not copied designs.
