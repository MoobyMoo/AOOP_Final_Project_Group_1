"""The roster: every kit gun, assembled from gk.py's parts. Fictional firearms, our own designs, no real make or model.

A gun is a function that fills a gk.Gun: parts into nodes (`frame` plus the moving part, the magazine and any extras),
the sockets, the flash point, and the few numbers the game needs in g.extras:
  moving   the node that cycles on a shot      travel   how far it goes, along -z (gun units)
  mag      the node that holds the ammunition  loose    nodes that can be hidden or swung away (own AO only)
  magKind  "tube", "cylinder" or "shells" when the magazine is not a box (a box extension cannot hang from those)
  swing    a moving part that turns instead of sliding: degrees about +x, at its pivot
Classes share a chassis function (ar_chassis, smg_chassis ...) that takes a style and returns where things ended up.
"""
from math import radians, sin, cos, pi
from mathutils import Vector
import gk
from gk import (M, BORE, Gun, slab, strap, band_slab, tube, disc, rod, bead, plate, saddle, rail_top, rail_under, barrel, magazine, mag_body, mag_foot,
                arc_path, pistol_grip, grip_wrap, trigger_guard, trigger, sight_post, sight_notch, sling_loop, round_top, port, scope, banana, medallion,
                rail_stub, stripe_facets, slide_shell,
                outline, prism, loft, lathe, box, add_box, bevel, bevel_all, cut, mirror_x, move, mk, rim)

GUNS = {}
def gun(gid, name, cls, tier):
    def reg(fn):
        GUNS[gid] = {"name": name, "cls": cls, "tier": tier, "fn": fn}
        return fn
    return reg

def both(ob):
    """a part and its mirror on the other flank"""
    return [ob, mirror_x(ob, ob.name + "_l")]

# ================================================================================================ assault rifles
def ar_receiver(mat, rear=-0.42, front=0.64, top=0.43, hw=0.095, well=(0.36, 0.62, 0.085), bev=0.012):
    """a stamped box receiver with a magazine well ahead of the trigger"""
    w0, w1, wy = well
    return slab("receiver", [(rear, 0.21, 0.03), (rear, top, 0.03), (front, top, 0.02), (front, 0.215, 0.02), (w1, 0.20), (w1, wy, 0.015), (w0, wy, 0.015), (w0, 0.17),
                             (rear + 0.07, 0.17, 0.04)], hw, mat, bev)

def bolt_side(z0, z1, y0, y1, travel, mat=M.steel, knob=M.dark, knob_r=0.022, knob_len=0.062, x_face=0.088):
    """the bolt carrier seen through the ejection port, with its charging handle sticking out of the right flank"""
    car = plate("carrier", (0.02, y0 + 0.006, z1 - (z1 - z0 - travel) + 0.01), (x_face, y1 - 0.006, z1 - 0.012), mat, 0.004)
    zc, yc = z1 - 0.05, (y0 + y1) / 2
    return [car, disc("handle", x_face - 0.02, x_face + knob_len, zc, yc, knob_r, knob, 8, 0.006)]

@gun("contraband_carbine", "Contraband Carbine", "ar", "mid")
def contraband_carbine(g):
    """Stocky carbine: dark stamped receiver, warm wood stock, handguard and grip, a 30-round curved magazine, a
    slotted rail on top. Signature: the customs evidence tag still tied to it, and the brass banana seal in the stock."""
    TOP = 0.495
    rec = ar_receiver(M.graphite)
    port(rec, 0.03, 0.45, 0.30, 0.395)
    g.add("frame", rec)
    g.add("bolt", bolt_side(0.03, 0.45, 0.30, 0.395, 0.17))
    g.add("frame", rail_top("rail", -0.30, 0.60, TOP, 0.12, M.gunmetal))
    g.add("frame", sight_notch("rear_sight", -0.355, 0.43, 0.10))
    # wood: stock, handguard, grip
    STOCK = [(-0.39, 0.405), (-0.93, 0.365, 0.035), (-0.955, 0.0, 0.05), (-0.80, 0.012, 0.06), (-0.39, 0.215)]
    g.add("frame", slab("stock", STOCK, 0.068, M.wood, 0.024, 2), band_slab("butt", STOCK, 0.068, -1.0, -0.925, M.steel, 0.006, 0.0, 0.02))
    HG = [(0.625, 0.235), (0.625, 0.425, 0.02), (1.12, 0.415, 0.035), (1.12, 0.235, 0.03)]
    hg = slab("handguard", HG, 0.088, M.wood, 0.022, 2)
    slots = gk.bmesh.new()
    for sx in (-1, 1):
        for zc in (0.76, 0.89, 1.02):
            add_box(slots, (sx * 0.088, 0.345, zc), (0.012, 0, 0), (0, 0.016, 0), (0, 0, 0.04), M.dark)
    cut(hg, mk("hg_cut", slots))
    g.add("frame", hg, band_slab("hg_band", HG, 0.088, 1.085, 1.14, M.gunmetal, 0.005, 0.0, 0.02))
    g.add("frame", pistol_grip("grip", M.wood), trigger_guard("guard", M.graphite), trigger("trigger", M.gold))
    # barrel, gas block and front sight
    g.add("frame", barrel("barrel", 0.60, 1.42, 0.046, BORE))
    g.add("frame", tube("gas_block", [(1.21, 0), (1.21, 0.066), (1.28, 0.066), (1.28, 0)], BORE, M.gunmetal, 8),
          plate("fs_tower", (-0.02, BORE + 0.04, 1.215), (0.02, BORE + 0.15, 1.275), M.gunmetal, 0.005),
          sight_post("front_sight", 1.245, BORE + 0.15, 0.055, M.gold, 0.012, 0.05))
    g.add("frame", rail_under("rail_under", 0.94, 0.196, M.graphite))
    # magazine
    parts, at = magazine("mag", arc_path(0.49, 0.17, 0.50, 0.06, 0.42), 0.235, 0.056, M.gunmetal, M.graphite, round_at=(0.47, 0.19))
    g.add("mag", parts, plate("mag_rib", (-0.062, -0.14, 0.50), (0.062, -0.10, 0.60), M.gunmetal, 0.006))
    g.socket("socket_mag", at, "mag")
    # small parts
    g.add("frame", slab("selector", [(-0.03, 0.218), (0.13, 0.226), (0.13, 0.250), (-0.03, 0.262)], 0.008, M.gold, 0.003, 1, 1, -0.098))
    for z, y in ((-0.30, 0.25), (0.56, 0.30)):
        g.add("frame", both(disc("pin", 0.07, 0.100, z, y, 0.014, M.steel, 6)))
    g.add("frame", slab("stripe", [(-0.36, 0.268), (0.60, 0.268), (0.60, 0.282), (-0.36, 0.282)], 0.004, M.gold, 0.0, 1, 1, -0.0975))
    g.add("frame", both(medallion("seal", -0.66, 0.20, 0.068, 1, 0.052, M.gold, M.enamel, 0.03, 10)), both(banana("seal_banana", -0.66, 0.20, 0.07, 0.0795, M.gold, 1.05)))
    g.add("frame", sling_loop("loop_rear", -0.80, 0.02), sling_loop("loop_front", 1.18, BORE - 0.04, M.steel, 0.026))
    # the evidence tag: a string from the rear loop, an ivory tag with a red band
    g.add("frame", rod("tag_string", (0.0, -0.045, -0.80), (0.0, -0.13, -0.77), 0.005, M.ivorycut, 4),
          plate("tag", (-0.005, -0.25, -0.80), (0.005, -0.12, -0.71), M.ivory, 0.0), plate("tag_band", (-0.008, -0.235, -0.803), (0.008, -0.205, -0.707), M.red, 0.0))
    g.socket("socket_sight", (0, TOP, 0.12))
    g.muzzle((0, BORE, 1.42))
    g.socket("socket_rail", (0, 0.196, 0.94))
    g.socket("socket_grip", (0, 0.235, 0.70))
    g.socket("socket_stock", (0, 0.31, -0.42))
    g.point("eject", (0.12, 0.35, 0.26))
    g.extras.update(moving="bolt", travel=0.17, mag="mag")


# ================================================================================================ submachine guns
@gun("cash_flow", "Cash Flow", "smg", "mid")
def cash_flow(g):
    """Clean compact SMG: a two-tone boxy receiver, a grooved barrel shroud, a straight stick magazine, a strut stock.
    Signature: a brass money clip of banknotes on the left flank."""
    TOP = 0.485
    up = slab("upper", [(-0.40, 0.235, 0.03), (-0.40, 0.42, 0.045), (0.50, 0.42, 0.02), (0.565, 0.36, 0.02), (0.565, 0.235, 0.02)], 0.084, M.gunmetal, 0.012)
    port(up, 0.04, 0.40, 0.31, 0.39, 0.052)
    g.add("frame", up, slab("lower", [(-0.36, 0.165, 0.03), (-0.36, 0.275), (0.60, 0.275), (0.60, 0.19), (0.585, 0.09, 0.015), (0.37, 0.09, 0.015), (0.37, 0.165)], 0.092, M.graphite, 0.010))
    g.add("bolt", bolt_side(0.04, 0.40, 0.31, 0.39, 0.14, M.steel, M.gold, 0.020, 0.05, 0.078),
          disc("handle_l", -0.06, -0.135, 0.34, 0.35, 0.020, M.gold, 8, 0.006))
    g.add("frame", plate("slot_l", (-0.092, 0.335, 0.16), (-0.07, 0.365, 0.40), M.dark, 0.0))
    g.add("frame", rail_top("rail", -0.24, 0.46, TOP, 0.11, M.graphite), sight_notch("rear_sight", -0.32, 0.42, 0.105))
    # barrel and its shroud: three dark cooling grooves, a gold band at the front
    R = 0.072
    prof, mats = [(0.54, 0), (0.54, R)], [M.gunmetal]
    for zc in (0.60, 0.66, 0.72):
        prof += [(zc - 0.017, R), (zc - 0.013, R - 0.012), (zc + 0.013, R - 0.012), (zc + 0.017, R)]; mats += [M.gunmetal, M.dark, M.dark, M.dark]
    prof += [(0.775, R), (0.779, R + 0.006), (0.815, R + 0.006), (0.819, R), (0.83, R - 0.012), (0.83, 0)]; mats += [M.gunmetal, M.gold, M.gold, M.gold, M.gunmetal, M.gunmetal]
    g.add("frame", tube("shroud", prof, BORE, mats, 12), barrel("barrel", 0.80, 0.96, 0.042, BORE))
    g.add("frame", plate("fs_base", (-0.02, BORE + 0.05, 0.775), (0.02, BORE + 0.125, 0.82), M.gunmetal, 0.004), sight_post("front_sight", 0.80, BORE + 0.125, 0.065, M.gold, 0.012, 0.04))
    g.add("frame", plate("rail_block", (-0.056, BORE - 0.092, 0.59), (0.056, BORE - 0.05, 0.80), M.graphite, 0.004), rail_under("rail_under", 0.70, BORE - 0.131, M.graphite))
    g.add("frame", pistol_grip("grip", M.rubber), trigger_guard("guard", M.graphite, z1=0.40, y_top=0.18), trigger("trigger", M.gold))
    # strut stock with a rubber pad
    g.add("frame", strap("stock", [(-0.37, 0.372), (-0.83, 0.372, 0.05), (-0.83, 0.02, 0.05), (-0.34, 0.20)], 0.036, 0.030, M.gunmetal),
          plate("butt", (-0.046, -0.02, -0.875), (0.046, 0.41, -0.835), M.rubber, 0.012))
    parts, at = magazine("mag", [(0.475, 0.17), (0.49, -0.40)], 0.165, 0.050, M.steel, M.gunmetal, round_at=(0.47, 0.185))
    g.add("mag", parts)
    g.socket("socket_mag", at, "mag")
    for sx in (-1, 1):                                              # witness holes
        for y in (-0.10, -0.19, -0.28):
            g.add("mag", plate("witness", (sx * 0.0505 - 0.004, y - 0.012, 0.47 - y * 0.026), (sx * 0.0505 + 0.004, y + 0.012, 0.50 - y * 0.026), M.dark, 0.0))
    # the money clip: a wad of notes under a brass clip, left flank
    g.add("frame", plate("bills", (-0.118, 0.215, -0.31), (-0.086, 0.345, -0.06), M.bill, 0.005), plate("bill_band", (-0.123, 0.21, -0.215), (-0.09, 0.35, -0.155), M.ivory, 0.0),
          prism("clip", [(-0.132, 0.24), (-0.121, 0.24), (-0.121, 0.368), (-0.08, 0.368), (-0.08, 0.386), (-0.126, 0.386), (-0.132, 0.38)], -0.205, -0.165, "z", M.brass))
    g.add("frame", both(disc("pin", 0.07, 0.097, -0.28, 0.215, 0.014, M.steel, 6)), slab("selector", [(-0.02, 0.20), (0.12, 0.208), (0.12, 0.232), (-0.02, 0.244)], 0.008, M.gold, 0.0, 1, 1, -0.095))
    g.socket("socket_sight", (0, TOP, 0.11))
    g.muzzle((0, BORE, 0.96))
    g.socket("socket_rail", (0, BORE - 0.131, 0.70))
    g.socket("socket_stock", (0, 0.30, -0.40))
    g.point("eject", (0.11, 0.35, 0.24))
    g.extras.update(moving="bolt", travel=0.14, mag="mag")

# ================================================================================================ shotguns
SG_BORE, SG_TUBE = 0.385, 0.255
def long_stock(mat, hw=0.072, bev=0.028, front=None, drop=0.0):
    """the one-piece rifle stock: the wrist passes through the firing hand, a comb, a butt. `front`: the profile points
    that carry on forward under the action (a forearm), else it ends under the receiver's tail."""
    S = [(-0.24, 0.36), (-0.40, 0.30, 0.06), (-0.58, 0.16 - drop, 0.10), (-0.74, 0.22, 0.12), (-1.06, 0.20, 0.04), (-1.08, -0.24, 0.05), (-0.72, -0.15, 0.25),
         (-0.44, -0.205, 0.07), (-0.29, -0.205, 0.05), (-0.04, 0.06, 0.06)] + (front or [(0.0, 0.20)])
    return S, slab("stock", S, hw, mat, bev, 2)

@gun("coconut_cracker", "Coconut Cracker", "shotgun", "mid")
def coconut_cracker(g):
    """Chunky pump gun: a fat barrel over a tube magazine, a ribbed pump, a coconut-brown stock, a brass bead.
    Signature: the butt is a coconut, three eyes and all, bound on with coir."""
    TOP = 0.50
    rec = slab("receiver", [(-0.30, 0.22, 0.04), (-0.33, 0.36, 0.05), (-0.20, 0.455, 0.06), (0.54, 0.455, 0.02), (0.54, 0.175, 0.03), (0.02, 0.165, 0.03)], 0.092, M.gunmetal, 0.014)
    port(rec, 0.10, 0.36, 0.33, 0.41, 0.06)
    g.add("frame", rec, plate("bolt_face", (0.03, 0.337, 0.11), (0.084, 0.403, 0.35), M.steel, 0.004))
    g.add("frame", saddle("sight_base", -0.14, 0.30, TOP, M.graphite))
    g.add("frame", slab("stripe", [(-0.18, 0.268), (0.52, 0.268), (0.52, 0.282), (-0.18, 0.282)], 0.004, M.gold, 0.0, 1, 1, -0.0945))
    g.add("frame", barrel("barrel", 0.50, 1.44, 0.070, SG_BORE, M.gunmetal), bead("bead", (0, SG_BORE + 0.082, 1.34), 0.026, M.brass, "z", 6),
          plate("bead_base", (-0.016, SG_BORE + 0.05, 1.31), (0.016, SG_BORE + 0.078, 1.37), M.gunmetal, 0.0))
    # the magazine tube, a brass cap, and the clamp that ties it to the barrel
    g.add("tube", tube("tube", [(0.50, 0), (0.50, 0.054), (1.262, 0.054), (1.262, 0.060), (1.30, 0.060), (1.312, 0.050), (1.312, 0)], SG_TUBE, [M.steel, M.steel, M.brass, M.brass, M.brass, M.brass], 10))
    g.add("frame", slab("clamp", [(1.13, SG_TUBE - 0.03), (1.13, SG_BORE + 0.03, 0.03), (1.20, SG_BORE + 0.03, 0.03), (1.20, SG_TUBE - 0.03)], 0.072, M.gunmetal, 0.02))
    g.add("frame", plate("rail_block", (-0.056, SG_TUBE - 0.092, 1.085), (0.056, SG_TUBE - 0.04, 1.30), M.graphite, 0.004), rail_under("rail_under", 1.19, SG_TUBE - 0.131, M.graphite))
    # the pump: a ribbed sleeve round the tube, two action bars back into the receiver
    PR = 0.088
    prof, mats = [(0.63, 0), (0.63, PR - 0.02), (0.65, PR)], [M.coconut, M.coconut]
    for i in range(5):
        z = 0.675 + i * 0.07
        prof += [(z, PR), (z + 0.005, PR - 0.013), (z + 0.027, PR - 0.013), (z + 0.032, PR)]; mats += [M.coconut, M.dark, M.dark, M.dark]
    prof += [(1.03, PR), (1.05, PR - 0.02), (1.05, 0)]; mats += [M.coconut, M.coconut, M.coconut]
    fe = tube("pump", prof, SG_TUBE, mats, 10)
    g.add("fore_end", fe, both(rod("action_bar", (0.072, SG_TUBE + 0.075, 0.47), (0.072, SG_TUBE + 0.06, 0.70), 0.011, M.steel, 4)))
    # stock: coconut wood, coir lashing at the wrist, the coconut butt
    S, st = long_stock(M.coconut)
    g.add("frame", st, band_slab("lashing", S, 0.072, -0.50, -0.43, M.coir, 0.006, -0.5, 0.028, 2), band_slab("butt", S, 0.072, -1.2, -0.985, M.coir, 0.008, 0.0, 0.03, 2))
    # the coconut: set through the butt, proud on both flanks, three eyes a side
    CZ, CY, CR = -0.86, -0.015, 0.155
    g.add("frame", lathe("coconut", [(-CR, 0), (-CR * 0.86, CR * 0.52), (-CR * 0.5, CR * 0.87), (0, CR), (CR * 0.5, CR * 0.87), (CR * 0.86, CR * 0.52), (CR, 0)], CZ, CY, "x", 10, [M.coir] * 6, 0.0))
    for dz, dy in ((0.0, 0.045), (-0.04, -0.025), (0.04, -0.025)):
        g.add("frame", both(disc("eye", CR - 0.03, CR - 0.002 - 0.012 * abs(dz) / 0.04 - (0.004 if dy > 0 else 0), CZ + dz, CY + dy, 0.017, M.dark, 6)))
    g.add("frame", trigger_guard("guard", M.gunmetal, -0.17, 0.40, 0.18, -0.07), trigger("trigger", M.gold, 0.25, 0.14))
    g.add("frame", both(disc("pin", 0.07, 0.098, 0.44, 0.23, 0.015, M.steel, 6)), disc("safety", 0.07, 0.102, -0.10, 0.30, 0.02, M.red, 8, 0.004))
    g.socket("socket_sight", (0, TOP, 0.09))
    g.muzzle((0, SG_BORE, 1.44))
    g.socket("socket_mag", (0, SG_TUBE, 1.312), "tube")
    g.socket("socket_rail", (0, SG_TUBE - 0.131, 1.19))
    g.socket("socket_stock", (0, 0.28, -0.30))
    g.point("eject", (0.12, 0.37, 0.23))
    g.extras.update(moving="fore_end", travel=0.15, mag="tube", magKind="tube")

# ================================================================================================ sniper rifles
def bolt_action(g, z_root=-0.30, travel=0.22, knob=M.steel, body=M.steel, lift=55.0, r=0.036):
    """the bolt: a shroud behind the receiver, a handle out to the right and down, a ball knob. It turns up about the
    bore (`boltLift` degrees about +z), then draws back `travel`."""
    g.add("bolt_handle", tube("bolt", [(z_root - 0.07, 0), (z_root - 0.07, r * 0.8), (z_root - 0.05, r), (z_root + 0.26, r), (z_root + 0.26, 0)], BORE, body, 8),
          rod("handle", (0.02, BORE - 0.005, z_root), (0.165, BORE - 0.105, z_root - 0.02), 0.014, body, 6), bead("knob", (0.18, BORE - 0.118, z_root - 0.022), 0.034, knob, "x", 8))
    g.pivot("bolt_handle", (0, BORE, 0))
    g.extras.update(moving="bolt_handle", travel=travel, boltLift=lift)

def abacus(g, x, y, z0, z1, beads, rod_mat=M.brass, r=0.024):
    """a counting rod: a brass rail on two posts with beads strung along it"""
    s = 1 if x > 0 else -1
    g.add("frame", rod("abacus_rod", (x, y, z0), (x, y, z1), 0.008, rod_mat, 4))
    for z in (z0 + 0.004, z1 - 0.004):
        g.add("frame", rod("abacus_post", (x - s * 0.045, y, z), (x + s * 0.006, y, z), 0.011, rod_mat, 4))
    for z, mat in beads:
        g.add("frame", bead("abacus_bead", (x, y, z), r, mat, "z", 6, 0.8))

@gun("bean_counter", "Bean Counter", "sniper", "mid")
def bean_counter(g):
    """Scoped bolt hunting rifle: a one-piece wood stock, a round blued action, a long tapered barrel, a plain scope.
    Signature: an abacus rod on the butt, coffee-bean beads for counting."""
    TOP = 0.435
    S, st = long_stock(M.wood, front=[(0.06, 0.10, 0.05), (0.50, 0.135, 0.2), (1.02, 0.145, 0.04), (1.02, 0.295, 0.03), (-0.20, 0.295)])
    g.add("frame", st, band_slab("butt", S, 0.072, -1.2, -1.035, M.rubber, 0.006, 0.0, 0.03, 2), band_slab("tip", S, 0.072, 0.955, 1.1, M.walnut, 0.005, 0.0, 0.028, 2))
    g.add("frame", tube("action", [(-0.28, 0), (-0.28, 0.058), (-0.265, 0.068), (0.44, 0.068), (0.47, 0.052), (0.47, 0)], BORE, M.blued, 10),
          saddle("scope_base", -0.24, 0.40, TOP, M.blued, 0.06))
    g.add("frame", barrel("barrel", 0.44, 1.86, 0.050, BORE, M.blued, 10, [(1.0, 0.044)]))
    bolt_action(g)
    g.add("frame", plate("port", (0.045, BORE - 0.012, -0.02), (0.072, BORE + 0.042, 0.24), M.dark, 0.0))
    g.add("scope_builtin", scope("scope", 0.08, TOP + 0.115, 0.86, base_y=TOP, rings=(-0.17, 0.15), ring_mat=M.steel, body=M.gunmetal))
    parts, at = magazine("mag", [(0.50, 0.21), (0.50, 0.075)], 0.20, 0.046, M.blued, M.blued)
    g.add("mag", parts)
    g.socket("socket_mag", at, "mag")
    g.add("frame", trigger_guard("guard", M.blued, -0.17, 0.38, 0.14, -0.075), trigger("trigger", M.gold, 0.23, 0.115))
    g.add("frame", rail_under("rail_under", 0.76, 0.097, M.blued), sling_loop("loop_rear", -0.86, -0.17), sling_loop("loop_front", 0.56, 0.138, M.steel, 0.024))
    BEADS = [M.red, M.wood_red, M.ivory, M.wood_red, M.red]
    for sx in (-1, 1):
        abacus(g, sx * 0.098, 0.03, -1.0, -0.60, [(-0.945 + 0.062 * i + (0.06 if i > 2 else 0), m) for i, m in enumerate(BEADS)], M.brass, 0.036)
    g.socket("socket_sight", (0, TOP, 0.08))
    g.muzzle((0, BORE, 1.86))
    g.socket("socket_rail", (0, 0.097, 0.76))
    g.socket("socket_stock", (0, 0.25, -0.28))
    g.point("eject", (0.10, BORE + 0.02, 0.11))
    g.extras.update(mag="mag", loose=["scope_builtin"], builtinSight="scope_builtin")

# ================================================================================================ light machine guns
@gun("hostile_takeover", "Hostile Takeover", "lmg", "high")
def hostile_takeover(g):
    """The corporate raider: a deep receiver under a gold-edged feed cover, a finned heavy barrel, a carry handle, a
    folded bipod, a walnut grip and cheek. Signature: it feeds from a briefcase."""
    TOP = 0.535
    rec = slab("receiver", [(-0.46, 0.20, 0.03), (-0.46, 0.44, 0.03), (0.80, 0.44, 0.02), (0.80, 0.20, 0.03), (-0.36, 0.165, 0.04)], 0.100, M.gunmetal, 0.013)
    port(rec, 0.05, 0.50, 0.29, 0.385)
    g.add("frame", rec, slab("cover", [(-0.40, 0.42), (-0.40, 0.475, 0.02), (0.56, 0.475, 0.03), (0.60, 0.42)], 0.090, M.graphite, 0.012),
          slab("cover_trim", [(-0.38, 0.436), (0.57, 0.436), (0.57, 0.452), (-0.38, 0.452)], 0.094, M.gold, 0.0))
    g.add("bolt", bolt_side(0.05, 0.50, 0.29, 0.385, 0.18, M.steel, M.gold, 0.024, 0.07, 0.093))
    g.add("frame", rail_top("rail", -0.34, 0.40, TOP, 0.03, M.gunmetal), sight_notch("rear_sight", -0.42, 0.44, 0.13, M.dark, 0.05))
    # heavy barrel: cooling fins, a gas tube under it, a hooded front sight
    R = 0.060
    prof, mats = [(0.78, 0), (0.78, R + 0.02), (0.86, R + 0.02), (0.87, R)], [M.gunmetal] * 3
    for i in range(6):
        z = 0.90 + i * 0.062
        prof += [(z, R), (z + 0.004, R + 0.022), (z + 0.026, R + 0.022), (z + 0.030, R)]; mats += [M.steel, M.steel, M.steel, M.steel]
    prof += [(1.30, R), (1.30, 0.038)]; mats += [M.steel, M.steel]
    g.add("frame", tube("barrel_root", prof + [(1.315, 0.038), (1.315, 0)], BORE, mats + [M.steel, M.steel], 10), barrel("barrel", 1.285, 1.78, 0.052, BORE, M.steel, 10))
    g.add("frame", tube("gas_tube", [(0.765, 0), (0.765, 0.032), (1.50, 0.032), (1.50, 0)], BORE - 0.095, M.gunmetal, 6),
          slab("gas_block", [(1.46, BORE - 0.13), (1.46, BORE + 0.075, 0.02), (1.56, BORE + 0.075, 0.02), (1.56, BORE - 0.13)], 0.06, M.gunmetal, 0.012),
          plate("fs_tower", (-0.018, BORE + 0.06, 1.48), (0.018, BORE + 0.16, 1.54), M.gunmetal, 0.004), sight_post("front_sight", 1.51, BORE + 0.16, 0.05, M.gold, 0.012, 0.04))
    # carry handle: an arch over the barrel root with a walnut grip
    g.add("frame", strap("handle", [(0.60, 0.46), (0.63, 0.70, 0.05), (0.98, 0.70, 0.05), (1.01, BORE + 0.03)], 0.034, 0.022, M.gunmetal),
          tube("handle_grip", [(0.70, 0), (0.70, 0.036), (0.91, 0.036), (0.91, 0)], 0.70, M.walnut, 8))
    # forearm under the barrel root, with the rail
    g.add("frame", slab("forearm", [(0.80, 0.19, 0.02), (0.80, 0.30), (1.26, 0.30), (1.26, 0.19, 0.03)], 0.082, M.walnut, 0.02, 2), rail_under("rail_under", 1.03, 0.151, M.graphite))
    # bipod, folded back along the forearm; the hinge is on the gas block
    H = (0.0, BORE - 0.105, 1.51)
    bip = [plate("yoke", (-0.105, H[1] - 0.028, 1.475), (0.105, H[1] + 0.022, 1.545), M.gunmetal, 0.006)]
    for sx in (-1, 1):
        bip += [rod("leg", (sx * 0.097, H[1], 1.50), (sx * 0.103, H[1] + 0.012, 0.86), 0.015, M.steel, 6),
                plate("foot", (sx * 0.103 - 0.022, H[1] - 0.012, 0.82), (sx * 0.103 + 0.022, H[1] + 0.036, 0.875), M.rubber, 0.005)]
    g.add("bipod", bip)
    g.pivot("bipod", H)
    g.add("frame", pistol_grip("grip", M.walnut, 0.0, 0.18, 0.082), trigger_guard("guard", M.gunmetal), trigger("trigger", M.gold, 0.25, 0.17))
    # stock: a steel frame, a walnut cheek, a rubber pad
    g.add("frame", strap("stock", [(-0.43, 0.395), (-1.0, 0.395, 0.05), (-1.0, 0.0, 0.06), (-0.40, 0.20)], 0.042, 0.036, M.gunmetal),
          slab("cheek", [(-0.50, 0.392), (-0.50, 0.452, 0.03), (-0.90, 0.452, 0.03), (-0.90, 0.392)], 0.052, M.walnut, 0.018, 2),
          plate("butt", (-0.052, -0.04, -1.05), (0.052, 0.44, -1.005), M.rubber, 0.012))
    # the briefcase: black case, gold corners and clasps, a handle on top, and a belt up into the feed tray
    C0, C1, CY0, CY1, CW = 0.43, 0.87, -0.20, 0.135, 0.085
    case = [plate("case", (-CW, CY0, C0), (CW, CY1, C1), M.dark, 0.014),
            slab("case_seam", [(C0 - 0.004, 0.02), (C1 + 0.004, 0.02), (C1 + 0.004, 0.038), (C0 - 0.004, 0.038)], CW + 0.004, M.gold, 0.0)]
    for sz, z in ((-1, C0), (1, C1)):                              # corner caps, 6 mm proud of the case all round
        for sy, y in ((-1, CY0), (1, CY1)):
            za, zb, ya, yb = z + sz * 0.006, z - sz * 0.06, y + sy * 0.006, y - sy * 0.05
            case.append(plate("corner", (-CW - 0.006, min(ya, yb), min(za, zb)), (CW + 0.006, max(ya, yb), max(za, zb)), M.gold, 0.006))
    for z in (0.54, 0.76):
        case += both(plate("clasp", (CW - 0.004, -0.005, z - 0.025), (CW + 0.012, 0.075, z + 0.025), M.gold, 0.004))
    parts = case + [mag_foot("case_foot", 0.65, CY0 + 0.016, M.graphite, 0.17, 0.07)]
    for i in range(5):                                              # the belt, left side, climbing to the feed tray
        y, x = 0.15 + i * 0.045, -0.105 - 0.012 * sin(i * 0.8)
        parts += [rod("belt_case", (x, y, 0.56), (x, y, 0.67), 0.022, M.brass, 6), rod("belt_tip", (x, y, 0.665), (x, y, 0.715), 0.019, M.copper, 6, 0.006)]
    parts.append(plate("belt_chute", (-0.125, 0.10, 0.545), (-0.08, 0.17, 0.73), M.graphite, 0.006))
    g.add("box_mag", parts)
    g.socket("socket_mag", (0, CY0 + 0.016, 0.65), "box_mag")
    g.add("frame", plate("feed_tray", (-0.135, 0.33, 0.53), (-0.09, 0.40, 0.745), M.graphite, 0.006))
    g.socket("socket_sight", (0, TOP, 0.03))
    g.muzzle((0, BORE, 1.78))
    g.socket("socket_rail", (0, 0.151, 1.03))
    g.socket("socket_grip", (0, 0.19, 0.90))
    g.socket("socket_stock", (0, 0.31, -0.46))
    g.point("eject", (0.125, 0.34, 0.28))
    g.extras.update(moving="bolt", travel=0.18, mag="box_mag", loose=["bipod"], bipodDeploy=-100.0)


@gun("insider_trader", "Insider Trader", "smg", "high")
def insider_trader(g):
    """Integrally suppressed premium SMG: a polished receiver, a fat suppressor in pinstripes with gold bands, a walnut
    grip and cheek. Signature: the red wax seal on its flank, ribbons and all. Strictly confidential."""
    TOP, R = 0.49, 0.092
    GM, Au = M.gunmetal, M.gold
    up = slab("upper", [(-0.42, 0.235, 0.03), (-0.42, 0.425, 0.05), (0.52, 0.425, 0.03), (0.56, 0.235, 0.02)], 0.086, GM, 0.014)
    port(up, 0.04, 0.40, 0.31, 0.39, 0.054)
    g.add("frame", up, slab("lower", [(-0.38, 0.165, 0.03), (-0.38, 0.275), (0.60, 0.275), (0.60, 0.19), (0.585, 0.09, 0.015), (0.37, 0.09, 0.015), (0.37, 0.165)], 0.094, M.blued, 0.010))
    g.add("bolt", bolt_side(0.04, 0.40, 0.31, 0.39, 0.14, M.steel, Au, 0.020, 0.05, 0.080))
    g.add("frame", rail_top("rail", -0.30, 0.50, TOP, 0.10, GM), sight_notch("rear_sight", -0.37, 0.425, 0.105))
    for sx, z0 in ((-1, -0.115), (1, -0.36)):                      # the left one starts clear of the seal
        g.add("frame", slab("stripe", [(z0, 0.286), (0.54, 0.286), (0.54, 0.298), (z0, 0.298)], 0.004, Au, 0.0, 1, 1, sx * 0.0885))
    # the suppressor: gold bands at both ends, four pinstripes down its length, the crown poking out of its face
    prof = [(0.50, 0), (0.50, R - 0.02), (0.52, R), (0.555, R), (0.559, R + 0.007), (0.60, R + 0.007), (0.604, R), (1.06, R), (1.064, R + 0.007), (1.105, R + 0.007),
            (1.109, R), (1.13, R), (1.15, R - 0.02), (1.15, 0)]
    g.add("frame", tube("suppressor", prof, BORE, [GM, GM, GM, Au, Au, Au, GM, Au, Au, Au, GM, GM, GM], 12), barrel("crown", 1.13, 1.215, 0.042, BORE))
    for deg in (30, 150, 210, 330):
        a = radians(deg); x, y = cos(a) * R * 0.966, BORE + sin(a) * R * 0.966
        g.add("frame", rod("pinstripe", (x, y, 0.625), (x, y, 1.04), 0.006, Au, 4))
    g.add("frame", plate("fs_base", (-0.018, BORE + 0.075, 1.0), (0.018, BORE + 0.135, 1.045), GM, 0.004), sight_post("front_sight", 1.025, BORE + 0.135, 0.06, Au, 0.012, 0.04))
    g.add("frame", plate("rail_block", (-0.056, BORE - 0.125, 0.63), (0.056, BORE - 0.07, 0.84), M.blued, 0.004), rail_under("rail_under", 0.735, BORE - 0.164, M.blued))
    g.add("frame", pistol_grip("grip", M.walnut), trigger_guard("guard", M.blued, z1=0.40, y_top=0.18), trigger("trigger", Au))
    g.add("frame", strap("stock", [(-0.39, 0.378), (-0.86, 0.378, 0.05), (-0.86, 0.02, 0.05), (-0.36, 0.20)], 0.038, 0.032, GM),
          slab("cheek", [(-0.46, 0.375), (-0.46, 0.432, 0.03), (-0.78, 0.432, 0.03), (-0.78, 0.375)], 0.046, M.walnut, 0.016, 2),
          plate("butt", (-0.05, -0.02, -0.905), (0.05, 0.415, -0.865), M.rubber, 0.012))
    parts, at = magazine("mag", [(0.475, 0.17), (0.49, -0.46)], 0.165, 0.050, M.blued, Au, round_at=(0.47, 0.185))
    g.add("mag", parts)
    g.socket("socket_mag", at, "mag")
    # the wax seal, left flank: a red disc with a gold stamp, two ribbon tails
    g.add("frame", medallion("seal", -0.20, 0.31, -0.086, -1, 0.062, M.red, M.red, 0.012, 10), disc("seal_stamp", -0.079, -0.0945, -0.20, 0.31, 0.027, Au, 8),
          slab("ribbon_a", [(-0.235, 0.265), (-0.195, 0.265), (-0.215, 0.13), (-0.235, 0.155), (-0.262, 0.14)], 0.004, M.red, 0.0, 1, 1, -0.096),
          slab("ribbon_b", [(-0.205, 0.258), (-0.165, 0.258), (-0.135, 0.145), (-0.16, 0.165), (-0.185, 0.14)], 0.004, M.red, 0.0, 1, 1, -0.1005))
    g.add("frame", both(disc("pin", 0.07, 0.099, -0.30, 0.215, 0.014, Au, 6)), slab("selector", [(-0.02, 0.20), (0.12, 0.208), (0.12, 0.232), (-0.02, 0.244)], 0.008, Au, 0.0, 1, 1, -0.097))
    g.socket("socket_sight", (0, TOP, 0.10))
    g.muzzle((0, BORE, 1.215))
    g.socket("socket_rail", (0, BORE - 0.164, 0.735))
    g.socket("socket_stock", (0, 0.30, -0.42))
    g.point("eject", (0.11, 0.35, 0.24))
    g.extras.update(moving="bolt", travel=0.14, mag="mag")

@gun("board_meeting", "Board Meeting", "ar", "high")
def board_meeting(g):
    """Premium rifle: a polished receiver, a full-length top rail over a blued handguard, walnut stock and grip, gold
    pinstripes and bands, no iron sights to spoil the optic. Signature: the charging handle is a chairman's gavel,
    and the stock carries his brass nameplate."""
    TOP, Au = 0.495, M.gold
    rec = ar_receiver(M.gunmetal)
    port(rec, 0.03, 0.45, 0.30, 0.395)
    g.add("frame", rec)
    g.add("bolt", bolt_side(0.03, 0.45, 0.30, 0.395, 0.17, M.steel, Au, 0.015, 0.06),
          tube("gavel", [(0.345, 0), (0.345, 0.030), (0.357, 0.037), (0.369, 0.030), (0.431, 0.030), (0.443, 0.037), (0.455, 0.030), (0.455, 0)], 0.3475,
               [M.walnut, Au, Au, M.walnut, Au, Au, M.walnut], 8, 0.165))
    HG = [(0.625, 0.235), (0.625, 0.425, 0.02), (1.24, 0.425, 0.03), (1.24, 0.235, 0.03)]
    hg = slab("handguard", HG, 0.086, M.blued, 0.02, 2)
    slots = gk.bmesh.new()
    for sx in (-1, 1):
        for zc in (0.80, 0.94, 1.08):
            add_box(slots, (sx * 0.086, 0.34, zc), (0.012, 0, 0), (0, 0.014, 0), (0, 0, 0.045), M.dark)
    cut(hg, mk("hg_cut", slots))
    g.add("frame", hg, band_slab("hg_ring", HG, 0.086, 0.655, 0.695, Au, 0.004, 0.0, 0.02), band_slab("hg_ring", HG, 0.086, 1.175, 1.215, Au, 0.004, 0.0, 0.02))
    g.add("frame", rail_top("rail", -0.32, 1.20, TOP, 0.12, M.gunmetal))
    g.add("frame", plate("bus_rear", (-0.032, TOP - 0.004, -0.305), (0.032, TOP + 0.028, -0.235), M.dark, 0.006), plate("bus_front", (-0.032, TOP - 0.004, 1.10), (0.032, TOP + 0.028, 1.17), M.dark, 0.006))
    g.add("frame", barrel("barrel", 0.60, 1.60, 0.046, BORE), tube("muzzle_ring", [(1.44, 0), (1.44, 0.062), (1.50, 0.062), (1.50, 0)], BORE, Au, 10))
    g.add("frame", rail_under("rail_under", 1.0, 0.196, M.gunmetal))
    STOCK = [(-0.39, 0.405), (-0.98, 0.395, 0.03), (-1.0, -0.04, 0.05), (-0.86, -0.04, 0.05), (-0.74, 0.15, 0.08), (-0.39, 0.205)]
    g.add("frame", slab("stock", STOCK, 0.07, M.walnut, 0.024, 2), band_slab("butt", STOCK, 0.07, -1.1, -0.965, M.rubber, 0.006, 0.0, 0.024, 2),
          slab("cheek", [(-0.52, 0.385), (-0.52, 0.452, 0.03), (-0.88, 0.452, 0.03), (-0.88, 0.385)], 0.05, M.gunmetal, 0.016, 2),
          both(disc("cheek_knob", 0.04, 0.066, -0.70, 0.40, 0.022, Au, 8, 0.004)))
    g.add("frame", both(plate("plaque", (0.064, 0.165, -0.82), (0.0765, 0.275, -0.56), M.brass, 0.003)),
          both(plate("plaque_line", (0.074, 0.228, -0.795), (0.0795, 0.242, -0.585), M.brass_dk, 0.0)), both(plate("plaque_line", (0.074, 0.192, -0.795), (0.0795, 0.204, -0.66), M.brass_dk, 0.0)))
    g.add("frame", pistol_grip("grip", M.walnut), trigger_guard("guard", M.gunmetal), trigger("trigger", Au))
    for sx in (-1, 1):
        g.add("frame", slab("stripe", [(-0.36, 0.262), (0.60, 0.262), (0.60, 0.274), (-0.36, 0.274)], 0.004, Au, 0.0, 1, 1, sx * 0.0975),
              slab("stripe_hg", [(0.72, 0.262), (1.15, 0.262), (1.15, 0.274), (0.72, 0.274)], 0.004, Au, 0.0, 1, 1, sx * 0.0885))
    g.add("frame", both(disc("pin", 0.07, 0.100, -0.30, 0.235, 0.014, Au, 6)), slab("selector", [(-0.03, 0.212), (0.13, 0.220), (0.13, 0.244), (-0.03, 0.256)], 0.008, Au, 0.0, 1, 1, -0.098))
    parts, at = magazine("mag", [(0.49, 0.17), (0.515, -0.24)], 0.235, 0.056, M.blued, Au, round_at=(0.47, 0.19))
    g.add("mag", parts)
    g.socket("socket_mag", at, "mag")
    g.socket("socket_sight", (0, TOP, 0.12))
    g.muzzle((0, BORE, 1.60))
    g.socket("socket_rail", (0, 0.196, 1.0))
    g.socket("socket_grip", (0, 0.235, 0.74))
    g.socket("socket_stock", (0, 0.31, -0.42))
    g.point("eject", (0.12, 0.35, 0.26))
    g.extras.update(moving="bolt", travel=0.17, mag="mag")

@gun("the_audit", "The Audit", "shotgun", "high")
def the_audit(g):
    """Semi-auto shotgun, drum-ready: a polished receiver with a magazine well, a blued barrel under a ventilated rib,
    a walnut stock and forearm, a gold bead. Signature: it comes wrapped in red tape."""
    TOP, Au = 0.50, M.gold
    rec = slab("receiver", [(-0.30, 0.22, 0.04), (-0.33, 0.36, 0.05), (-0.20, 0.455, 0.06), (0.62, 0.455, 0.02), (0.62, 0.19, 0.02), (0.605, 0.17), (0.605, 0.07, 0.015),
                            (0.40, 0.07, 0.015), (0.40, 0.165), (0.02, 0.165, 0.03)], 0.092, M.gunmetal, 0.014)
    port(rec, 0.08, 0.44, 0.33, 0.41, 0.06)
    g.add("frame", rec, saddle("sight_base", -0.14, 0.30, TOP, M.gunmetal))
    g.add("bolt", bolt_side(0.08, 0.44, 0.33, 0.41, 0.16, M.steel, Au, 0.022, 0.06, 0.085))
    for sx in (-1, 1):
        for y in (0.262, 0.288):
            g.add("frame", slab("stripe", [(-0.18, y), (0.58, y), (0.58, y + 0.01), (-0.18, y + 0.01)], 0.004, Au, 0.0, 1, 1, sx * 0.0945))
    # barrel, ventilated rib, bead
    g.add("frame", barrel("barrel", 0.58, 1.50, 0.070, SG_BORE, M.blued), slab("rib", [(0.63, SG_BORE + 0.088), (1.41, SG_BORE + 0.088), (1.41, SG_BORE + 0.104), (0.63, SG_BORE + 0.104)], 0.017, M.gunmetal, 0.0),
          bead("bead", (0, SG_BORE + 0.118, 1.37), 0.022, Au, "z", 6))
    for z in (0.66, 0.84, 1.02, 1.20, 1.36):
        g.add("frame", plate("rib_post", (-0.009, SG_BORE + 0.058, z), (0.009, SG_BORE + 0.094, z + 0.03), M.gunmetal, 0.0))
    # gas tube in a walnut forearm, with the rail
    FA = [(0.64, SG_TUBE - 0.085, 0.03), (0.64, SG_TUBE + 0.07, 0.03), (1.12, SG_TUBE + 0.07, 0.03), (1.12, SG_TUBE - 0.085, 0.04)]
    g.add("frame", tube("gas_tube", [(0.60, 0), (0.60, 0.046), (1.19, 0.046), (1.20, 0.05), (1.235, 0.05), (1.245, 0.04), (1.245, 0)], SG_TUBE, [M.blued, M.blued, Au, Au, Au, Au], 8),
          slab("forearm", FA, 0.09, M.walnut, 0.028, 2), rail_under("rail_under", 0.88, SG_TUBE - 0.124, M.gunmetal))
    S, st = long_stock(M.walnut)
    g.add("frame", st, band_slab("butt", S, 0.072, -1.2, -1.03, M.rubber, 0.006, 0.0, 0.03, 2))
    # the red tape
    g.add("frame", band_slab("red_tape", FA, 0.09, 0.685, 0.735, M.red, 0.005, 0.0, 0.028, 2), band_slab("red_tape", FA, 0.09, 1.025, 1.075, M.red, 0.005, 0.0, 0.028, 2),
          band_slab("red_tape", S, 0.072, -0.50, -0.43, M.red, 0.005, -0.5, 0.028, 2), band_slab("red_tape", S, 0.072, -0.95, -0.89, M.red, 0.005, 0.0, 0.028, 2))
    parts, at = magazine("mag", [(0.502, 0.15), (0.502, -0.17)], 0.172, 0.062, M.blued, Au)
    g.add("mag", parts)
    g.socket("socket_mag", at, "mag")
    g.add("frame", trigger_guard("guard", M.gunmetal, -0.17, 0.425, 0.18, -0.07), trigger("trigger", Au, 0.25, 0.14))
    g.add("frame", both(disc("pin", 0.07, 0.098, -0.16, 0.24, 0.015, Au, 6)), disc("safety", 0.07, 0.102, -0.10, 0.32, 0.02, M.red, 8, 0.004))
    g.socket("socket_sight", (0, TOP, 0.09))
    g.muzzle((0, SG_BORE, 1.50))
    g.socket("socket_rail", (0, SG_TUBE - 0.124, 0.88))
    g.socket("socket_stock", (0, 0.28, -0.30))
    g.point("eject", (0.12, 0.37, 0.27))
    g.extras.update(moving="bolt", travel=0.16, mag="mag")

@gun("long_ledger", "Long Ledger", "sniper", "high")
def long_ledger(g):
    """Long elegant rifle: banker-green lacquered stock, brass fittings, a polished action, a barrel that goes on and
    on, a long scope in brass rings. Signature: the butt is ruled like a ledger page, gold lines and a red margin."""
    TOP, Br = 0.435, M.brass
    S, st = long_stock(M.green, front=[(0.06, 0.10, 0.05), (0.50, 0.135, 0.2), (1.22, 0.15, 0.04), (1.22, 0.295, 0.03), (-0.20, 0.295)])
    g.add("frame", st, band_slab("butt", S, 0.072, -1.2, -1.035, Br, 0.006, 0.0, 0.03, 2), band_slab("tip", S, 0.072, 1.15, 1.3, Br, 0.005, 0.0, 0.028, 2),
          slab("cheek", [(-0.96, 0.185), (-0.96, 0.29, 0.03), (-0.66, 0.29, 0.06), (-0.60, 0.185)], 0.05, M.green_dk, 0.02, 2))
    g.add("frame", tube("action", [(-0.28, 0), (-0.28, 0.058), (-0.265, 0.068), (0.44, 0.068), (0.47, 0.052), (0.47, 0)], BORE, M.gunmetal, 10), saddle("scope_base", -0.24, 0.40, TOP, Br, 0.06))
    g.add("frame", barrel("barrel", 0.44, 2.16, 0.052, BORE, M.blued, 10, [(1.25, 0.044)]),
          tube("barrel_band", [(1.17, 0), (1.17, 0.06), (1.235, 0.06), (1.235, 0)], BORE, Br, 8), tube("muzzle_band", [(2.02, 0), (2.02, 0.052), (2.08, 0.052), (2.08, 0)], BORE, Br, 8))
    bolt_action(g, knob=Br)
    g.add("frame", plate("port", (0.045, BORE - 0.012, -0.02), (0.072, BORE + 0.042, 0.24), M.dark, 0.0))
    g.add("scope_builtin", scope("scope", 0.14, TOP + 0.128, 1.20, base_y=TOP, rings=(-0.22, 0.20), ring_mat=Br, body=M.gunmetal, r=0.050, r_obj=0.084, r_eye=0.068, obj_len=0.24, eye_len=0.14))
    parts, at = magazine("mag", [(0.50, 0.21), (0.50, 0.075)], 0.20, 0.046, M.blued, Br)
    g.add("mag", parts)
    g.socket("socket_mag", at, "mag")
    g.add("frame", trigger_guard("guard", Br, -0.17, 0.38, 0.14, -0.075), trigger("trigger", M.gold, 0.23, 0.115))
    g.add("frame", rail_under("rail_under", 0.90, 0.101, M.blued), sling_loop("loop_rear", -0.86, -0.17, Br), sling_loop("loop_front", 0.56, 0.138, Br, 0.024))
    # the ledger page: three gold rules and a red margin on each flank of the butt, a ruled brass plate under the action
    for sx in (-1, 1):
        for y in (0.085, 0.02, -0.045):
            g.add("frame", slab("rule", [(-1.0, y), (-0.63, y), (-0.63, y + 0.012), (-1.0, y + 0.012)], 0.004, M.gold, 0.0, 1, 1, sx * 0.074))
        g.add("frame", slab("margin", [(-0.955, -0.085), (-0.943, -0.085), (-0.943, 0.135), (-0.955, 0.135)], 0.004, M.red, 0.0, 1, 1, sx * 0.0775),
              slab("ledger_plate", [(-0.02, 0.165, 0.012), (0.36, 0.165, 0.012), (0.36, 0.26, 0.012), (-0.02, 0.26, 0.012)], 0.004, Br, 0.0, 1, 1, sx * 0.0735))
        for y in (0.188, 0.212, 0.236):
            g.add("frame", slab("plate_rule", [(0.01, y), (0.33, y), (0.33, y + 0.007), (0.01, y + 0.007)], 0.003, M.brass_dk, 0.0, 1, 1, sx * 0.0775))
    g.socket("socket_sight", (0, TOP, 0.08))
    g.muzzle((0, BORE, 2.16))
    g.socket("socket_rail", (0, 0.101, 0.90))
    g.socket("socket_stock", (0, 0.25, -0.28))
    g.point("eject", (0.10, BORE + 0.02, 0.11))
    g.extras.update(mag="mag", loose=["scope_builtin"], builtinSight="scope_builtin")


# ================================================================================================ the low tier
@gun("peel_sprayer", "Peel Sprayer", "smg", "low")
def peel_sprayer(g):
    """Taped-together SMG: a length of pipe for a receiver, a rusty trigger housing, a punched tin shroud, a wire stock,
    a plank grip in electrical tape. Signature: the curved stick magazine is painted up as a banana."""
    TOP = 0.455
    rec = tube("receiver", [(-0.42, 0), (-0.42, 0.07), (-0.40, 0.085), (0.50, 0.085), (0.52, 0.07), (0.52, 0)], BORE, M.pipe, 10)
    port(rec, 0.06, 0.38, 0.30, 0.385, 0.05)
    g.add("frame", rec, tube("rust_band", [(-0.33, 0), (-0.33, 0.0895), (-0.19, 0.0895), (-0.19, 0)], BORE, M.rust, 10))
    g.add("bolt", bolt_side(0.06, 0.38, 0.30, 0.385, 0.14, M.steel, M.banana, 0.020, 0.05, 0.074))
    g.add("frame", slab("housing", [(-0.26, 0.16, 0.02), (-0.26, 0.27), (0.585, 0.27), (0.585, 0.19), (0.57, 0.09, 0.012), (0.385, 0.09, 0.012), (0.385, 0.16)], 0.062, M.rust_dk, 0.008))
    g.add("frame", saddle("sight_base", -0.20, 0.22, TOP, M.rust_dk, 0.055), sight_notch("rear_sight", -0.335, BORE + 0.075, 0.105, M.rust_dk))
    # barrel, a tin shroud with punched slots, a band of yellow tape, a bent nail for a front sight
    shroud = stripe_facets(tube("shroud", [(0.54, 0), (0.54, 0.066), (0.81, 0.066), (0.81, 0)], BORE, M.tin, 8), 0, BORE, 8, M.dark)
    g.add("frame", barrel("barrel", 0.50, 0.94, 0.042, BORE, M.pipe), shroud, tube("yellow_tape", [(0.745, 0), (0.745, 0.071), (0.795, 0.071), (0.795, 0)], BORE, M.banana, 8),
          rod("nail", (0, BORE + 0.05, 0.70), (0, BORE + 0.155, 0.70), 0.008, M.steel, 4), rod("nail_head", (0, BORE + 0.15, 0.695), (0, BORE + 0.15, 0.735), 0.008, M.steel, 4))
    g.add("frame", plate("rail_block", (-0.056, BORE - 0.092, 0.555), (0.056, BORE - 0.05, 0.735), M.rust_dk, 0.004), rail_stub("rail_stub", 0.645, BORE - 0.131, M.rust_dk))
    g.add("frame", pistol_grip("grip", M.wood_lt, 0.0, 0.17, 0.07, 0.012, 1), grip_wrap("grip_tape", M.tape_blk, -0.20, -0.03, 0.0, 0.07, 0.14, 0.006, 0.012),
          trigger_guard("guard", M.rust_dk, z1=0.38, y_top=0.18), trigger("trigger", M.steel))
    # wire stock, taped where the shoulder goes
    g.add("frame", strap("stock", [(-0.40, 0.36), (-0.88, 0.36, 0.04), (-0.88, 0.05, 0.04), (-0.375, 0.262)], 0.024, 0.014, M.pipe),
          plate("butt_tape", (-0.03, 0.10, -0.906), (0.03, 0.31, -0.862), M.tape, 0.008))
    # the banana: a curved stick magazine in yellow, a brown tip, a wrap of tape round its middle
    path = arc_path(0.485, 0.17, 0.50, -0.06, 0.62)
    parts, at = magazine("mag", path, [0.15, 0.15, 0.15, 0.145, 0.135, 0.12], 0.045, M.banana, M.walnut, 0.068, 0.05, round_at=(0.475, 0.185))
    mz, my = path[3]
    g.add("mag", parts, plate("mag_tape", (-0.05, my - 0.03, mz - 0.092), (0.05, my + 0.03, mz + 0.092), M.tape, 0.004))
    g.socket("socket_mag", at, "mag")
    g.socket("socket_sight", (0, TOP, 0.01))
    g.muzzle((0, BORE, 0.94))
    g.socket("socket_rail", (0, BORE - 0.131, 0.645))
    g.socket("socket_stock", (0, 0.30, -0.42))
    g.point("eject", (0.11, 0.345, 0.24))
    g.extras.update(moving="bolt", travel=0.14, mag="mag")

@gun("bootleg_rifle", "Bootleg Rifle", "ar", "low")
def bootleg_rifle(g):
    """Makeshift rifle from mismatched parts: a rusted receiver with a tin patch riveted on, a crate plank for a stock,
    a red-brown handguard held on with tape, a soup can for a barrel shroud, two magazines taped side by side.
    Signature: the moonshiner's XXX painted down the stock."""
    TOP = 0.49
    rec = ar_receiver(M.rust_dk)
    port(rec, 0.03, 0.45, 0.30, 0.395)
    g.add("frame", rec, saddle("sight_base", -0.14, 0.30, TOP, M.pipe), sight_notch("rear_sight", -0.33, 0.43, 0.10, M.pipe))
    g.add("bolt", bolt_side(0.03, 0.45, 0.30, 0.395, 0.17, M.steel, M.pipe))
    g.add("frame", slab("patch", [(-0.31, 0.30), (-0.04, 0.325), (-0.07, 0.41), (-0.33, 0.395)], 0.004, M.tin, 0.0, 1, 1, -0.0965))
    for z, y in ((-0.29, 0.325), (-0.09, 0.345), (-0.085, 0.395), (-0.305, 0.38)):
        g.add("frame", disc("rivet", -0.09, -0.105, z, y, 0.011, M.rust, 6))
    # a crate plank for a stock, XXX on both flanks, tape where it meets the shoulder
    STOCK = [(-0.39, 0.40, 0.012), (-0.96, 0.37, 0.015), (-0.96, 0.02, 0.015), (-0.39, 0.215, 0.012)]
    g.add("frame", slab("stock", STOCK, 0.05, M.wood_lt, 0.008), band_slab("butt_tape", STOCK, 0.05, -1.0, -0.90, M.tape, 0.005, 0.0, 0.008))
    marks = gk.bmesh.new()
    for sx in (-1, 1):
        for zc in (-0.52, -0.66, -0.80):
            for k, lift in ((1, 0.0015), (-1, 0.0045)):                 # the two strokes of an X sit 3 mm apart, so they never share a plane
                add_box(marks, (sx * (0.05 + lift), 0.215, zc), (0.003, 0, 0), (0, 0.040, k * 0.040), (0, 0.006, -k * 0.006), M.dark)
    g.add("frame", mk("xxx", marks))
    # the handguard off some other gun, taped on
    HG = [(0.625, 0.24), (0.625, 0.42, 0.015), (1.02, 0.42, 0.02), (1.02, 0.24, 0.02)]
    g.add("frame", slab("handguard", HG, 0.08, M.wood_red, 0.012), band_slab("hg_tape", HG, 0.08, 0.70, 0.76, M.tape_blk, 0.005, 0.0, 0.012),
          band_slab("hg_tape", HG, 0.08, 0.90, 0.96, M.tape_blk, 0.005, 0.0, 0.012), rail_stub("rail_stub", 0.83, 0.201, M.rust_dk))
    # a pipe barrel through a soup can, a nail on top
    can = stripe_facets(tube("can", [(1.04, 0), (1.04, 0.074), (1.055, 0.08), (1.205, 0.08), (1.22, 0.074), (1.22, 0)], BORE, M.tin, 10), 0, BORE, 10, M.dark, 5)
    g.add("frame", barrel("barrel", 0.60, 1.36, 0.048, BORE, M.pipe), can, tube("can_label", [(1.085, 0), (1.085, 0.085), (1.175, 0.085), (1.175, 0)], BORE, M.red, 10),
          rod("nail", (0, BORE + 0.06, 1.20), (0, BORE + 0.165, 1.20), 0.008, M.steel, 4))
    g.add("frame", pistol_grip("grip", M.wood_lt, 0.0, 0.17, 0.07, 0.012, 1), grip_wrap("grip_tape", M.tape_blk, -0.22, -0.06, 0.0, 0.07, 0.14, 0.006, 0.012),
          trigger_guard("guard", M.rust_dk), trigger("trigger", M.steel))
    g.add("frame", both(disc("pin", 0.07, 0.100, 0.56, 0.30, 0.014, M.pipe, 6)))
    # two magazines taped side by side, the spare one rustier and hanging lower
    parts, at = magazine("mag", [(0.49, 0.17), (0.53, -0.30)], 0.235, 0.054, M.pipe, M.rust_dk, round_at=(0.47, 0.19))
    spare = move(mag_body("mag_spare", [(0.50, -0.02), (0.54, -0.42)], 0.235, 0.054, M.rust), lambda c: c + Vector((-0.116, 0, 0)))
    g.add("mag", parts, spare, plate("mag_tape", (-0.176, -0.20, 0.385), (0.062, -0.12, 0.66), M.tape, 0.006))
    g.socket("socket_mag", at, "mag")
    g.socket("socket_sight", (0, TOP, 0.08))
    g.muzzle((0, BORE, 1.36))
    g.socket("socket_rail", (0, 0.201, 0.83))
    g.socket("socket_grip", (0, 0.24, 0.67))
    g.socket("socket_stock", (0, 0.31, -0.42))
    g.point("eject", (0.12, 0.35, 0.26))
    g.extras.update(moving="bolt", travel=0.17, mag="mag")

@gun("pipe_dream", "Pipe Dream", "shotgun", "low")
def pipe_dream(g):
    """Pipe-and-wood single shot: a fat pipe for a receiver, a thinner one for a barrel that slides back into it to
    fire, a plank stock in tape, three spare shells strapped to the butt. Signature: a red valve wheel still on the
    plumbing."""
    TOP, PY = 0.50, 0.36
    g.add("frame", tube("receiver", [(-0.27, 0), (-0.27, 0.07), (-0.25, 0.088), (0.42, 0.088), (0.42, 0.067), (0.395, 0.067), (0.395, 0)], PY, [M.pipe] * 4 + [M.dark, M.dark], 10),
          tube("cap", [(-0.315, 0), (-0.315, 0.082), (-0.30, 0.095), (-0.235, 0.095), (-0.235, 0)], PY, M.rust, 8), tube("cap_nut", [(-0.345, 0), (-0.345, 0.032), (-0.30, 0.032), (-0.30, 0)], PY, M.pipe, 6))
    g.add("frame", saddle("sight_base", -0.16, 0.26, TOP, M.rust_dk), slab("housing", [(-0.22, 0.16, 0.02), (-0.22, 0.30), (0.40, 0.30), (0.40, 0.20, 0.03)], 0.05, M.rust_dk, 0.008))
    # the barrel: slides in the receiver. A wooden grip is clamped under it; the rail and the crown ride it
    g.add("fore_end", barrel("barrel", 0.25, 1.36, 0.062, PY, M.pipe), tube("barrel_rust", [(0.96, 0), (0.96, 0.0665), (1.07, 0.0665), (1.07, 0)], PY, M.rust, 12),
          slab("pump", [(0.60, PY - 0.165, 0.03), (0.60, PY - 0.03), (0.98, PY - 0.03), (0.98, PY - 0.165, 0.03)], 0.068, M.wood_red, 0.016),
          plate("clamp", (-0.079, PY - 0.175, 0.655), (0.079, PY + 0.072, 0.705), M.tape, 0.008), plate("clamp", (-0.079, PY - 0.175, 0.875), (0.079, PY + 0.072, 0.925), M.tape, 0.008),
          bead("bead", (0, PY + 0.07, 1.27), 0.022, M.rust_dk, "z", 6),
          plate("rail_block", (-0.056, PY - 0.105, 1.075), (0.056, PY - 0.045, 1.285), M.rust_dk, 0.004), rail_stub("rail_stub", 1.18, PY - 0.144, M.rust_dk))
    S, st = long_stock(M.wood_lt, 0.055, 0.012)
    g.add("frame", st, band_slab("wrist_tape", S, 0.055, -0.40, -0.26, M.tape, 0.006, -0.6, 0.012), band_slab("butt_tape", S, 0.055, -1.0, -0.93, M.tape_blk, 0.006, 0.0, 0.012))
    g.add("frame", trigger_guard("guard", M.rust_dk, -0.17, 0.40, 0.18, -0.07), trigger("trigger", M.steel, 0.25, 0.175))
    # the valve wheel, left flank
    g.add("frame", disc("valve_stem", -0.07, -0.131, 0.08, PY, 0.016, M.pipe, 6), disc("valve_wheel", -0.118, -0.14, 0.08, PY, 0.078, M.red, 8, 0.006),
          disc("valve_hub", -0.13, -0.154, 0.08, PY, 0.024, M.pipe, 6))
    # three spare shells in a canvas loop on the butt, left flank
    X = -0.083
    for z in (-0.80, -0.72, -0.64):
        g.add("shells", rod("shell", (X, -0.045, z), (X, 0.085, z), 0.03, M.red, 6), rod("shell_base", (X, -0.075, z), (X, -0.04, z), 0.032, M.brass, 6))
    g.add("frame", plate("shell_loop", (-0.119, -0.01, -0.845), (-0.05, 0.045, -0.595), M.canvas, 0.004))
    g.socket("socket_sight", (0, TOP, 0.05))
    g.muzzle((0, PY, 1.36), "fore_end")
    g.socket("socket_mag", (X, 0.0, -0.72), "shells")
    g.socket("socket_rail", (0, PY - 0.144, 1.18), "fore_end")
    g.socket("socket_stock", (0, 0.28, -0.27))
    g.point("eject", (0.10, PY, 0.42))
    g.extras.update(moving="fore_end", travel=0.12, mag="shells", magKind="shells")

# ================================================================================================ pistols
@gun("pocket_change", "Pocket Change", "pistol", "low")
def pocket_change(g):
    """Snub revolver that has seen better decades: a dull frame, a cylinder gone to rust in stripes, a rusty stub of a
    barrel, a red-brown grip wrapped in tape. Signature: a copper penny for a front sight, another set in the grip."""
    AX, CY, TOP = 0.335, 0.285, 0.435
    g.add("frame", slab("frame", [(-0.215, 0.13, 0.03), (-0.245, 0.30, 0.04), (-0.135, 0.405, 0.035), (0.27, 0.405, 0.012), (0.27, 0.225, 0.02), (0.19, 0.17, 0.02), (-0.03, 0.17)], 0.042, M.pipe, 0.010),
          saddle("sight_base", -0.10, 0.20, TOP, M.pipe, 0.035))
    g.add("cylinder", stripe_facets(tube("cylinder", [(-0.065, 0), (-0.065, 0.088), (-0.053, 0.10), (0.163, 0.10), (0.175, 0.088), (0.175, 0)], CY, M.steel, 10), 0, CY, 10, M.dark, 2, 1))
    g.add("frame", barrel("barrel", 0.24, 0.52, 0.046, AX, M.rust_dk), slab("lug", [(0.22, 0.20), (0.22, 0.31), (0.455, 0.31), (0.455, 0.245, 0.02), (0.40, 0.20, 0.02)], 0.03, M.pipe, 0.006),
          disc("penny", -0.007, 0.007, 0.45, AX + 0.066, 0.036, M.copper, 10), rail_stub("rail_stub", 0.345, 0.161, M.rust_dk))
    g.add("hammer", slab("hammer", [(-0.20, 0.27), (-0.175, 0.40, 0.01), (-0.215, 0.455, 0.012), (-0.275, 0.47, 0.01), (-0.285, 0.445, 0.01), (-0.235, 0.425, 0.015), (-0.235, 0.27)], 0.02, M.rust_dk, 0.004))
    g.pivot("hammer", (0, 0.31, -0.215))
    g.add("frame", pistol_grip("grip", M.wood_red, 0.0, 0.17, 0.054, 0.02, 2, -0.22, 0.10), grip_wrap("grip_tape", M.tape, -0.185, -0.06, 0.0, 0.054, 0.10, 0.006, 0.02, -0.22),
          both(disc("coin", 0.04, 0.0625, -0.075, 0.06, 0.036, M.copper, 10, 0.004)))
    g.add("frame", trigger_guard("guard", M.pipe, 0.07, 0.25, 0.22, -0.05, 0.02, 0.028, 0.05), trigger("trigger", M.rust_dk, 0.15, 0.15, 0.015))
    g.socket("socket_sight", (0, TOP, 0.055))
    g.muzzle((0, AX, 0.52))
    g.socket("socket_mag", (0, CY, -0.065), "cylinder")
    g.socket("socket_rail", (0, 0.161, 0.345))
    g.point("eject", (0.10, CY, 0.05))
    g.extras.update(moving="hammer", travel=0.0, swing=-32.0, mag="cylinder", magKind="cylinder")

@gun("golden_parachute", "Golden Parachute", "pistol", "high")
def golden_parachute(g):
    """Gold-trimmed hand cannon: a long, tall slide with a gold spine and pinstripes, a heavy barrel in a gold bushing,
    walnut grips, a gold baseplate, trigger and hammer. Signature: the ripcord handle hanging off the butt, and the
    parachute on its medallion."""
    BY, TOP, Au = 0.36, 0.475, M.gold
    sf = lambda y: 0.066 + (y + 0.262) * 0.14
    sb = lambda y: -0.207 + (y + 0.24) * 0.158
    slide = slide_shell("slide_body", -0.37, 0.93, 0.214, TOP, M.gunmetal, band=(0.032, 0.078))
    cut(slide, box("port_cut", (0.022, TOP - 0.09, 0.10), (0.13, TOP + 0.04, 0.30), M.dark))
    g.add("slide", slide, sight_notch("rear_sight", -0.315, TOP, 0.045, M.dark, 0.06, 0.05), sight_post("front_sight", 0.845, TOP, 0.042, Au, 0.016, 0.08),
          tube("bushing", [(0.905, 0), (0.905, 0.072), (0.94, 0.072), (0.948, 0.064), (0.948, 0.056), (0.936, 0.056), (0.936, 0)], BY, [Au] * 5 + [M.dark], 12))
    FR = [(-0.335, 0.218), (0.89, 0.218), (0.89, 0.168, 0.026), (0.86, 0.128, 0.022), (sf(0.128), 0.128, 0.032), (sf(-0.30), -0.30, 0.03), (-0.226, -0.30, 0.03),
          (-0.196, -0.10, 0.2), (-0.162, 0.045, 0.085, 4), (-0.362, 0.150, 0.024), (-0.372, 0.200, 0.024)]
    g.add("frame", slab("frame", FR, 0.095, M.graphite, 0.016, 2), barrel("barrel", 0.04, 1.04, 0.052, BY, Au),
          plate("hood", (0.016, TOP - 0.115, 0.103), (0.086, TOP - 0.012, 0.297), M.steel, 0.004), rail_under("rail", 0.62, 0.089, M.graphite))
    g.add("frame", trigger_guard("guard", Au, 0.078, 0.392, 0.17, -0.096, 0.024, 0.04, 0.062), trigger("trigger", Au, 0.25, 0.145, 0.021))
    # walnut panels, the gold medallion with its parachute
    PAD = [(sf(0.04) - 0.036, 0.04, 0.03), (sf(-0.252) - 0.031, -0.252, 0.03), (sb(-0.252) + 0.031, -0.252, 0.03), (sb(0.04) + 0.036, 0.04, 0.03)]
    X1 = 0.108
    canopy = [(-0.05 + 0.03 * cos(radians(a)), -0.092 + 0.03 * sin(radians(a))) for a in range(0, 181, 36)]
    for ob in (slab("pad", PAD, 0.0095, M.walnut, 0.007, 2, 2, X1 - 0.0095), medallion("medal", -0.05, -0.098, X1, 1, 0.047),
               prism("canopy", canopy, X1 + 0.004, X1 + 0.0105, "x", Au), plate("payload", (X1 + 0.004, -0.128, -0.057), (X1 + 0.0105, -0.113, -0.043), Au, 0.0)):
        g.add("frame", both(ob))
    g.add("frame", slab("hammer", [(-0.33, 0.20), (-0.30, 0.30, 0.01), (-0.335, 0.345, 0.01), (-0.40, 0.352, 0.008), (-0.405, 0.327, 0.008), (-0.365, 0.31, 0.012), (-0.365, 0.20)], 0.024, Au, 0.005),
          slab("safety", [(-0.272, 0.206), (-0.205, 0.206), (-0.168, 0.193), (-0.168, 0.180), (-0.272, 0.176)], 0.012, Au, 0.004, 1, 1, -0.097),
          both(disc("pin", 0.07, 0.0985, 0.335, 0.172, 0.012, Au, 6)))
    parts, at = magazine("mag", [(-0.075 + 0.1529 * 0.395, 0.095), (-0.075 - 0.1529 * 0.016, -0.316)], 0.23, 0.05, M.steel, Au, 0.166, 0.091, round_at=(-0.02, 0.102))
    g.add("mag", parts)
    g.socket("socket_mag", at, "mag")
    # the ripcord: a gold D-handle on a stud at the heel of the grip, a red pull tab in it
    g.add("frame", rod("rip_stud", (0, -0.215, -0.195), (0, -0.215, -0.262), 0.012, Au, 6), sling_loop("ripcord", -0.275, -0.215, Au, 0.04, 0.016, 0.014),
          plate("rip_tab", (-0.009, -0.295, -0.30), (0.009, -0.262, -0.25), M.red, 0.004))
    g.socket("socket_sight", (0, TOP, 0.45), "slide")
    g.muzzle((0, BY, 1.04))
    g.socket("socket_rail", (0, 0.089, 0.62))
    g.point("eject", (0.115, TOP - 0.02, 0.20))
    g.extras.update(moving="slide", travel=0.16, mag="mag")

# the roster in class order, low to high (manifest.json and the sheets follow it)
ORDER = ["pocket_change", "golden_parachute", "peel_sprayer", "cash_flow", "insider_trader", "bootleg_rifle", "contraband_carbine", "board_meeting",
         "pipe_dream", "coconut_cracker", "the_audit", "bean_counter", "long_ledger", "hostile_takeover"]
GUNS = {k: GUNS[k] for k in ORDER}
