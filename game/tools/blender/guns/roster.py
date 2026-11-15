"""The roster: every kit gun, assembled from gk.py's parts. Fictional firearms, our own designs, no real make or model.

A gun is a function that fills a gk.Gun: parts into nodes (`frame` plus the moving part, the magazine and any extras),
the sockets, the flash point, and the few numbers the game needs in g.extras:
  moving   the node that cycles on a shot      travel   how far it goes, along -z (gun units)
  mag      the node that holds the ammunition  loose    nodes that can be hidden or swung away (own AO only)
Classes share a chassis function (ar_chassis, smg_chassis ...) that takes a style and returns where things ended up.
"""
from math import radians, sin, cos, pi
from mathutils import Vector
import gk
from gk import (M, BORE, Gun, slab, strap, band_slab, tube, disc, rod, bead, plate, saddle, rail_top, rail_under, barrel, magazine, mag_body, mag_foot,
                arc_path, pistol_grip, grip_wrap, trigger_guard, trigger, sight_post, sight_notch, sling_loop, round_top, port, scope, banana, medallion,
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
    g.extras.update(moving="fore_end", travel=0.15, mag="tube")

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
