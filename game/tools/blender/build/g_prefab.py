"""Enterable building prefabs (map v3). One asset per building; its gameplay data rides in the "def" extra.
Front (-y in Blender, +z in three.js) is the side that faces the game camera at yaw 0."""
from hprops import *

G = "prefab"


def pennant(g, at, col=YELLOW, s=1.0):
    x, y, z = at
    g.pole((x, y, z), (x, y, z + 1.1 * s), 0.035, WOOD_D[0], n=5, b=0)
    grid = [[(x + 0.02 + 0.6 * s * k / 3, y + 0.05 * sin(k * 1.9), z + 1.05 * s - 0.16 * s * i * (1 - k / 4.5) - 0.04 * k) for k in range(4)] for i in range(3)]
    g.sheet(grid, col, thick=0.025, jit=0.02)


def guard_hut():
    """4 x 4 u, one room: whitewashed stone, yellow band, palm-thatch hip roof"""
    h = House("guard_hut", G, 201)
    st, th = "stone", STY["stone"]["th"]
    h.floor(-2, -2, 2, 2, "stone", skirt=0.24)
    h.run((-2, -2), (2, -2), "dw", st, doors={0: dict(id="hut_door", breakable=True)})
    h.run((2, -2), (2, 2), "pw", st)
    h.run((2, 2), (-2, 2), "pp", st)
    h.run((-2, 2), (-2, -2), "wp", st)
    h.room(-2, -2, 2, 2)
    top = h.hip(-2, -2, 2, 2, rise=1.9)
    pennant(h.rf(), (0, 0, top + 0.5))
    h.put(noticeboard, 1.05, -2.34, 0, z=0, text="GUARD", w=1.1)
    # inside
    h.put(desk, 0.75, 1.3, 180)
    h.put(chair, 0.7, 0.6, 180)
    h.put(shelf, -1.1, 1.58, 0, w=1.2, stock="mixed")
    h.put(bunk, 1.33, -0.75, 90, single=True)
    h.put(keyboard_, -1.72, 0.3, -90)
    h.put(stool, -0.9, -0.2)
    h.rug(-0.3, 0.1, 1.5, 1.0, "#b5533c", YELLOW_D, rz=8)
    # outside
    h.put(barrel, -2.5, 1.2, z=0)
    h.put(crates, 2.58, 0.6, 90, z=0)
    h.put(plant, -2.44, -1.3, z=0)
    return h.finish(name="Guard hut")


def cellblock():
    """16 x 8 u: corridor, three barred cells, the warden's office. Whitewashed stone, rusted tin gable.
    The cracked wall is the back of cell 1 (north): it leads out to whatever the map hides behind the block."""
    h = House("cellblock", G, 202)
    h.lean = True
    st, th = "stone", STY["stone"]["th"]
    h.floor(-8, -4, 8, 4, "stone", skirt=0.24)
    h.run((-8, -4), (8, -4), "pwdwpwpw", st, doors={2: dict(id="block_door")})
    h.run((8, -4), (8, 4), "pwwp", st)
    h.run((8, 4), (-8, 4), "pwvppvcv", st)
    h.run((-8, 4), (-8, -4), "ppdp", st, doors={2: dict(id="block_side", breakable=True)})
    h.run((-8, 0), (4, 0), "bgbggb", st, inner=True, posts=False, doors={1: dict(id="cell1"), 3: dict(id="cell2"), 4: dict(id="cell3", hinge="r")})
    h.run((-4, 0), (-4, 4), "pp", st, inner=True, posts=False, trim=(0.05, None))
    h.run((0, 0), (0, 4), "pp", st, inner=True, posts=False, trim=(0.05, None))
    h.run((4, -4), (4, 4), "wdpp", st, inner=True, posts=False, doors={1: dict(id="warden_door", swing="in")})
    h.room(-8, -4, 4, 0); h.room(-8, 0, -4, 4); h.room(-4, 0, 0, 4); h.room(0, 0, 4, 4); h.room(4, -4, 8, 4)
    h.gable(-8, -4, 8, 4, axis="x", style="tin", rise=1.7, ends="stone", pal=TIN + TIN + RUSTY[:2] + ["#7fa39a"])
    g = h.rf()                      # the name stands on the eave over the main door, where the camera can read it
    sign(g, "CELL BLOCK", (-3, -4.24, H + 0.47), h=0.34, col=CREAM, ink="#3a2a1c", th=0.07)
    for x in (-4.3, -1.7):
        g.box(0.08, 0.08, 0.5, (x, -4.19, H - 0.14), col=WOOD_D[0], b=0)
    sign(h.up("i"), "WARDEN", (4 - th / 2 - 0.07, -1, 2.62), face=LEFT, h=0.16, col=YELLOW)
    # cells: a bunk on the west wall, a bucket, a stool; tally marks on the back wall
    for i, x0 in enumerate((-8, -4, 0)):
        h.put(bunk, x0 + 0.72, 2.45, 90)
        h.put(bucket, x0 + 0.6, 0.75)
        g = h.up("n")
        for k in range(7 + i * 3):
            u = x0 + 2.3 + (k % 5) * 0.09 + (k // 5) * 0.6
            g.paint_line([(-u, 1.5), (-u - 0.01, 1.78)], 0.03, BACK(0, 4 - th / 2, 0) @ T(0, 0, 0), "#5a5248")
    # corridor
    h.put(table, 0.2, -2.3, 0, w=1.3, d=0.9, dress="cards")
    h.put(stool, -0.75, -2.2); h.put(stool, 1.2, -2.4)
    h.put(bench, 1.9, -3.52)
    h.put(keyboard_, 3.6, -2.9, 90)
    h.put(crate, -7.1, -3.2, 8, s=0.72, icon=True)
    h.put(barrel, -5.6, -3.3)
    h.put(noticeboard, -1.0, -3.6, 180, text="NO BAIL", w=1.1)
    # the warden's office
    h.rug(6.0, 0.9, 2.6, 2.0, "#8f3b32", GOLD_D, rz=0)
    h.put(desk, 6.1, 1.0, 0)
    h.put(chair, 6.1, 1.85, 0)
    h.put(cabinet, 4.75, 3.42, 0); h.put(cabinet, 5.4, 3.42, 0, open_=True)
    h.put(shelf, 7.55, -1.7, -90, w=1.7, stock="files")
    h.put(crate, 7.3, -3.25, 12, s=0.7, hgt=0.6)
    h.put(chair, 5.2, -0.4, 200)
    # outside
    h.put(barrel, 5.2, -4.5, z=0); h.put(drum, 6.0, -4.5, z=0)
    h.put(bench, -6.0, -4.39, z=0)
    h.put(crates, 8.58, -1.0, 90, z=0, n=2)
    h.steps(-3, -4 - th / 2 - 0.05, kind="stone")
    h.steps(-8 - th / 2 - 0.05, -1, rz=-90, kind="stone")
    return h.finish(name="Cellblock")


def farmhouse():
    """12 x 6 u: kitchen-living room and a bedroom, a porch on the front. Weathered planks, yellow trim, palm thatch."""
    h = House("farmhouse", G, 203)
    st, th = "plank", STY["plank"]["th"]
    h.floor(-6, -3, 6, 3, "plank", skirt=0.26)
    h.run((-6, -3), (6, -3), "wpdwpw", st, doors={2: dict(id="farm_front")})
    h.run((6, -3), (6, 3), "pwp", st)
    h.run((6, 3), (-6, 3), "pwppwp", st)
    h.run((-6, 3), (-6, -3), "pdp", st, doors={1: dict(id="farm_side", breakable=True)})
    h.run((2, -3), (2, 3), "pdp", st, inner=True, posts=False, doors={1: dict(id="farm_bed", swing="in")})
    h.room(-6, -3, 2, 3); h.room(2, -3, 6, 3); h.room(-4, -5, 2, -3, h=2.6)
    h.gable(-6, -3, 6, 3, axis="x", style="thatch", rise=2.0, ends="plank", og=0.45, tiers=4)
    h.porch(-4, -5, 2, -3, gap=(-1.8, -0.2))
    h.steps(-1, -5.02)
    h.chimney(-1, 3 + th / 2 + 0.26, top=5.4)
    # kitchen-living room
    h.put(stove, -1, 2.3)
    h.rug(-3.1, 0.2, 2.6, 1.9, "#4f9a94", CREAM, rz=4)
    h.put(table, -3.1, 0.3, 0)
    h.put(chair, -3.6, 1.05, 10); h.put(chair, -2.6, -0.5, 190); h.put(chair, -4.2, 0.2, 100)
    h.put(shelf, -4.9, 2.62, 0, w=1.5)
    h.put(barrel, -5.35, -2.3)
    h.put(sacks, 1.15, 2.2, 20)
    h.put(crate, 1.35, -2.3, 8, s=0.7, icon=True)
    # bedroom
    h.put(cot, 5.3, 1.75, -90)
    h.put(cot, 3.55, 1.75, -90, quilt="#4f7f9a")
    h.put(crate, 4.42, 2.45, 0, s=0.5, hgt=0.5)
    with h.lo.at(T(4.42, 2.45, FLOOR)), h.em.at(T(4.42, 2.45, FLOOR)):
        lantern(h, h.lo, h.em, 0.495)
    h.light((4.42, 2.45, 1.3))
    h.rug(4.4, -0.6, 1.6, 1.1, "#b5533c", YELLOW_D, rz=-6)
    h.put(shelf, 5.6, -1.9, -90, w=1.3, hgt=1.6, stock="mixed")
    h.put(stool, 2.9, -2.2)
    # outside
    h.put(bench, 0.9, -3.6, z=0.05, w=1.4)
    h.put(plant, -3.5, -3.55, z=0.05)
    h.put(barrel, -6.52, 2.0, z=0)
    h.put(firewood, 6.52, -1.2, 90, z=0)
    h.put(sacks, -3.0, -4.35, 30, z=0.05)
    h.put(crates, 4.4, -3.61, 0, z=0)
    h.steps(-6 - th / 2 - 0.05, 0, rz=-90)
    return h.finish(name="Farmhouse")


def barn():
    """8 x 10 u, one big room with a dirt floor: red board walls, tin gambrel roof, a wide double door on the front."""
    h = House("barn", G, 204)
    st, th = "barn", STY["barn"]["th"]
    h.floor(-4, -5, 4, 5, "dirt", skirt=0.14)
    h.run((-4, -5), (4, -5), "pDp", st, doors={1: dict(id="barn_door")})
    h.run((4, -5), (4, 5), "pwpwp", st)
    h.run((4, 5), (-4, 5), "pppp", st)
    h.run((-4, 5), (-4, -5), "pwpdp", st, doors={3: dict(id="barn_side", breakable=True)})
    h.room(-4, -5, 4, 5, h=5.4)
    R, hf = h.gambrel(-4, -5, 4, 5, axis="y", style="tin", rise=2.7, ends="barn", trim=CREAM, og=0.5, pal=TIN + TIN + RUSTY + ["#b9b3a6"])
    g = h.rf()
    # hay door + hoist beam on the front gable, the name painted above
    yf = -5 - th / 2
    g.box(1.3, 0.07, 1.25, (0, yf - 0.035, H + 0.25), col="#7a3a2c", b=0.02)
    for sgn in (-1, 1):
        g.beam((sgn * 0.55, yf - 0.08, H + 0.35), (-sgn * 0.55, yf - 0.08, H + 1.4), 0.04, 0.12, CREAM, b=0)
    for x, w_, z in ((0, 1.5, H + 0.2), (0, 1.5, H + 1.5)):
        g.box(w_, 0.09, 0.12, (x, yf - 0.05, z - 0.06), col=CREAM, b=0)
    for x in (-0.72, 0.72):
        g.box(0.12, 0.085, 1.4, (x, yf - 0.05, H + 0.15), col=CREAM, b=0)
    g.beam((0, yf + 0.3, H + 2.25), (0, yf - 1.0, H + 2.25), 0.14, 0.16, WOOD_D[0], b=0.02)
    g.pole((0, yf - 0.85, H + 2.2), (0, yf - 0.85, H + 1.75), 0.025, ROPE, n=4, b=0)
    g.box(0.12, 0.05, 0.16, (0, yf - 0.85, H + 1.6), col=IRON, b=0)
    # inside
    h.put(haybale, 2.75, 3.4, 90, n=3)
    h.put(haybale, 1.2, 4.25, 4)
    h.put(haybale, 2.9, 1.9, 80)
    h.put(pitchfork, 1.85, 3.6, 30)
    h.put(stall, 2.95, 0.4, 0, w=1.9)
    h.put(stall, 2.95, -2.0, 0, w=1.9)
    h.put(trough, 3.35, -0.8, 90)
    h.put(workbench, -1.5, 4.4, 0)
    h.put(ladder_lean, 0.35, 4.78, 0, hgt=2.9)
    h.put(wheel, -3.2, 4.5, 0)
    h.put(sacks, -3.1, 2.4, 60)
    h.put(crates, -3.05, 0.1, 90, n=3)
    h.put(barrel, -3.25, -3.9); h.put(barrel, -2.5, -4.3)
    with h.lo.at(T(-3.25, -3.9, FLOOR)), h.em.at(T(-3.25, -3.9, FLOOR)):
        lantern(h, h.lo, h.em, 0.915)
    h.light((-3.25, -3.9, 1.7))
    h.put(drum, 3.3, -4.2)
    h.light((0, 1.5, 2.4))
    # outside
    h.put(haybale, 4.38, -3.6, 90, z=0)
    h.put(drum, -4.4, 3.8, z=0); h.put(drum, -4.4, 3.1, z=0, col=RUST[0])
    h.put(wheel, -4.3, 0.6, -90, z=0)
    h.put(crates, 3.1, -5.49, 0, z=0)
    h.put(firewood, -4.41, -3.9, 90, z=0)
    return h.finish(name="Barn")


def boathouse():
    """6 x 8 u at the raft landing: a board shed open to the water (front) on a plank deck with a jetty.
    Stilts run 1.9 u below the floor, so it can sit on a bank that drops into the sea."""
    h = House("boathouse", G, 205)
    st, th = "boat", STY["boat"]["th"]
    h.floor(-3, -4, 3, 4, "plank", along="y", skirt=0.16, depth=0.14)
    # the pier: real boards on two stringers, a kerb along the jetty edge, a ladder down to the water
    for i in range(9):
        y = -4.13 - 0.29 * i - 0.145
        h.lo.box(2.0 + h.r.uniform(-0.05, 0.12), 0.265, 0.08, (h.r.uniform(-0.03, 0.03), y, FLOOR - 0.114 + (0.008 if i % 2 else 0)), (0, 0, h.r.uniform(-1.5, 1.5)), col=pick(h.r, FLOOR_WOOD + WOOD_GREY[:2]), b=0, jit=0.06)
    for x in (-0.8, 0.8):
        h.lo.box(0.16, 2.75, 0.14, (x, -5.42, FLOOR - 0.23), col=WOOD_D[0], b=0)
    for x in (-2.02, 2.02):
        h.lo.box(1.92, 0.16, 0.13, (x, -3.98, FLOOR - 0.02), col=capcol(WOOD_D[1], 0.13, 0.8), b=0)
    for x in (-0.22, 0.22):
        h.lo.box(0.07, 0.07, 1.5, (x, -6.78, -1.4), col=WOOD_D[0], b=0)
    for k in range(4):
        h.lo.box(0.5, 0.05, 0.05, (0, -6.78, -1.2 + k * 0.36), col=WOOD[0], b=0)
    h.stilts([(x, y) for y in (-3.9, -2.0) for x in (-2.9, -1, 1, 2.9)] + [(x, y) for y in (-6.4, -5.2) for x in (-0.85, 0.85)])
    h.run((-3, -2), (3, -2), "ooo", st)
    h.run((3, -2), (3, 4), "pdp", st, doors={1: dict(id="boat_door")})
    h.run((3, 4), (-3, 4), "pwp", st)
    h.run((-3, 4), (-3, -2), "pwp", st)
    h.room(-3, -2, 3, 4)
    R, hf = h.gable(-3, -2, 3, 4, axis="y", style="plank", rise=1.7, ends=("boat", None), og=(1.1, 0.4), trim=TEAL, truss=True)
    g = h.rf()
    sign(g, "BOATS", (0, -3.16, H + 0.5), h=0.3, col=TEAL, ink=CREAM, th=0.06)       # hangs from the front barge boards
    for x in (-0.5, 0.5):
        g.box(0.04, 0.04, 1.7 * (1 - 0.5 / 3) + 0.08 - 0.72, (x, -3.13, H + 0.72), col=IRON, b=0)
    # inside
    h.put(boat, -0.95, 0.9, 90)
    h.put(workbench, 1.25, 3.5, 0, w=2.0)
    h.put(net_rack, -1.85, 3.6, 0, w=1.9)
    h.put(buoys, 2.3, -1.3, 20)
    h.put(coil, 2.35, -0.3)
    h.put(drum, 2.5, 2.55, col=TEAL_D)
    h.put(crate, 0.9, 2.5, 20, s=0.6, hgt=0.5)
    with h.lo.at(T(0.9, 2.5, FLOOR)), h.em.at(T(0.9, 2.5, FLOOR)):
        lantern(h, h.lo, h.em, 0.495)
    h.light((0.9, 2.5, 1.4))
    # the jetty
    for x, y in ((-2.85, -3.85), (2.85, -3.85), (-0.85, -6.45), (0.85, -6.45)):
        h.put(mooring, x, y)
    h.put(crates, 1.9, -3.1, 10, n=2)
    h.put(coil, -2.2, -3.15)
    h.put(bucket, -1.5, -2.6)
    h.lo.tube([(-2.85, -3.85, 0.62), (-2.0, -4.3, 0.2), (-1.0, -4.5, 0.12), (-0.85, -5.4, 0.2), (-0.85, -6.45, 0.62)], 0.035, ROPE, n=5)
    # landward
    h.put(drum, 3.42, 3.2, z=0); h.put(buoys, -3.33, 2.9, 90, z=0); h.put(coil, -3.46, -0.6, z=0)
    h.put(barrel, 3.42, -1.2, z=0)
    h.steps(3 + th / 2 + 0.05, 1, rz=90)
    return h.finish(name="Boathouse")


def radio_shack():
    """4 x 4 u: painted tin on a timber frame, mono-pitch roof with the mast. The door is steel and locked."""
    h = House("radio_shack", G, 206)
    st, th = "tin", STY["tin"]["th"]
    h.floor(-2, -2, 2, 2, "plank", skirt=0.16)
    h.run((-2, -2), (2, -2), "dw", st, doors={0: dict(id="radio_door", kind="steel", locked="radio_key")})
    h.run((2, -2), (2, 2), "pp", st)
    h.run((2, 2), (-2, 2), "pp", st)
    h.run((-2, 2), (-2, -2), "wp", st)
    h.room(-2, -2, 2, 2)
    zf = h.shed(-2, -2, 2, 2, style="tin", rise=0.95, pal=TIN + RUSTY + TIN_PAINT[:1])
    g, ge = h.rf(), h.rf("emissive")
    # the mast: lattice of three legs, a dipole, a beacon, guy wires down to the roof
    mx, my = 1.2, 1.15
    zb = zf(my) + 0.05
    top = zb + 4.6
    for k in range(3):
        a = 2 * pi * k / 3 + 0.5
        g.pole((mx + cos(a) * 0.22, my + sin(a) * 0.22, zb), (mx + cos(a) * 0.05, my + sin(a) * 0.05, top), 0.035, STEEL_L, n=5, b=0)
    for i in range(6):
        z = zb + 0.5 + i * 0.68
        rr = 0.22 - 0.17 * (z - zb) / (top - zb)
        g.cyl(rr + 0.035, 0.04, (mx, my, z), col=RED if i % 2 == 0 else CREAM, n=3, b=0, rot=(0, 0, 30))
    for z, w in ((top - 0.5, 1.5), (top - 1.1, 1.1), (top - 1.6, 0.8)):
        g.box(w, 0.04, 0.04, (mx, my, z), (0, 0, 35), col=STEEL_L, b=0)
    g.box(0.05, 0.05, 1.5, (mx, my, top - 1.7), col=STEEL_D, b=0)
    ge.ball(0.1, (mx, my, top + 0.08), col="#ff4a3a", n=6, m=4, jit=0)
    for ax, ay in ((-2.1, 2.0), (2.2, -2.2), (2.2, 2.2)):
        g.tube([(mx, my, top - 0.9), (ax, ay, zf(ay) + 0.12)], 0.014, "#3d3a40", n=3)
    # a dish on the low corner
    dx, dy = -1.1, -1.0
    dz = zf(dy) + 0.05
    g.pole((dx, dy, dz), (dx, dy, dz + 0.6), 0.05, STEEL_D, n=5, b=0)
    g.lathe([(0.0, 0.0), (0.3, 0.06), (0.52, 0.2), (0.5, 0.24), (0.28, 0.1), (0.0, 0.05)], (dx, dy, dz + 0.5), (40, 0, 30), col=CREAM, n=9)
    sign(g, "RADIO", (0.7, -2.3, zf(-2.3) + 0.52), h=0.36, col="#3d4a52", ink=YELLOW, th=0.07)
    for x in (0.05, 1.35):
        g.box(0.07, 0.07, 0.45, (x, -2.26, zf(-2.3) - 0.02), col=WOOD_D[0], b=0)
    # inside
    h.put(radio, 0.55, 1.5, 0)
    h.put(chair, 0.4, 0.75, 180)
    h.put(generator, -1.3, 1.6, 0)
    h.put(cabinet, 1.55, -0.6, -90)
    h.put(crate, -1.45, 0.4, 10, s=0.6, hgt=0.5)
    h.lo.tube([(-0.9, 1.55, FLOOR + 0.42), (-0.6, 1.2, FLOOR + 0.03), (-0.2, 1.0, FLOOR + 0.03), (0.0, 1.3, FLOOR + 0.3)], 0.022, "#2e2a30", n=4)
    h.rug(0.2, -0.5, 1.5, 1.0, "#667f4c", CREAM, rz=-5, stripes=2)
    # outside
    h.put(drum, -2.42, 1.0, z=0, col="#c9a13a"); h.put(drum, -2.42, 0.3, z=0, col=TEAL_D)
    h.put(crates, 2.51, -0.8, 90, z=0, n=2)
    h.put(bench, 1.0, -2.31, z=0, w=1.3)
    h.steps(-1, -2 - th / 2 - 0.05, w=1.5)
    return h.finish(name="Radio shack")


def build():
    guard_hut()
    cellblock()
    farmhouse()
    barn()
    boathouse()
    radio_shack()


REVIEW = dict(cols=3, cell=20, dist=95)
