"""Compose the vault review sheets from vault_review.py's shots.
  python3 tools/blender/build/vault_sheet.py <shots_dir> <out_dir>
Writes <out_dir>/sheet_shell.jpg (pod, board, room shell), sheet_facilities.jpg (every facility) and copies the mock
vault renders next to them."""
import json, os, shutil, sys
from PIL import Image, ImageDraw, ImageFont

SRC, DST = sys.argv[1], sys.argv[2]
os.makedirs(DST, exist_ok=True)
info = json.load(open(os.path.join(SRC, "alone.json")))
BG, INK, DIM, BRASS = (29, 26, 23), (243, 234, 214), (160, 150, 132), (205, 165, 92)


def font(size, bold=False):
    for p in ("/usr/share/fonts/TTF/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/TTF/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/liberation/LiberationSans-Regular.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def sheet(title, names, cols, cell, out):
    names = [n for n in names if n in info]
    rows = (len(names) + cols - 1) // cols
    pad, head, cap = 18, 74, 64
    W, H = pad + cols * (cell + pad), head + rows * (cell + cap + pad) + pad
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    d.text((pad, 18), title, font=font(30, True), fill=BRASS)
    for i, n in enumerate(names):
        x, y = pad + (i % cols) * (cell + pad), head + (i // cols) * (cell + cap + pad)
        im.paste(Image.open(os.path.join(SRC, f"alone_{n}.png")).convert("RGB").resize((cell, cell), Image.LANCZOS), (x, y))
        m = info[n]
        d.text((x, y + cell + 6), n, font=font(19, True), fill=INK)
        d.text((x, y + cell + 30), f"{m['tris']} tris   {m['size'][0]} x {m['size'][1]} x {m['size'][2]} m", font=font(15), fill=DIM)
        nodes = ", ".join(m["nodes"])
        if nodes:
            d.text((x, y + cell + 48), nodes if len(nodes) < 62 else nodes[:59] + "...", font=font(13), fill=DIM)
    im.save(out, quality=90)
    print("wrote", out, im.size)


SHELL = ["vault_pod", "vault_board", "vault_door_round", "vault_wall", "vault_wall_corner", "vault_pilaster", "vault_trim", "vault_wall_cap", "vault_sconce",
         "vault_floor", "vault_floor_half", "vault_floor_cell", "vault_floor_border", "vault_floor_corner", "vault_kerb", "vault_kerb_post"]
FAC = ["fac_fence", "fac_bench", "fac_sal", "fac_trophy", "fac_med", "fac_stash", "fac_generator", "fac_press", "fac_desk", "fac_plant", "fac_locker", "fac_blueprint"]
sheet("The Vault v3: Banana Express, departures board and the room shell (3/4 view, each piece alone)", SHELL, 4, 440, os.path.join(DST, "sheet_shell.jpg"))
sheet("The Vault v3: facilities (3/4 view, each piece alone; footprints in 1 m cells)", FAC, 4, 440, os.path.join(DST, "sheet_facilities.jpg"))
for f in sorted(os.listdir(SRC)):
    if f.startswith("mock_") and f.endswith(".png"):
        Image.open(os.path.join(SRC, f)).convert("RGB").save(os.path.join(DST, f[:-4] + ".jpg"), quality=90)
        print("wrote", f[:-4] + ".jpg")
