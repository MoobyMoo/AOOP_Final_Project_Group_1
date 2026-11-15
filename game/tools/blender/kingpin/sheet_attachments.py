"""Compose the attachment review sheets from render_attachments.py's shots.

  python3 tools/blender/kingpin/sheet_attachments.py <shots_dir> <out_dir>

Writes <out_dir>/review_sheet.png (one row per attachment: alone, fitted from the raid camera's angle, fitted 3/4) and
<out_dir>/loadouts.png (the bare gun and two full loadouts, both angles). Every raid-angle cell carries an inset of
the same shot at the size the raid draws it at 1080p, and that inset again at 3x with hard pixels: the silhouette
has to survive there, not in the big render.
"""
import json
import math
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

SHOTS, OUT = sys.argv[1], sys.argv[2]
META = json.load(open(os.path.join(SHOTS, "shots.json")))
# the raid camera (src/game/core/raid.ts CAMERA): FOV 24 at distance 40, 1080 px tall; the gun is drawn at GUN_SCALE
RAID_PX_PER_UNIT = 1080 / (2 * 40 * math.tan(math.radians(12))) * 0.65
ROWS = [("att_sight_holo", "socket_sight", "compact open reflex sight"), ("att_sight_2x", "socket_sight", "short 2x tube scope"),
        ("att_muzzle_supp", "socket_muzzle", "fat suppressor can"), ("att_muzzle_comp", "socket_muzzle", "slotted compensator"),
        ("att_mag_ext", "socket_mag", "magazine extension"), ("att_laser", "socket_rail", "under-rail laser module")]
CW, CH, PAD, HEAD, LABEL = 560, 420, 14, 64, 34
BG, INK, SUB, EDGE = "#14161b", "#f2ede0", "#9aa2ae", "#3b414d"


def font(size, bold=False):
    try:
        path = subprocess.run(["fc-match", "-f", "%{file}", "sans:bold" if bold else "sans"], capture_output=True, text=True).stdout
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default(size)


F_TITLE, F_ROW, F_SUB = font(24, True), font(17, True), font(13)


def cell(name, raid=False):
    im = Image.open(os.path.join(SHOTS, name + ".png")).convert("RGB")
    out = im.resize((CW, CH), Image.LANCZOS)
    if raid:                                             # the same shot at the raid's pixel size, and that at 3x
        k = RAID_PX_PER_UNIT / META["px_per_unit"][name]
        small = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        big = small.resize((small.width * 3, small.height * 3), Image.NEAREST)
        d = ImageDraw.Draw(out)
        x, y, xs = CW - big.width - 8, CH - big.height - 8, CW - big.width - small.width - 16
        out.paste(big, (x, y)); d.rectangle((x - 1, y - 1, x + big.width, y + big.height), outline=BG)
        out.paste(small, (xs, CH - small.height - 8)); d.rectangle((xs - 1, CH - small.height - 9, xs + small.width, CH - 8), outline=BG)
        label = "raid size at 1080p, and x3"
        d.text((CW - 8 - d.textlength(label, font=F_SUB), y - 19), label, font=F_SUB, fill=BG)
    return out


def sheet(path, title, cols, rows):
    """rows: [(label, sub, [cell images])]"""
    W, H = PAD + len(cols) * (CW + PAD), HEAD + len(rows) * (CH + LABEL + PAD) + PAD
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    d.text((PAD, 10), title, font=F_TITLE, fill=INK)
    for i, c in enumerate(cols):
        d.text((PAD + i * (CW + PAD), 42), c, font=F_SUB, fill=SUB)
    for r, (label, sub, cells) in enumerate(rows):
        y = HEAD + r * (CH + LABEL + PAD)
        d.text((PAD, y + 6), label, font=F_ROW, fill=INK)
        d.text((PAD + d.textlength(label, font=F_ROW) + 14, y + 9), sub, font=F_SUB, fill=SUB)
        for i, c in enumerate(cells):
            x = PAD + i * (CW + PAD)
            im.paste(c, (x, y + LABEL)); d.rectangle((x - 1, y + LABEL - 1, x + CW, y + LABEL + CH), outline=EDGE)
    im.save(path, optimize=True)
    print("wrote", path, im.size)


os.makedirs(OUT, exist_ok=True)
tris = {i: b["tris"] for i, b in META["fitted_bounds"].items()}
sheet(os.path.join(OUT, "review_sheet.png"), "Kingpin attachments: alone, and fitted through the sockets",
      ["alone, 3/4", "fitted, raid camera angle (55 degrees down)", "fitted, 3/4"],
      [(i, f"{what}  ·  {sock}  ·  {tris[i]} tris", [cell(i + "_alone"), cell(i + "_game", True), cell(i + "_34")]) for i, sock, what in ROWS])
sheet(os.path.join(OUT, "loadouts.png"), "Kingpin attachments: the bare gun and two full loadouts",
      ["raid camera angle (55 degrees down)", "3/4"],
      [("bare", "no attachments", [cell("bare_game", True), cell("bare_34")]),
       ("loadout A", "att_sight_holo + att_muzzle_supp + att_mag_ext + att_laser", [cell("loadout_a_game", True), cell("loadout_a_34")]),
       ("loadout B", "att_sight_2x + att_muzzle_comp + att_laser", [cell("loadout_b_game", True), cell("loadout_b_34")])])
