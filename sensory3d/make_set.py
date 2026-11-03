"""Garden Friends sensory puzzle: 3D print files for Bambu Studio (P1S + AMS).

Six chunky critter pieces, each with its own texture to feel, plus a tray
with matching cut-outs. Run:  python3 make_set.py   (needs: pip install manifold3d)

Output in ./out:
  plate1-bee-flower.3mf        4 colours: Yellow, Black, White, Pink
  plate2-ladybug-frog-snail-caterpillar.3mf   4 colours: Red, Green, Purple, Black
  plate3-tray.3mf              any single colour
  stl/<piece>.stl              whole piece in one colour (for single-colour printers)
  stl/parts/<piece>-<part>.stl one STL per colour part
  print-guide.txt
"""
import math
import os
import zipfile

import numpy as np
from manifold3d import CrossSection, Manifold

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
SEG = 96          # circle smoothness
H = 10.0          # piece slab thickness (mm)
FILLET = 2.6      # rounded top edge radius
STEP = 0.2        # fillet stair height = a typical layer height, so it prints smooth
BIG = 200.0

COLORS = {
    "Yellow": "#FFD24D", "Black": "#3A3046", "White": "#F7F4EF", "Pink": "#FF9EC4",
    "Red": "#F25C5C", "Green": "#6CCB68", "Purple": "#B48CF2", "Cream": "#FFF1DC",
}


# ---------------------------------------------------------------- helpers
def circle(r, x=0.0, y=0.0):
    return CrossSection.circle(r, SEG).translate((x, y))


def ellipse(rx, ry, x=0.0, y=0.0):
    return CrossSection.circle(1.0, SEG).scale((rx, ry)).translate((x, y))


def union(items):
    out = items[0]
    for it in items[1:]:
        out = out + it
    return out


def prism(cs, z0=-1.0, z1=H + 20):
    return Manifold.extrude(cs, z1 - z0).translate((0, 0, z0))


def rounded_slab(outline, h=H, r=FILLET):
    """Flat-bottomed slab with a quarter-round top edge, built from thin
    offset layers (each one layer high)."""
    n = max(1, int(round(r / STEP)))
    parts = [Manifold.extrude(outline, h - r)]
    for i in range(n):
        z0 = h - r + i * STEP
        zc = z0 + STEP
        inset = r - math.sqrt(max(r * r - (zc - (h - r)) ** 2, 0.0))
        cs = outline.offset(-inset, circular_segments=SEG)
        if cs.is_empty():
            break
        parts.append(Manifold.extrude(cs, STEP).translate((0, 0, z0)))
    return Manifold.batch_boolean(parts, manifold3d_add())


def manifold3d_add():
    from manifold3d import OpType
    return OpType.Add


def above(z=H):
    return Manifold.cube((BIG, BIG, BIG)).translate((-BIG / 2, -BIG / 2, z))


def dome(x, y, r_base, height, z=H):
    """Spherical cap sitting on the surface z with footprint radius r_base."""
    R = (r_base ** 2 + height ** 2) / (2 * height)
    s = Manifold.sphere(R, SEG).translate((x, y, z + height - R))
    return s ^ above(z)


def dimple(x, y, r_base, depth, z=H):
    R = (r_base ** 2 + depth ** 2) / (2 * depth)
    return Manifold.sphere(R, SEG).translate((x, y, z - depth + R))


def capsule_path(pts, r, z=H):
    """Rounded bead following a 2D polyline, centred on the surface z."""
    balls = [Manifold.sphere(r, 32).translate((x, y, z)) for x, y in pts]
    segs = [Manifold.batch_hull([balls[i], balls[i + 1]]) for i in range(len(balls) - 1)]
    return Manifold.batch_boolean(segs, manifold3d_add())


def arc_pts(cx, cy, R, a0, a1, n=24):
    return [(cx + R * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + R * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def face(x, y, s=1.0):
    """Raised eyes + smile (Black) and cheeks (blush colour). Returns (black, blush)."""
    black = [dome(x - 6 * s, y + 2 * s, 2.6 * s, 1.6),
             dome(x + 6 * s, y + 2 * s, 2.6 * s, 1.6),
             capsule_path(arc_pts(x, y + 1.5 * s, 4.0 * s, 215, 325, 16), 0.95, H) ^ above()]
    blush = [Manifold.extrude(ellipse(3.0 * s, 1.9 * s, x - 11 * s, y - 2 * s), 0.6).translate((0, 0, H)),
             Manifold.extrude(ellipse(3.0 * s, 1.9 * s, x + 11 * s, y - 2 * s), 0.6).translate((0, 0, H))]
    return black, blush


class Piece:
    def __init__(self, key, title, texture, outline):
        self.key, self.title, self.texture, self.outline = key, title, texture, outline
        self.base = rounded_slab(outline)
        self.parts = {}   # colour -> list[Manifold]
        self.cuts = []

    def region(self, colour, cs):
        """Give a footprint region of the slab its own colour."""
        self.add(colour, self.base ^ prism(cs))

    def add(self, colour, m):
        self.parts.setdefault(colour, []).append(m)

    def build(self):
        parts = {}
        claimed = None
        cut = Manifold.batch_boolean(self.cuts, manifold3d_add()) if self.cuts else None
        # later colours win nothing: regions are made disjoint in order given
        for colour, ms in self.parts.items():
            m = Manifold.batch_boolean(ms, manifold3d_add())
            if cut is not None:
                m = m - cut
            if claimed is not None:
                m = m - claimed
            claimed = m if claimed is None else claimed + m
            parts[colour] = m
        return parts


def inset(cs, d=FILLET + 0.6):
    return cs.offset(-d, circular_segments=SEG)


# ---------------------------------------------------------------- the six friends
def ladybug():
    body, head = circle(26, 0, -5), circle(13.5, 0, 20)
    p = Piece("ladybug", "Ladybug", "Bumpy spots", body + head)
    for (x, y) in [(-15.5, -12), (15.5, -12), (-7, -21), (7, -21)]:
        p.add("Black", dome(x, y, 5.2, 3.0))
    b, _ = face(0, 6, 1.0)   # no cheeks: they'd vanish on the red shell
    for m in b:
        p.add("Black", m)
    p.region("Black", head - body)
    p.region("Red", body)
    return p


def bee(blush="Pink"):
    body = ellipse(29, 21, 0, -4)
    wings = circle(11.5, -9, 17) + circle(11.5, 9, 17)
    sting = circle(6.5, 28, -4)
    p = Piece("bee", "Bee", "Ridged stripes", body + wings + sting)
    inner = inset(body)
    for x in (7.5, 18.0):
        R, h = 4.2, 2.2
        ridge = Manifold.cylinder(80, R, R, SEG).rotate((90, 0, 0)).translate((x, 40, H + h - R))
        p.add("Black", ridge ^ above() ^ prism(inner))
    b, c = face(-11, -3, 0.95)
    for m in b:
        p.add("Black", m)
    for m in c:
        p.add(blush, m)
    p.region("White", wings - body)
    p.region("Black", sting - body)
    p.region("Yellow", body)
    return p


def flower():
    centre = circle(14, 0, 0)
    petals = union([circle(12.5, 19 * math.cos(math.radians(90 + 60 * i)),
                           19 * math.sin(math.radians(90 + 60 * i))) for i in range(6)])
    p = Piece("flower", "Flower", "Petal grooves", petals + centre)
    for i in range(6):
        a = math.radians(90 + 60 * i)
        for da in (-11, 0, 11):
            aa = a + math.radians(da)
            pts = [(r * math.cos(aa), r * math.sin(aa)) for r in (17.0, 26.5)]
            p.cuts.append(capsule_path(pts, 1.15, H))
    b, c = face(0, -1, 0.95)
    for m in b:
        p.add("Black", m)
    for m in c:
        p.add("Pink", m)
    p.region("Yellow", centre)
    p.region("Pink", petals - centre)
    return p


def frog(blush="Red"):
    body = ellipse(29.5, 22, 0, -6)
    bumps = circle(10, -15.5, 13) + circle(10, 15.5, 13)
    p = Piece("frog", "Frog", "Dimples", body + bumps)
    for x in (-15.5, 15.5):
        p.add("Black", dome(x, 14, 4.2, 2.4))
    p.add("Black", capsule_path(arc_pts(0, 2, 8.5, 210, 330, 20), 1.0, H) ^ above())
    for x in (-19, 19):
        p.add(blush, Manifold.extrude(ellipse(3.2, 2.0, x, -1.5), 0.6).translate((0, 0, H)))
    # belly dimples on a little hex grid
    for row, y in enumerate((-12.5, -18.5, -24.0)):
        xs = {0: (-12, -4, 4, 12), 1: (-16, -8, 0, 8, 16), 2: (-8, 0, 8)}[row]
        for x in xs:
            p.cuts.append(dimple(x, y, 2.6, 1.4))
    p.region("Green", body + bumps)
    return p


def snail():
    shell = circle(21.5, 8, 6)
    foot = (ellipse(30, 7, 0, -20.5) + circle(12, -22, -6))
    p = Piece("snail", "Snail", "Swirly ridge", shell + foot)
    pts, turns = [], 2.4
    for i in range(160):
        t = i / 159 * turns * 2 * math.pi
        r = 2.5 + t * 14.5 / (turns * 2 * math.pi)
        pts.append((8 + r * math.cos(t + math.pi), 6 + r * math.sin(t + math.pi)))
    p.add("Black", capsule_path(pts, 1.7, H) ^ above())
    b, c = face(-22, -6, 0.62)
    for m in b:
        p.add("Black", m)
    for m in c:
        p.add("Red", m)
    p.region("Purple", shell)
    p.region("Green", foot - shell)
    return p


def caterpillar():
    head = circle(12, -20, 6)
    segs = [circle(9.5, -4, -3), circle(9.5, 10.5, -6.5), circle(9.5, 24.5, -3)]
    p = Piece("caterpillar", "Caterpillar", "Rolling humps", head + union(segs))
    for s, (x, y) in zip(segs, [(-4, -3), (10.5, -6.5), (24.5, -3)]):
        p.add("Green", dome(x, y, 6.4, 2.8))
    b, c = face(-20, 5, 0.66)
    for m in b:
        p.add("Black", m)
    for m in c:
        p.add("Red", m)
    p.region("Purple", head)
    p.region("Green", union(segs) - head)
    return p


# ---------------------------------------------------------------- tray
CELL, MARGIN, TRAY_T, POCKET, CLEAR = 78.0, 8.0, 14.0, 9.0, 0.6


def tray(pieces, layout):
    cols, rows = 3, 2
    w, h = cols * CELL + 2 * MARGIN, rows * CELL + 2 * MARGIN
    outline = CrossSection.square((w - 28, h - 28), center=True).offset(14, circular_segments=SEG)
    t = rounded_slab(outline, TRAY_T, 2.0)
    cuts = []
    for p, (cx, cy) in zip(pieces, layout):
        pocket = p.outline.offset(CLEAR, circular_segments=SEG).translate((cx, cy))
        cuts.append(Manifold.extrude(pocket, POCKET + 5).translate((0, 0, TRAY_T - POCKET)))
        # push-out hole through the floor (only where the pocket is)
        hole = (circle(8, cx, cy) ^ pocket)
        cuts.append(Manifold.extrude(hole, TRAY_T + 2).translate((0, 0, -1)))
    return t - Manifold.batch_boolean(cuts, manifold3d_add()), (w, h)


def tray_layout():
    xs = [(-1 + c) * CELL for c in range(3)]
    ys = [CELL / 2, -CELL / 2]
    return [(x, y) for y in ys for x in xs]


# ---------------------------------------------------------------- export
def mesh_arrays(m):
    mm = m.to_mesh()
    return np.asarray(mm.vert_properties)[:, :3].astype(np.float64), np.asarray(mm.tri_verts).astype(np.int64)


def write_stl(path, m):
    v, t = mesh_arrays(m)
    tri = v[t]
    n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    rec = np.zeros(len(t), dtype=[("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")])
    rec["n"], rec["v"] = n, tri
    with open(path, "wb") as f:
        f.write(b"Garden Friends sensory set".ljust(80, b" "))
        f.write(np.uint32(len(t)).tobytes())
        f.write(rec.tobytes())


def write_3mf(path, title, objects, slots):
    """objects: list of (name, {colour: Manifold}, (x, y)). Each becomes one
    multi-part object (parts keep their positions when you arrange the plate)."""
    out = ['<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" '
           'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n',
           f'<metadata name="Title">{title}</metadata>\n<metadata name="Application">Garden Friends maker</metadata>\n<resources>\n',
           '<basematerials id="1">\n']
    for c in slots:
        out.append(f'<base name="{c}" displaycolor="{COLORS[c]}FF"/>\n')
    out.append('</basematerials>\n')
    nid, items = 2, []
    for name, parts, (x, y) in objects:
        comp_ids = []
        for colour, m in parts.items():
            v, t = mesh_arrays(m)
            out.append(f'<object id="{nid}" type="model" name="{name} {colour} - slot {slots.index(colour) + 1}" '
                       f'pid="1" pindex="{slots.index(colour)}"><mesh><vertices>\n')
            out.append("\n".join(f'<vertex x="{a:.3f}" y="{b:.3f}" z="{c:.3f}"/>' for a, b, c in v))
            out.append("\n</vertices><triangles>\n")
            out.append("\n".join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in t))
            out.append("\n</triangles></mesh></object>\n")
            comp_ids.append(nid)
            nid += 1
        out.append(f'<object id="{nid}" type="model" name="{name}"><components>\n')
        out.extend(f'<component objectid="{i}"/>\n' for i in comp_ids)
        out.append("</components></object>\n")
        items.append((nid, x, y))
        nid += 1
    out.append("</resources>\n<build>\n")
    for i, x, y in items:
        out.append(f'<item objectid="{i}" transform="1 0 0 0 1 0 0 0 1 {x:.3f} {y:.3f} 0"/>\n')
    out.append("</build>\n</model>\n")
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>\n')
        z.writestr("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>\n')
        z.writestr("3D/3dmodel.model", "".join(out))


def main():
    os.makedirs(os.path.join(OUT, "stl", "parts"), exist_ok=True)
    pieces = [ladybug(), bee(), flower(), frog(), snail(), caterpillar()]
    built = {}
    for p in pieces:
        parts = p.build()
        built[p.key] = parts
        whole = Manifold.batch_boolean(list(parts.values()), manifold3d_add())
        assert whole.status().name == "NoError", p.key
        write_stl(os.path.join(OUT, "stl", f"{p.key}.stl"), whole)
        for colour, m in parts.items():
            write_stl(os.path.join(OUT, "stl", "parts", f"{p.key}-{colour.lower()}.stl"), m)
        bb = whole.bounding_box()
        print(f"{p.title:12s} {bb[3]-bb[0]:5.1f} x {bb[4]-bb[1]:5.1f} x {bb[5]-bb[2]:4.1f} mm  parts: {', '.join(parts)}")

    t, (tw, th) = tray(pieces, tray_layout())
    write_stl(os.path.join(OUT, "stl", "tray.stl"), t)
    print(f"Tray         {tw:5.1f} x {th:5.1f} x {TRAY_T:4.1f} mm")

    by = {p.key: p for p in pieces}
    plates = [
        ("plate1-bee-flower.3mf", ["Yellow", "Black", "White", "Pink"],
         [("bee", (-40, 0)), ("flower", (40, 0))]),
        ("plate2-ladybug-frog-snail-caterpillar.3mf", ["Red", "Green", "Purple", "Black"],
         [("ladybug", (-42, 42)), ("frog", (42, 42)), ("snail", (-42, -42)), ("caterpillar", (42, -42))]),
    ]
    for fname, slots, objs in plates:
        write_3mf(os.path.join(OUT, fname), "Garden Friends " + fname[:6],
                  [(by[k].title, built[k], xy) for k, xy in objs], slots)
    write_3mf(os.path.join(OUT, "plate3-tray.3mf"), "Garden Friends tray",
              [("Tray", {"Cream": t}, (0, 0))], ["Cream"])

    with open(os.path.join(OUT, "print-guide.txt"), "w") as f:
        f.write(GUIDE)
    return pieces, built, t


GUIDE = """GARDEN FRIENDS SENSORY PUZZLE - print guide (Bambu Lab P1S + AMS)
=====================================================================

What you get
  6 chunky critter pieces, each with a different texture to feel:
    Ladybug      bumpy spots          Bee          ridged stripes
    Flower       petal grooves        Frog         dimples
    Snail        swirly ridge         Caterpillar  rolling humps
  1 tray (250 x 172 x 14 mm) with a matching pocket for each piece and a
  push-out hole under every pocket.

Plates and AMS slots
  plate1-bee-flower.3mf
    Slot 1 Yellow   Slot 2 Black   Slot 3 White   Slot 4 Pink
  plate2-ladybug-frog-snail-caterpillar.3mf
    Slot 1 Red      Slot 2 Green   Slot 3 Purple  Slot 4 Black
  plate3-tray.3mf
    One colour (cream, white, light wood PLA all look nice)

In Bambu Studio
  1. File > Import > Import 3MF/STL. If asked, load geometry only.
  2. Each piece imports as ONE object made of coloured parts. Every part's
     name ends in "- slot N": in the Objects list, set that part's filament
     to slot N.
  3. Press A to arrange. Print flat side down. No supports needed.
  4. Settings that work well: 0.2 mm layers, 3 walls, 15% gyroid infill,
     4 top layers. PLA or PETG.

Single-colour printer?
  Use stl/<piece>.stl. Every texture is real geometry, so the set still
  works by touch in one colour.

Fit
  Pockets are 0.6 mm bigger than the pieces on every side. If your printer
  runs tight, scale the tray to 101% in X and Y (not Z).

Selling it
  These designs are original, so you can sell the prints. If you sell to
  children, check your local toy safety rules first (in the US: CPSIA
  testing + a Children's Product Certificate; in the EU/UK: EN 71 / UKCA
  marking). Every piece is far larger than a small-parts choking cylinder,
  but always use a toy-safe filament and print solidly (3+ walls) so no
  features can snap off.
"""

if __name__ == "__main__":
    main()
