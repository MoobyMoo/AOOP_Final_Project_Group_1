"""Compose research/look/fauna/drops.png from render_drops.py's shots and the rendered icons.

  python3 tools/blender/fauna/sheet_drops.py <shots dir> <out png>

One band for the hanging jacket (closed and open, raid camera and 3/4, then with the monkey) and one per drop (the
ground model at the raid camera and 3/4, then with the monkey, then its icon large and in a 90 px inventory cell).
Raid-camera cells carry an inset of the middle of the shot at the size the raid draws it at 1080p.
"""
import json
import math
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

SHOTS, OUT = sys.argv[1], sys.argv[2]
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
META = json.load(open(os.path.join(SHOTS, "shots.json")))
STATS = json.load(open(os.path.join(ROOT, "spikes", "items", "stats.json")))
CONT = json.load(open(os.path.join(ROOT, "tools", "blender", "build", "manifest", "containers.json")))["assets"]
RAID_PX_PER_M = 1080 / (2 * 40 * math.tan(math.radians(12)))
CW, CH, PAD, HEAD, LABEL, BAND = 400, 344, 10, 58, 24, 40
BG, INK, SUB, EDGE, SLOT = "#14161b", "#f2ede0", "#9aa2ae", "#3b414d", "#262a33"


def font(size, bold=False):
    try:
        path = subprocess.run(["fc-match", "-f", "%{file}", "sans:bold" if bold else "sans"], capture_output=True, text=True).stdout
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default(size)


F_TITLE, F_ROW, F_SUB = font(22, True), font(16, True), font(12)


def cell(name, inset=False):
    im = Image.open(os.path.join(SHOTS, name + ".png")).convert("RGB")
    out = im.resize((CW, CH), Image.LANCZOS)
    k = RAID_PX_PER_M / META["px_per_m"][name]
    if inset and k < 0.62:
        cw, ch = int(im.width * 0.6), int(im.height * 0.6)
        crop = im.crop(((im.width - cw) // 2, (im.height - ch) // 2, (im.width + cw) // 2, (im.height + ch) // 2))
        small = crop.resize((max(1, round(cw * k)), max(1, round(ch * k))), Image.LANCZOS)
        d = ImageDraw.Draw(out)
        x, y = CW - small.width - 6, CH - small.height - 6
        out.paste(small, (x, y)); d.rectangle((x - 1, y - 1, x + small.width, y + small.height), outline=BG)
        label = "raid size, 1080p"
        d.text((CW - 6 - d.textlength(label, font=F_SUB), y - 16), label, font=F_SUB, fill=BG)
    return out


def icon_cell(ident):
    out = Image.new("RGBA", (CW, CH), SLOT)
    ic = Image.open(os.path.join(ROOT, "public", "icons", ident + ".png")).convert("RGBA")
    big = ic.resize((236, 236), Image.LANCZOS)
    out.alpha_composite(big, (40, (CH - 236) // 2))
    d = ImageDraw.Draw(out)
    d.rounded_rectangle((292, CH - 90 - 44, 292 + 98, CH - 44 + 8), 8, outline=EDGE, width=1)
    out.alpha_composite(ic.resize((90, 90), Image.LANCZOS), (296, CH - 90 - 40))
    d.text((292, CH - 30), "90 px cell", font=F_SUB, fill=SUB)
    return out.convert("RGB")


BANDS = [
    ("cont_jacket", "cont_jacket: hanging jacket", "%d tris. Wall-mounted (wallMount, mountZ %.1f): the origin is on the wall plane at the foot of the wall. The lid is the left front flap." % (CONT["cont_jacket"]["tris"], CONT["cont_jacket"]["mountZ"]),
     [("cont_jacket_closed_raid", "closed, raid camera", True), ("cont_jacket_open_raid", "open (lid rotation.x = -1.9), raid camera", True), ("cont_jacket_closed_q34", "closed, 3/4", False),
      ("cont_jacket_open_q34", "open, 3/4", False), ("cont_jacket_scale_raid", "with the monkey (1.9 m), raid camera", False), ("icon:cont_jacket", "icon: public/icons/cont_jacket.png", False)]),
    ("meat", "meat: Boar Meat", "public/models/items/meat.glb, %d tris, %s m. Drawn on the ground at x%.2f." % (STATS["meat"]["tris"], " x ".join("%.2f" % v for v in STATS["meat"]["dims_m"]), META["scale"]["meat"]),
     [("meat_raid", "ground model, raid camera", True), ("meat_q34", "ground model, 3/4", False), ("meat_scale_raid", "with the monkey (1.9 m), raid camera", False),
      ("meat_scale_q34", "with the monkey, 3/4", False), ("icon:meat", "icon: public/icons/meat.png", False)]),
    ("hide", "hide: Animal Hide", "public/models/items/hide.glb, %d tris, %s m. Drawn on the ground at x%.2f." % (STATS["hide"]["tris"], " x ".join("%.2f" % v for v in STATS["hide"]["dims_m"]), META["scale"]["hide"]),
     [("hide_raid", "ground model, raid camera", True), ("hide_q34", "ground model, 3/4", False), ("hide_scale_raid", "with the monkey (1.9 m), raid camera", False),
      ("hide_scale_q34", "with the monkey, 3/4", False), ("icon:hide", "icon: public/icons/hide.png", False)]),
]
cols = max(len(b[3]) for b in BANDS)
Wd, Hd = PAD + cols * (CW + PAD), HEAD + len(BANDS) * (BAND + CH + LABEL + PAD) + PAD
im = Image.new("RGB", (Wd, Hd), BG)
d = ImageDraw.Draw(im)
d.text((PAD, 14), "Bananaville animal drops and the hanging jacket", font=F_TITLE, fill=INK)
y = HEAD
for _id, title, sub, cells in BANDS:
    d.text((PAD, y + 8), title, font=F_ROW, fill=INK)
    d.text((PAD + d.textlength(title, font=F_ROW) + 14, y + 11), sub, font=F_SUB, fill=SUB)
    y += BAND
    for i, (name, label, inset) in enumerate(cells):
        x = PAD + i * (CW + PAD)
        im.paste(icon_cell(name[5:]) if name.startswith("icon:") else cell(name, inset), (x, y))
        d.rectangle((x - 1, y - 1, x + CW, y + CH), outline=EDGE)
        d.text((x + 2, y + CH + 5), label, font=F_SUB, fill=SUB)
    y += CH + LABEL + PAD
os.makedirs(os.path.dirname(OUT), exist_ok=True)
im.save(OUT, optimize=True)
print("wrote", OUT, im.size, "%.0f KB" % (os.path.getsize(OUT) / 1024))
