"""Where every piece of the vault stands: the room shell (the same list as src/game/home/vaultkit.ts shellLayout()),
the starters, and a built-up showcase layout. Shared by the review mock (vault_review.py) and the assembled z-fight
check (coplanar_check.py --shell). Game coordinates: x east, z south; quarter turns about the vertical."""
X0, X1, Z0, Z1 = -16.5, 16.5, -12.5, 12.5
NORTH = "WWPWWPWWWPWWPDPWWW"          # from x = -16.5 east; W wall 2 m, P pilaster 1 m, D door 4 m
EAST = "PWWWPWWPWWPWWWP"              # from z = -12.5 south
LEN = {"W": 2.0, "P": 1.0, "D": 4.0}
PIECE = {"W": "vault_wall", "P": "vault_pilaster", "D": "vault_door_round"}
SCONCES_N, SCONCES_E = [-12, -7, 5, 10], [-5, 0, 5]


def vault_layout():
    """[(asset, game x, game z, yaw quarter-turns, scale along its length)] : the room shell (mirrors basebuild.ts)"""
    out = []
    for x in range(-16, 17):
        for z in range(-12, 13):
            ex, ez = abs(x) == 16, abs(z) == 12
            if ex and ez:
                out.append(("vault_floor_corner", x, z, {(1, -1): 0, (1, 1): -1, (-1, 1): 2, (-1, -1): 1}[(x // 16, z // 12)], 1))
            elif ex or ez:
                out.append(("vault_floor_border", x, z, (0 if z == -12 else 2) if ez else (1 if x == -16 else -1), 1))
    # the cream field: 2 x 2 modules, then one strip of halves along the east and south (the field is 31 x 23 cells)
    for i in range(15):
        for j in range(11):
            out.append(("vault_floor", -14.5 + 2 * i, -10.5 + 2 * j, 0, 1))
        out.append(("vault_floor_half", -14.5 + 2 * i, 11, 2, 1))
    for j in range(11):
        out.append(("vault_floor_half", 15, -10.5 + 2 * j, 1, 1))
    out.append(("vault_floor_cell", 15, 11, 0, 1))
    x = X0
    for ch in NORTH:
        out.append((PIECE[ch], x + LEN[ch] / 2, Z0, 0, 1)); x += LEN[ch]
    out.append(("vault_wall_corner", X1, Z0, 0, 1))
    z = Z0
    for ch in EAST:
        out.append((PIECE[ch], X1, z + LEN[ch] / 2, -1, 1)); z += LEN[ch]
    door = (5.5, 9.5)
    for k in range(34):
        cx = X0 + k + 0.5
        if door[0] < cx < door[1]:
            continue
        if k < 33:
            out.append(("vault_trim", cx, Z0, 0, 1))
        out.append(("vault_wall_cap", cx, Z0, 0, 1))
    out.append(("vault_trim", X1 + 0.06, Z0, 0, 0.12))       # past the corner the cornice only reaches the side wall's face
    for k in range(25):
        cz = Z0 + k + 0.5
        out.append(("vault_trim", X1, cz + 0.06, -1, 0.88) if k == 0 else ("vault_trim", X1, cz, -1, 1))
        out.append(("vault_wall_cap", X1, cz, -1, 1))
    for k in range(33):
        out.append(("vault_kerb", X0 + k + 0.5, Z1, 2, 1))
    for k in range(25):
        out.append(("vault_kerb", X0, Z0 + k + 0.5, 1, 1))
    out.append(("vault_kerb_post", X0, Z1, 2, 1))
    return out



def centre(w, d, x, z, r):
    fw, fd = (d, w) if r & 1 else (w, d)
    return x - 0.5 + fw / 2, z - 0.5 + fd / 2


STARTERS = [("vault_pod", 3, 3, -1, -12, 0), ("vault_board", 2, 1, 2, -11, 0), ("fac_blueprint", 2, 1, -4, -11, 0), ("fac_locker", 3, 1, -8, -12, 0)]
BUILT = [("fac_fence", 4, 2, -14, -12, 0), ("fac_stash", 3, 1, 11, -12, 0), ("fac_stash", 3, 1, 14, -12, 0), ("fac_trophy", 3, 1, 16, -9, 3),
         ("fac_sal", 3, 2, 15, -4, 3), ("fac_med", 3, 1, 16, 1, 3), ("fac_bench", 3, 2, 4, -7, 0), ("fac_generator", 2, 2, 10, -5, 0), ("fac_press", 2, 2, 12, -5, 0),
         ("fac_desk", 4, 2, -9, -6, 0), ("fac_plant", 1, 1, -10, -7, 0), ("fac_plant", 1, 1, -5, -7, 0), ("fac_plant", 1, 1, 4, -12, 0)]
