"""Sliding-lid packaging box: 3D print files (sized for a Bambu Lab P1S, 256 mm bed).

Outside size: 220 mm wide (X) x 175 mm deep (Y) x 100 mm high (Z), open at the top.
The lid slides in along X through the lowered front end and stops against the
grooved back wall. A small bump on the front wall clicks into a notch under the
lid, so the lid stays shut until you push it open.

Run:  python3 make_box.py      (needs: pip install manifold3d numpy)
Output in ./out:  box.stl, lid.stl
"""
import os

import numpy as np
from manifold3d import Manifold

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")

# ---------------------------------------------------------------- sizes (mm)
L, D, H = 220.0, 177.0, 100.0   # outside: width (slide direction) x depth x height; inside fits a 210 x 170 x 75 toy
WALL = 2.4                      # 6 lines with a 0.4 nozzle
FLOOR = 1.2
GD = 1.2                        # groove depth into the walls
LID_T = 2.0                     # lid thickness
GAP_Z = 0.4                     # vertical play in the groove
GAP_XY = 0.3                    # side play per edge
TOP_LIP = 0.6                   # solid wall left above the groove chamfer
BUMP_R = 0.6                    # click-stop bump height on the front wall
BUMP_LEN = 60.0

G_TOP = H - TOP_LIP - GD        # top of the straight part of the groove
G_BOT = G_TOP - (LID_T + GAP_Z) # groove floor: the lid rests here
E = 1.0                         # overcut so boolean faces don't coincide


def box(x0, y0, z0, x1, y1, z1):
    return Manifold.cube((x1 - x0, y1 - y0, z1 - z0)).translate((x0, y0, z0))


def rod_x(x0, x1, y, z, r):     # cylinder along X
    return Manifold.cylinder(x1 - x0, r, r, 64).rotate((0, 90, 0)).translate((x0, y, z))


def rod_y(y0, y1, x, z, r):     # cylinder along Y
    return Manifold.cylinder(y1 - y0, r, r, 64).rotate((-90, 0, 0)).translate((x, y0, z))


def make_box(thin=None):
    """thin: optional thinner wall below the top band. The top band always
    stays WALL thick to hold the grooves, and a 45 degree ramp joins the two."""
    body = box(0, 0, 0, L, D, H) - box(WALL, WALL, FLOOR, L - WALL, D - WALL, H + E)
    if thin and thin < WALL:
        zb, dz, t = G_BOT - 4.0, WALL - thin, 0.01   # band bottom; ramp height
        body = body - box(thin, thin, FLOOR, L - thin, D - thin, zb - dz + t)
        body = body - Manifold.batch_hull([
            box(thin, thin, zb - dz, L - thin, D - thin, zb - dz + t),
            box(WALL, WALL, zb - t, L - WALL, D - WALL, zb),
        ])

    # Groove: straight slot for the lid, then a 45 degree chamfer above it so
    # the groove roof prints without supports. Runs out through the front (x=0)
    # and into the back wall, which is the end stop.
    gx1, gy0, gy1 = L - WALL + GD, WALL - GD, D - WALL + GD
    slot = box(-E, gy0, G_BOT, gx1, gy1, G_TOP)
    t = 0.01
    chamfer = Manifold.batch_hull([
        box(-E, gy0, G_TOP - t, gx1, gy1, G_TOP),
        box(-E, WALL, G_TOP + GD - t, L - WALL, D - WALL, G_TOP + GD),
    ])
    body = body - slot - chamfer

    # Lower the front wall to the groove floor so the lid can slide in.
    body = body - box(-E, gy0, G_BOT, WALL + E, gy1, H + E)

    # Click-stop bump on top of the lowered front wall (middle section only,
    # so the lid flexes over it).
    bump = rod_y(D / 2 - BUMP_LEN / 2, D / 2 + BUMP_LEN / 2, WALL / 2, G_BOT, BUMP_R)
    body = body + (bump - box(-E, 0, G_BOT - 5, WALL + E, D, G_BOT))

    return body


def make_lid():
    lx = L - WALL + GD - GAP_XY       # front edge flush with the box front
    ly = D - 2 * (WALL - GD) - 2 * GAP_XY
    lid = box(0, 0, 0, lx, ly, LID_T)
    # Notch on the underside that catches the bump when closed.
    lid = lid - rod_y(ly / 2 - BUMP_LEN / 2 - 2, ly / 2 + BUMP_LEN / 2 + 2, WALL / 2, 0, BUMP_R + 0.2)
    # Thumb grip grooves near the front edge on the top.
    for i in range(4):
        x = 8 + i * 4
        lid = lid - rod_y(ly / 2 - 25, ly / 2 + 25, x, LID_T, 0.9)
    return lid


def write_stl(path, m, name):
    mm = m.to_mesh()
    v = np.asarray(mm.vert_properties)[:, :3].astype(np.float64)
    t = np.asarray(mm.tri_verts).astype(np.int64)
    tri = v[t]
    n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    rec = np.zeros(len(t), dtype=[("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")])
    rec["n"], rec["v"] = n, tri
    with open(path, "wb") as f:
        f.write(name.encode().ljust(80, b" "))
        f.write(np.uint32(len(t)).tobytes())
        f.write(rec.tobytes())


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, m in (("box", make_box()), ("lid", make_lid())):
        assert m.status().name == "NoError" and m.genus() >= 0
        write_stl(os.path.join(OUT, name + ".stl"), m, "Sliding box " + name)
        lo, hi = m.bounding_box()[:3], m.bounding_box()[3:]
        print(f"{name}: {hi[0]-lo[0]:.1f} x {hi[1]-lo[1]:.1f} x {hi[2]-lo[2]:.1f} mm, "
              f"{m.volume()/1000:.0f} cm3, genus {m.genus()}")


if __name__ == "__main__":
    main()
