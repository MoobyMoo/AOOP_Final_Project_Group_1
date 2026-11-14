"""House kit modules + props, one asset each, for one-off assembly with houseModule() (the six buildings are in
g_prefab.py). Wall modules run along x, 2 u long, centred, with the OUTSIDE on -y (three.js +z)."""
from hprops import *

G = "house"
SEED = [300]


def mod(name, **kw):
    SEED[0] += 1
    return House(name, G, SEED[0], single=True, footprint=1.0, **kw)


def wall(name, style, mods, doors=None):
    h = mod(name)
    L = sum(4 if c == "D" else 2 for c in mods)
    h.run((-L / 2, 0), (L / 2, 0), mods, style, posts=False, doors=doors, trim=False)
    return h.finish()


def prop(name, fn, **kw):
    h = mod(name, ao_dist=1.0)
    h.put(fn, 0, 0, z=0.0, **kw)
    a = h.finish()
    a.meta.update(blocksMove=bool(h.cols), blocksShot=any(c["shot"] for c in h.cols), tall=False)
    return a


def build():
    for kind in ("plank", "stone", "dirt"):
        h = mod(f"floor_{kind}")
        h.floor(-1, -1, 1, 1, kind)
        h.finish()
    for st in ("plank", "barn", "boat", "stone", "tin"):
        wall(f"wall_{st}", st, "p")
        wall(f"wall_{st}_window", st, "w")
        wall(f"wall_{st}_door", st, "d", {0: dict(id="door")})
        h = mod(f"corner_{st}")
        h.post(0, 0, st)
        h.finish()
    wall("wall_stone_cellwindow", "stone", "v")
    wall("wall_stone_cracked", "stone", "c")
    wall("wall_plank_cracked", "plank", "c")
    wall("wall_barn_double", "barn", "D", {0: dict(id="door")})
    wall("wall_boat_open", "boat", "o")
    wall("cell_bars", "stone", "b")
    wall("cell_door", "stone", "g", {0: dict(id="door")})
    wall("wall_tin_door_locked", "tin", "d", {0: dict(id="door", kind="steel", locked="radio_key")})
    wall("wall_plank_door_weak", "plank", "d", {0: dict(id="door", breakable=True)})
    # roofs. Gable sections are 2 u long over a 6 u span; _end closes one side (mirror it with yaw pi for the other)
    h = mod("roof_thatch_hip")
    h.hip(-2, -2, 2, 2)
    h.finish()
    for st, rise in (("thatch", 1.9), ("tin", 1.5), ("plank", 1.6)):
        h = mod(f"roof_{st}")
        h.gable(-1, -3, 1, 3, axis="x", style=st, rise=rise, og=0.0)
        h.finish()
        h = mod(f"roof_{st}_end")
        h.gable(-1, -3, 1, 3, axis="x", style=st, rise=rise, og=(0.4, 0.0), ends=("stone" if st == "tin" else "plank", None))
        h.finish()
    h = mod("roof_tin_gambrel")
    h.gambrel(-4, -1, 4, 1, axis="y", style="tin", og=0.0, trim=CREAM)
    h.finish()
    h = mod("roof_tin_shed")
    h.shed(-2, -2, 2, 2)
    h.finish()
    h = mod("porch")
    h.porch(-2, -2, 2, 0.13, gap=(-0.8, 0.8))
    h.finish()
    h = mod("steps")
    h.steps(0, 0)
    h.c_box(0, -0.38, 1.6, 0.76, move=False, low=False)
    h.cols.clear()
    h.finish()
    for name, fn, kw in (("bunk", bunk, {}), ("cot_iron", bunk, dict(single=True)), ("cot", cot, {}), ("table", table, {}), ("table_cards", table, dict(dress="cards")), ("chair", chair, {}), ("stool", stool, {}),
                         ("shelf", shelf, {}), ("shelf_files", shelf, dict(stock="files")), ("stove", stove, {}), ("desk", desk, {}), ("cabinet", cabinet, {}), ("cabinet_open", cabinet, dict(open_=True)),
                         ("crate_stack", crates, {}), ("barrel", barrel, {}), ("drum", drum, {}), ("sacks", sacks, {}), ("haybale", haybale, {}), ("haystack", haybale, dict(n=3)), ("radio", radio, {}),
                         ("generator", generator, {}), ("bench", bench, {}), ("workbench", workbench, {}), ("stall", stall, {}), ("trough", trough, {}), ("boat", boat, {}), ("net_rack", net_rack, {}),
                         ("buoys", buoys, {}), ("rope_coil", coil, {}), ("noticeboard", noticeboard, {}), ("key_rack", keyboard_, {}), ("lantern", lantern, {}), ("plant", plant, {}), ("firewood", firewood, {}),
                         ("mooring", mooring, {}), ("ladder", ladder_lean, {}), ("wheel", wheel, {}), ("bucket", bucket, {})):
        prop(name, fn, **kw)


REVIEW = dict(cols=10, cell=4.2, dist=62)
