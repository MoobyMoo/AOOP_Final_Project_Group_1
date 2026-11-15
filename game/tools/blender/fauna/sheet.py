"""Compose the wildlife and container review sheets from render_fauna.py's and render_containers.py's shots.

  python3 tools/blender/fauna/sheet.py <fauna shots dir> <container shots dir> <out dir>

Writes <out>/review_sheet.png (one band per animal: key poses at the raid camera, then the same poses at a low 3/4; the
first cell of each row has the monkey for scale), <out>/clips.png (six frames of every clip) and <out>/containers.png
(each new container closed and open, both angles, and a line-up with the monkey). Every raid-angle cell carries an
inset of the middle of the same shot at the size the raid draws it at 1080p.
"""
import json
import math
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

SHOTS, CONT, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
META = json.load(open(os.path.join(SHOTS, "shots.json")))
MAN = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "manifest.json")))
RAID_PX_PER_M = 1080 / (2 * 40 * math.tan(math.radians(12)))      # the raid camera: FOV 24 at distance 40, 1080 px tall
PAD, HEAD, LABEL, BAND = 10, 58, 24, 40
BG, INK, SUB, EDGE = "#14161b", "#f2ede0", "#9aa2ae", "#3b414d"
TITLE = {"crab": "fauna_crab: beach crab", "parrot": "fauna_parrot: macaw", "frog": "fauna_frog: tree frog", "boar": "fauna_boar: wild boar", "croc": "fauna_croc: mangrove crocodile"}


def font(size, bold=False):
    try:
        path = subprocess.run(["fc-match", "-f", "%{file}", "sans:bold" if bold else "sans"], capture_output=True, text=True).stdout
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default(size)


F_TITLE, F_ROW, F_SUB = font(22, True), font(16, True), font(12)


def cell(path, size, px_per_m=None):
    im = Image.open(path).convert("RGB")
    out = im.resize(size, Image.LANCZOS)
    if px_per_m:                                             # the middle of the same shot at the raid's pixel size
        k = RAID_PX_PER_M / px_per_m
        if k < 0.62:
            cw, ch = int(im.width * 0.64), int(im.height * 0.64)
            crop = im.crop(((im.width - cw) // 2, (im.height - ch) // 2, (im.width + cw) // 2, (im.height + ch) // 2))
            small = crop.resize((max(1, round(cw * k)), max(1, round(ch * k))), Image.LANCZOS)
            d = ImageDraw.Draw(out)
            x, y = size[0] - small.width - 6, size[1] - small.height - 6
            out.paste(small, (x, y)); d.rectangle((x - 1, y - 1, x + small.width, y + small.height), outline=BG)
            label = "raid size, 1080p"
            d.text((size[0] - 6 - d.textlength(label, font=F_SUB), y - 16), label, font=F_SUB, fill=BG)
    return out


def fauna_sheet(path):
    cw, ch = 384, 315
    cols = max(META["poses"].values())
    W = PAD + cols * (cw + PAD)
    H = HEAD + sum(BAND + 2 * (ch + LABEL + PAD) for _ in META["poses"]) + PAD
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    d.text((PAD, 14), "Bananaville wildlife: key poses. Top row of each band = the raid camera (pitch 55; the inset is the same shot at raid size, 1080p), bottom row = a low 3/4.", font=F_TITLE, fill=INK)
    y = HEAD
    for ident, n in META["poses"].items():
        a = MAN["animals"][ident]
        clips = ", ".join("%s %.2fs%s" % (k[len(ident) + 1:], v["seconds"], " loop" if v["loop"] else "") for k, v in a["clips"].items())
        d.text((PAD, y + 8), TITLE[ident], font=F_ROW, fill=INK)
        d.text((PAD + d.textlength(TITLE[ident], font=F_ROW) + 14, y + 11), "%d tris (budget %d), %d bones.  Clips: %s" % (a["tris"], a["budget"], len(a["bones"]), clips), font=F_SUB, fill=SUB)
        y += BAND
        for view in ("raid", "q34"):
            for i in range(n):
                name = f"{ident}_{view}_{i}"
                x = PAD + i * (cw + PAD)
                im.paste(cell(os.path.join(SHOTS, name + ".png"), (cw, ch), META["px_per_m"][name] if view == "raid" and name not in META.get("scale", []) else None), (x, y))
                d.rectangle((x - 1, y - 1, x + cw, y + ch), outline=EDGE)
                d.text((x + 2, y + ch + 5), META["labels"][name], font=F_SUB, fill=SUB)
            y += ch + LABEL + PAD
    im.save(path, optimize=True)
    return im.size


def clips_sheet(path):
    cw, ch = 230, 189
    names = list(META["clips"])
    W = 190 + 6 * (cw + 4) + PAD
    H = HEAD + len(names) * (ch + 6) + PAD
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    d.text((PAD, 14), "Bananaville wildlife: six frames of every clip (low 3/4)", font=F_TITLE, fill=INK)
    y = HEAD
    for name in names:
        c = META["clips"][name]
        d.text((PAD, y + ch / 2 - 18), name, font=F_ROW, fill=INK)
        d.text((PAD, y + ch / 2 + 4), "%.2f s%s" % (c["seconds"], ", loop" if c["loop"] else ", one-shot"), font=F_SUB, fill=SUB)
        for i in range(6):
            im.paste(cell(os.path.join(SHOTS, f"clip_{name}_{i}.png"), (cw, ch)), (190 + i * (cw + 4), y))
        y += ch + 6
    im.save(path, optimize=True)
    return im.size


def containers_sheet(path):
    names = ["cont_lunchbox", "cont_toolbox", "cont_medcabinet", "cont_safe", "cont_trash", "cont_sack"]
    man = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "build", "manifest", "containers.json")))["assets"]
    note = {"cont_lunchbox": "yellow tin, barrel-vault lid", "cont_toolbox": "orange steel, gabled lid, tube handle", "cont_medcabinet": "wall-mounted; the door lifts up and out",
            "cont_safe": "floor safe; the dial door is on top", "cont_trash": "junk heap; the lid is the loose bin lid on top", "cont_sack": "tied supply sack; the neck flops back"}
    cw = 400
    cols = [("closed_raid", "closed, raid camera"), ("open_raid", "open (lid rotation.x = -1.9), raid camera"), ("closed_q34", "closed, 3/4"), ("open_q34", "open, 3/4")]
    lu = Image.open(os.path.join(CONT, "lineup_raid.png")).convert("RGB")
    W = PAD + len(cols) * (cw + PAD)
    lh = round(lu.height * (W - 2 * PAD) / lu.width)
    H = HEAD + len(names) * (cw + LABEL + PAD) + LABEL + lh + 2 * PAD
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    d.text((PAD, 14), "Bananaville G2 containers: closed and open, raid camera and 3/4", font=F_TITLE, fill=INK)
    y = HEAD
    for n in names:
        for i, (key, lab) in enumerate(cols):
            x = PAD + i * (cw + PAD)
            src = os.path.join(CONT, f"{n}_{key}.png")
            ppm = Image.open(src).height / (2 * 8.6 * math.tan(math.radians(12))) if key.endswith("raid") else None
            im.paste(cell(src, (cw, cw), ppm), (x, y))
            d.rectangle((x - 1, y - 1, x + cw, y + cw), outline=EDGE)
            d.text((x + 2, y + cw + 5), (f"{n}  {man[n]['tris']} tris  ({note[n]})" if i == 0 else lab), font=F_SUB, fill=INK if i == 0 else SUB)
        y += cw + LABEL + PAD
    d.text((PAD, y + 2), "Line-up at the raid camera with the businessman monkey (1.9 m) for scale", font=F_SUB, fill=SUB)
    im.paste(lu.resize((W - 2 * PAD, lh), Image.LANCZOS), (PAD, y + LABEL))
    im.save(path, optimize=True)
    return im.size


os.makedirs(OUT, exist_ok=True)
for fn, name in ((fauna_sheet, "review_sheet.png"), (clips_sheet, "clips.png"), (containers_sheet, "containers.png")):
    size = fn(os.path.join(OUT, name))
    print("wrote", os.path.join(OUT, name), size, "%.0f KB" % (os.path.getsize(os.path.join(OUT, name)) / 1024))
