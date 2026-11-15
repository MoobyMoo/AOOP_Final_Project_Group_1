"""Compose the gun review sheets from render_guns.py's shots.

  python3 tools/blender/guns/sheet_guns.py <shots_dir> <out_dir>

Writes <out_dir>/review_sheet.png: one row per class, low / mid / high side by side, each gun in the monkey's hand at
the raid camera. Every cell carries an inset of the same shot at the size the raid draws it at 1080p, pixel for pixel:
the silhouette has to survive there, not in the big render.
Writes <out_dir>/class_<class>.png: one row per gun of the class: alone at 3/4, with a sight and a muzzle device from
attachments.glb fitted through its sockets, and in hand.
"""
import json
import math
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS, OUT = sys.argv[1], sys.argv[2]
META = json.load(open(os.path.join(SHOTS, "shots.json")))
MANIFEST = json.load(open(os.path.join(HERE, "manifest.json")))
# the raid camera (src/game/core/raid.ts CAMERA): FOV 24 at distance 40, 1080 px tall
RAID_PX_PER_UNIT = 1080 / (2 * 40 * math.tan(math.radians(12)))
CLASSES = [("pistol", "Pistols"), ("smg", "SMGs"), ("ar", "Assault rifles"), ("shotgun", "Shotguns"), ("sniper", "Sniper rifles"), ("lmg", "LMGs")]
TIERS = ["low", "mid", "high"]
FIT = {"pistol": "reflex sight + compensator", "smg": "reflex sight + suppressor", "ar": "2x scope + compensator", "shotgun": "reflex sight + compensator",
       "sniper": "2x scope + suppressor (built-in scope hidden)", "lmg": "2x scope + compensator"}
GUNS = {"kingpin45": {"name": "Kingpin .45", "class": "pistol", "tier": "mid", "tris": 2416}, **MANIFEST}
# the whole roster (class, tier) -> (gunId, name): a gun that is not built yet still gets its cell
ROSTER = {("pistol", "low"): ("pocket_change", "Pocket Change"), ("pistol", "mid"): ("kingpin45", "Kingpin .45"), ("pistol", "high"): ("golden_parachute", "Golden Parachute"),
          ("smg", "low"): ("peel_sprayer", "Peel Sprayer"), ("smg", "mid"): ("cash_flow", "Cash Flow"), ("smg", "high"): ("insider_trader", "Insider Trader"),
          ("ar", "low"): ("bootleg_rifle", "Bootleg Rifle"), ("ar", "mid"): ("contraband_carbine", "Contraband Carbine"), ("ar", "high"): ("board_meeting", "Board Meeting"),
          ("shotgun", "low"): ("pipe_dream", "Pipe Dream"), ("shotgun", "mid"): ("coconut_cracker", "Coconut Cracker"), ("shotgun", "high"): ("the_audit", "The Audit"),
          ("sniper", "mid"): ("bean_counter", "Bean Counter"), ("sniper", "high"): ("long_ledger", "Long Ledger"), ("lmg", "high"): ("hostile_takeover", "Hostile Takeover")}
CW, CH, PAD, HEAD, LABEL = 560, 420, 14, 64, 34
BG, INK, SUB, EDGE = "#14161b", "#f2ede0", "#9aa2ae", "#3b414d"
TIER_INK = {"low": "#c98f5a", "mid": "#b9c0cc", "high": "#f0c24a"}


def font(size, bold=False):
    try:
        path = subprocess.run(["fc-match", "-f", "%{file}", "sans:bold" if bold else "sans"], capture_output=True, text=True).stdout
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default(size)


F_TITLE, F_ROW, F_SUB = font(24, True), font(17, True), font(13)


def has(name):
    return os.path.exists(os.path.join(SHOTS, name + ".png"))


def cell(name, raid=False):
    im = Image.open(os.path.join(SHOTS, name + ".png")).convert("RGB")
    out = im.resize((CW, CH), Image.LANCZOS)
    if raid:                                             # the same shot at the raid's pixel size: the middle of the frame, 1:1
        k = RAID_PX_PER_UNIT / META["px_per_unit"][name]
        small = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        cw, ch = round(small.width * 0.74), round(small.height * 0.66)
        x0, y0 = (small.width - cw) // 2, round(small.height * 0.48 - ch / 2)
        crop = small.crop((x0, y0, x0 + cw, y0 + ch))
        d = ImageDraw.Draw(out)
        x, y = CW - crop.width - 8, CH - crop.height - 8
        out.paste(crop, (x, y)); d.rectangle((x - 1, y - 1, x + crop.width, y + crop.height), outline=BG)
        label = "raid size at 1080p"
        d.text((CW - 8 - d.textlength(label, font=F_SUB), y - 19), label, font=F_SUB, fill=BG)
    return out


def blank(text):
    im = Image.new("RGB", (CW, CH), "#1b1e25")
    d = ImageDraw.Draw(im)
    d.text(((CW - d.textlength(text, font=F_SUB)) / 2, CH / 2 - 8), text, font=F_SUB, fill=EDGE)
    return im


def sheet(path, title, cols, rows):
    """rows: [(label, sub, [(caption, colour, image)])]"""
    W, H = PAD + len(cols) * (CW + PAD), HEAD + len(rows) * (CH + LABEL + 22 + PAD) + PAD
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    d.text((PAD, 10), title, font=F_TITLE, fill=INK)
    for i, c in enumerate(cols):
        d.text((PAD + i * (CW + PAD), 42), c, font=F_SUB, fill=SUB)
    for r, (label, sub, cells) in enumerate(rows):
        y = HEAD + r * (CH + LABEL + 22 + PAD)
        d.text((PAD, y + 6), label, font=F_ROW, fill=INK)
        d.text((PAD + d.textlength(label, font=F_ROW) + 14, y + 9), sub, font=F_SUB, fill=SUB)
        for i, (cap, colour, c) in enumerate(cells):
            x = PAD + i * (CW + PAD)
            im.paste(c, (x, y + LABEL)); d.rectangle((x - 1, y + LABEL - 1, x + CW, y + LABEL + CH), outline=EDGE)
            d.text((x, y + LABEL + CH + 4), cap, font=F_SUB, fill=colour)
    im.save(path, optimize=True)
    print("wrote", path, im.size)


os.makedirs(OUT, exist_ok=True)
by = {(g["class"], g["tier"]): (i, g) for i, g in GUNS.items()}
rows = []
for cls, title in CLASSES:
    cells = []
    for tier in TIERS:
        i, g = by.get((cls, tier), (None, None))
        if i and has(i + "_hand"):
            cells.append((f"{g['name']}  ·  {i}  ·  {g['tris']} tris", TIER_INK[tier], cell(i + "_hand", True)))
        else:
            planned = ROSTER.get((cls, tier))
            cells.append(("", SUB, blank(f"{planned[1]} ({planned[0]}): not built yet" if planned else "no gun in this tier")))
    rows.append((title, f"in the firing hand, raid camera (55 degrees down), gun scale 0.65", cells))
sheet(os.path.join(OUT, "review_sheet.png"), "Bananaville guns: every class, low / mid / high, in hand at the raid camera", ["low", "mid", "high"], rows)
for cls, title in CLASSES:
    rows = []
    for tier in TIERS:
        i, g = by.get((cls, tier), (None, None))
        if not i or not has(i + "_34"):
            continue
        rows.append((g["name"], f"{i}  ·  {tier}  ·  {g['tris']} tris", [("alone", SUB, cell(i + "_34")), (FIT[cls], SUB, cell(i + "_fit")), ("in hand", SUB, cell(i + "_hand", True))]))
    if rows:
        sheet(os.path.join(OUT, f"class_{cls}.png"), f"{title}: alone, fitted through the sockets, in hand",
              ["alone, 3/4", "a sight and a muzzle device from attachments.glb on socket_sight and socket_muzzle, 3/4", "in hand, raid camera"], rows)
