"""Composite the raw icon passes into public/icons and build the review contact sheets.

  python3 tools/items/compose.py [--only id,id] [--no-icons]

Reads spikes/items/raw/<id>_obj.png + <id>_shadow.png (from render.py) and spikes/items/stats.json.
Writes public/icons/<id>.png (256), <id>@2x.png (512), spikes/items/sheet.png (dark UI),
spikes/items/sheet_light.png and spikes/items/icon_report.json (frame fill per icon).
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
RAW = os.path.join(ROOT, "spikes", "items", "raw")
ICONS = os.path.join(ROOT, "public", "icons")
OUT = os.path.join(ROOT, "spikes", "items")
SHADOW_RGB = (0.07, 0.05, 0.11)   # cool plum, matches the baked AO tint
SHADOW_STRENGTH = 0.5
SHADOW_GAMMA = 1.5              # tightens the catcher falloff to a contact core, so paper UIs stay clean
EDGE_STRENGTH = 0.34            # soft plum edge under the model: keeps white items readable on paper
MIN_FILL = 0.60

argv = sys.argv[1:]
only = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None
stats = json.load(open(os.path.join(OUT, "stats.json")))
ids = [i for i in stats if os.path.exists(os.path.join(RAW, i + "_obj.png")) and (not only or i in only)]


def composite(ident):
    obj = np.asarray(Image.open(os.path.join(RAW, ident + "_obj.png")).convert("RGBA"), dtype=np.float32) / 255
    sh_img = Image.open(os.path.join(RAW, ident + "_shadow.png")).convert("RGBA")
    sh_a = np.asarray(sh_img.getchannel("A").filter(ImageFilter.GaussianBlur(sh_img.width / 256)), dtype=np.float32) / 255
    sh_a = np.clip(sh_a, 0, 1) ** SHADOW_GAMMA * SHADOW_STRENGTH
    px = sh_img.width / 256
    edge = Image.fromarray((obj[..., 3] * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * round(px) + 1))
    edge = np.asarray(edge.filter(ImageFilter.GaussianBlur(px * 0.9)), dtype=np.float32) / 255
    sh_a = np.maximum(sh_a, edge * EDGE_STRENGTH)
    oa = obj[..., 3:4]
    a = oa + sh_a[..., None] * (1 - oa)                       # object over shadow, straight alpha out
    rgb = obj[..., :3] * oa + np.array(SHADOW_RGB, dtype=np.float32) * sh_a[..., None] * (1 - oa)
    rgb = np.where(a > 1e-6, rgb / np.maximum(a, 1e-6), 0)
    out = np.concatenate([rgb, a], axis=-1)
    ys, xs = np.where(obj[..., 3] > 0.03)
    n = obj.shape[0]
    fill = max(xs.max() - xs.min() + 1, ys.max() - ys.min() + 1) / n
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA"), float(fill)


def down(img, size):
    return img.convert("RGBa").resize((size, size), Image.LANCZOS).convert("RGBA")


def font(size, bold=False):
    try:
        path = subprocess.run(["fc-match", "-f", "%{file}", "sans:bold" if bold else "sans"], capture_output=True, text=True).stdout
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default(size)


def sheet(icons, path, bg, slot, edge, ink, sub, title):
    cols, big, small, pad = 6, 168, 48, 18
    cw, ch = big + small + pad * 3 + 6, big + 62
    rows = (len(icons) + cols - 1) // cols
    W, H = cols * cw + pad, rows * ch + pad + 54
    im = Image.new("RGBA", (W, H), bg)
    d = ImageDraw.Draw(im)
    d.text((pad, 14), title, font=font(22, True), fill=ink)
    f1, f2 = font(15, True), font(12)
    for n, (ident, hi) in enumerate(icons):
        x0, y0 = pad + (n % cols) * cw, 54 + (n // cols) * ch
        d.rounded_rectangle((x0, y0, x0 + big, y0 + big), 16, fill=slot, outline=edge, width=2)
        im.alpha_composite(down(hi, big - 12), (x0 + 6, y0 + 6))
        sx, sy = x0 + big + 10, y0 + big - small - 8
        d.rounded_rectangle((sx - 4, sy - 4, sx + small + 4, sy + small + 4), 8, fill=slot, outline=edge, width=1)
        im.alpha_composite(down(hi, small), (sx, sy))        # the hotbar size: does the silhouette still read?
        d.text((sx - 4, sy - 22), "48 px", font=f2, fill=sub)
        d.text((x0 + 2, y0 + big + 6), ident, font=f1, fill=ink)
        d.text((x0 + 2, y0 + big + 26), f"{stats[ident]['name']}  ·  {stats[ident]['tris']} tris", font=f2, fill=sub)
    im.convert("RGB").save(path, optimize=True)


os.makedirs(ICONS, exist_ok=True)
report, icons = {}, []
for ident in ids:
    hi, fill = composite(ident)
    icons.append((ident, hi))
    report[ident] = {"fill": round(fill, 3), "ok": fill >= MIN_FILL}
    if "--no-icons" not in argv:
        (hi if hi.width == 512 else down(hi, 512)).save(os.path.join(ICONS, ident + "@2x.png"), optimize=True)
        down(hi, 256).save(os.path.join(ICONS, ident + ".png"), optimize=True)
tag = "_preview" if only or "--no-icons" in argv else ""
sheet(icons, os.path.join(OUT, f"sheet{tag}.png"), "#14161b", "#262a33", "#3b414d", "#f2ede0", "#8e96a3",
      "Bananaville item icons on the dark UI (hotbar and inventory)")
sheet(icons, os.path.join(OUT, f"sheet_light{tag}.png"), "#efe6d2", "#fffaf0", "#d6c9ab", "#2a1a12", "#7d6e5a",
      "Bananaville item icons on the light UI (ledger paper)")
if not tag:
    json.dump(report, open(os.path.join(OUT, "icon_report.json"), "w"), indent=1)
bad = [i for i, r in report.items() if not r["ok"]]
if not tag:                                                   # src/game/ui/icons.ts must list exactly this set
    import re
    ts = open(os.path.join(ROOT, "src", "game", "ui", "icons.ts")).read()
    listed = re.findall(r'"([a-z0-9]+)"', ts[ts.index("ICON_IDS"):ts.index("];")])
    if sorted(listed) != sorted(ids):
        sys.exit(f"ICON_IDS mismatch: only in icons.ts {sorted(set(listed) - set(ids))}, only rendered {sorted(set(ids) - set(listed))}")
print(f"composited {len(ids)} icons; min fill {min(r['fill'] for r in report.values()):.2f}; below {MIN_FILL}: {bad or 'none'}")
if bad:
    sys.exit(1)
