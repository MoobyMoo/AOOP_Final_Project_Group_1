"""Thrown projectiles (G1.5 row 19). `rang` is the bandits' banana boomerang as it flies: a chunky crescent that
keeps a strong silhouette at 6 px and up, with a dark orange rim (the edge that separates it from sand and grass)
and a separate pale core strip the code can light.

It lies flat in the ground plane and spins about the vertical axis; the origin is the centroid, so it spins on the
spot. Span about 1.0 u, arms 0.3 u wide, 0.17 u thick: the visual is larger than the hit radius on purpose.
  parts.body   the lit banana (matte)
  parts.core   the strip down the middle of both faces, on the emissive material and 15 mm proud of the body, so it
               never z-fights. Swap in an unlit yellow-white material at intensity 3-6 (POLISH_FINDINGS 13).
"""
from kit import *

G = "projectiles"
RIM, FACE, CORE, TIP = "#7c3410", "#ffcf33", "#fff3b8", "#5e4018"


def crescent(R, span, hw0, hw1, n=9, t0=0.0, t1=1.0, tips=2):
    """outline of a crescent: centre line on an arc of radius R (opening toward -y), half-width hw1 at the middle
    easing to hw0 at the ends, round tips"""
    def cl(t):
        th = radians((t - 0.5) * span)
        return Vector((R * sin(th), R * cos(th))), Vector((sin(th), cos(th))), Vector((cos(th), -sin(th)))
    hw = lambda t: hw0 + (hw1 - hw0) * sin(pi * t) ** 0.7
    ts = [t0 + (t1 - t0) * i / (n - 1) for i in range(n)]
    out = [cl(t)[0] + cl(t)[1] * hw(t) for t in ts]
    inn = [cl(t)[0] - cl(t)[1] * hw(t) for t in ts]
    pts = list(out)
    c, nr, tg = cl(ts[-1])
    for k in range(1, tips + 1):                       # round tip at t1
        a = pi * k / (tips + 1)
        pts.append(c + nr * hw(ts[-1]) * cos(a) + tg * hw(ts[-1]) * sin(a))
    pts += inn[::-1]
    c, nr, tg = cl(ts[0])
    for k in range(1, tips + 1):                       # round tip at t0
        a = pi * k / (tips + 1)
        pts.append(c - nr * hw(ts[0]) * cos(a) - tg * hw(ts[0]) * sin(a))
    return pts


def rang(name, seed):
    a = Asset(name, G, footprint=0.3, seed=seed, ground=False, glow=3.0, ao_min=0.7)
    R, span, th = 0.5, 118, 0.17
    body_o = crescent(R, span, 0.1, 0.155)
    cx = sum(p.x for p in body_o) / len(body_o)
    cy = sum(p.y for p in body_o) / len(body_o)
    sh = lambda pts: [(p.x - cx, p.y - cy) for p in pts]
    body = a.part("body", (0, 0, 0))
    body.emit(p_prism(sh(body_o), th, 0.035, -th / 2), {0: RIM, 1: RIM, 2: FACE}, None, jit=0.0, smooth=50)
    for s in (-1, 1):                                   # dark stalk ends, like a banana's
        t = radians(s * span / 2)
        c = Vector((R * sin(t) - cx, R * cos(t) - cy))
        d = Vector((cos(t), -sin(t))) * s
        body.beam((c.x + d.x * 0.06, c.y + d.y * 0.06, 0), (c.x + d.x * 0.17, c.y + d.y * 0.17, 0), 0.085, 0.085, TIP, b=0.02, jit=0.0)
    core = a.part("core", (0, 0, 0), mat="emissive")
    core.emit(p_prism(sh(crescent(R, span, 0.03, 0.058, t0=0.07, t1=0.93)), th + 0.03, 0.0, -th / 2 - 0.015), CORE, None, jit=0.0)
    return a


def build():
    rang("rang", 31)


REVIEW = dict(cols=2, cell=2.0, dist=14)
