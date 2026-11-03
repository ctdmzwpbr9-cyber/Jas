"""Sensory Potion Kit: themed packaging built on the sliding-lid box.

Same box as make_box.py (220 x 177 x 100 mm outside, open top, sliding lid,
back-wall stop, click bump), dressed for the potion kit:
  * Box: single colour (Light Blue), mermaid theme. Walls are 1.6 mm thick,
    with a full 2.4 mm band at the top (holds the lid grooves and stiffens the
    rim) and a 5 mm foot band at the bottom. Waves, shells, mermaid tails,
    stars and bubbles stand 0.6 mm proud of the thin wall, and the full-width
    waves act as stiffening ribs. The outline stays exactly 220 x 177 x 100 mm.
  * Lid: Light Blue plate with raised Pink artwork on top (mermaid tail,
    shells, starfish, bubbles, title, border). The colour change happens only in the
    top 3 layers, so the AMS swaps a few times at the very end.

Run:  python3 potion_box.py     (needs: pip install manifold3d numpy fonttools)
Output in ./out/potion:
  potion-lid.3mf     lid as one object with two parts: base (slot 1 Light Blue), art (slot 2 Pink)
  box.stl            the box (any single colour)
  lid-base.stl, lid-art.stl   the same lid parts as separate STLs
"""
import math
import os
import zipfile

import numpy as np
from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont
from manifold3d import CrossSection, FillRule, Manifold

import make_box as mb

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out", "potion")
FONT = os.path.join(HERE, "fonts", "TitanOne-Regular.ttf")   # SIL Open Font License
TITLE = ["SENSORY", "POTION", "KIT"]
SIDE_TEXT = "SENSORY POTION KIT"

ART_H = 0.84      # raised lid art = 3 layers at 0.28 mm
THIN = 1.6        # wall thickness below the top band (4 lines with a 0.4 nozzle)
RECESS = 0.6      # side relief height; the thin wall sits this far in from the outline
PLINTH = 5.0      # full-thickness foot band at the bottom
RECESS_TOP = mb.G_BOT - 6.0   # where the thick top band (grooves) begins on the outside
SEG = 64
COLORS = {"Light Blue": "#A8DDE8", "Pink": "#F0457E"}


# ---------------------------------------------------------------- 2D helpers
def circle(r, x, y):
    return CrossSection.circle(r, SEG).translate((x, y))


def rect(x0, y0, x1, y1):
    return CrossSection.square((x1 - x0, y1 - y0)).translate((x0, y0))


def rrect(x0, y0, x1, y1, r):
    return rect(x0 + r, y0 + r, x1 - r, y1 - r).offset(r, circular_segments=SEG)


def ring(cs, w):
    return cs - cs.offset(-w, circular_segments=SEG)


def union(items):
    out = CrossSection()
    for it in items:
        out = out + it
    return out


def polyline(pts, w):
    """Thick line through pts with round ends."""
    r = w / 2
    return union(CrossSection.batch_hull([circle(r, *a), circle(r, *b)]) for a, b in zip(pts, pts[1:]))


def wave(x0, x1, y, amp, period, w):
    n = max(2, int((x1 - x0) / 1.5))
    xs = np.linspace(x0, x1, n)
    return polyline([(x, y + amp * math.sin(2 * math.pi * (x - x0) / period)) for x in xs], w)


def star(x, y, r_out, r_in, rot=90):
    pts = []
    for i in range(10):
        r = r_out if i % 2 == 0 else r_in
        a = math.radians(rot + i * 36)
        pts.append((x + r * math.cos(a), y + r * math.sin(a)))
    return CrossSection([pts]).offset(0.8, circular_segments=SEG).offset(-0.8, circular_segments=SEG)


# ---------------------------------------------------------------- text
class _Pen(BasePen):
    def __init__(self, glyphset):
        super().__init__(glyphset)
        self.contours, self.cur = [], []

    def _moveTo(self, p):
        self.cur = [p]

    def _lineTo(self, p):
        self.cur.append(p)

    def _qCurveToOne(self, p1, p2):
        p0 = self.cur[-1]
        for t in np.linspace(0, 1, 9)[1:]:
            self.cur.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
                             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]))

    def _curveToOne(self, p1, p2, p3):
        p0 = self.cur[-1]
        for t in np.linspace(0, 1, 11)[1:]:
            a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3
            self.cur.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
                             a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))

    def _closePath(self):
        if len(self.cur) > 2:
            self.contours.append(self.cur)
        self.cur = []

    _endPath = _closePath


_font = TTFont(FONT)
_gs = _font.getGlyphSet()
_cmap = _font.getBestCmap()
_cap = _font["OS/2"].sCapHeight or 0.7 * _font["head"].unitsPerEm


def text(s, cap_h, cx, cy, max_w=None, spacing=0.04):
    """Text centred on (cx, cy) with capital letters cap_h tall."""
    k = cap_h / _cap
    contours, x = [], 0.0
    for ch in s:
        g = _cmap.get(ord(ch))
        if g is None:
            continue
        pen = _Pen(_gs)
        _gs[g].draw(pen)
        contours += [[(x + px, py) for px, py in c] for c in pen.contours]
        x += _gs[g].width + spacing * _font["head"].unitsPerEm
    x -= spacing * _font["head"].unitsPerEm
    if max_w and x * k > max_w:
        k = max_w / x
    cs = CrossSection(contours, FillRule.NonZero).scale((k, k))
    return cs.translate((cx - x * k / 2, cy - _cap * k / 2))


# ---------------------------------------------------------------- mermaid shapes
def rot(cs, deg, x, y):
    return cs.rotate(deg).translate((x, y))


def shell(x, y, s, deg=0.0, ribs=7):
    """Scallop shell, hinge at the bottom, about s tall. Ribs are cut as grooves."""
    t0, t1 = math.radians(28), math.radians(152)
    pts = [(0.10 * s, 0.0)]
    for i in range(121):
        t = t1 - (t1 - t0) * i / 120          # left to right along the scalloped edge
        k = (t1 - t) / (t1 - t0)
        r = s * (0.86 + 0.09 * abs(math.sin(ribs * math.pi * k)))
        pts.append((r * math.cos(t), r * math.sin(t)))
    pts = [(0.10 * s, 0.0)] + pts[::-1][:-1] + [(-0.10 * s, 0.0)]
    body = CrossSection([pts]).offset(-0.6, circular_segments=SEG).offset(0.6, circular_segments=SEG)
    ears = rrect(-0.30 * s, -0.10 * s, 0.30 * s, 0.10 * s, 0.06 * s)
    grooves = []
    for i in range(1, ribs):
        t = t1 - (t1 - t0) * i / ribs
        grooves.append(polyline([(0.06 * s * math.cos(t), 0.16 * s),
                                 (0.80 * s * math.cos(t), 0.80 * s * math.sin(t))], max(0.8, 0.05 * s)))
    grooves.append(polyline([(-0.28 * s, 0.10 * s), (0.28 * s, 0.10 * s)], max(0.8, 0.04 * s)))
    return rot(body + ears - union(grooves), deg, x, y)


def tail(x, y, s, deg=0.0, flip=False):
    """Mermaid tail: curved scaly body from the waist (top, at x, y) down to a two-lobed fin."""
    n = 40
    pts, wid = [], []
    for i in range(n + 1):
        t = i / n
        px = 0.16 * s * math.sin(math.pi * t) * (-1 if flip else 1)
        pts.append((px, -0.72 * s * t))
        wid.append(s * (0.115 - 0.085 * t ** 0.8))
    body = union(CrossSection.batch_hull([circle(wa, *pa), circle(wb, *pb)])
                 for pa, pb, wa, wb in zip(pts, pts[1:], wid, wid[1:]))
    body = body - rect(-s, 0, s, s)                                   # flat waist
    ex, ey = pts[-1]
    (dx, dy) = (pts[-1][0] - pts[-4][0], pts[-1][1] - pts[-4][1])
    base = math.degrees(math.atan2(dy, dx))
    fin, fin_lines = CrossSection(), []
    for side in (-1, 1):
        a = math.radians(base + side * 42)
        cx, cy = ex + 0.13 * s * math.cos(a), ey + 0.13 * s * math.sin(a)
        lobe = CrossSection.circle(1, SEG).scale((0.16 * s, 0.065 * s)).rotate(math.degrees(a)).translate((cx, cy))
        fin = fin + CrossSection.batch_hull([lobe, circle(0.035 * s, ex, ey)])
        for k in (-0.45, 0.45):
            b2 = a + k * 0.30
            fin_lines.append(polyline([(ex + 0.07 * s * math.cos(a), ey + 0.07 * s * math.sin(a)),
                                       (ex + 0.24 * s * math.cos(b2), ey + 0.24 * s * math.sin(b2))], 0.9))
    fin = fin.offset(0.8, circular_segments=SEG).offset(-0.8, circular_segments=SEG)
    # scales: little U-shaped grooves in rows, kept off the outline
    r = 0.042 * s
    scales = []
    for row in range(1, 30):
        yy = -row * 1.5 * r
        if yy < -0.64 * s:
            break
        off = (row % 2) * r
        for col in range(-6, 7):
            xx = col * 2 * r + off
            arc = ring(circle(r, xx, yy), 0.8) - rect(xx - 2 * r, yy, xx + 2 * r, yy + 2 * r)
            scales.append(arc)
    scales = union(scales) ^ body.offset(-1.6, circular_segments=SEG)
    waist = polyline([(-0.11 * s, -0.05 * s), (0.11 * s, -0.05 * s)], 1.0) ^ body.offset(-1.0, circular_segments=SEG)
    fin_cut = union(fin_lines) ^ fin.offset(-1.4, circular_segments=SEG)
    shape = body + fin - scales - waist - fin_cut
    return rot(shape, deg, x, y)


def bubbles(spots, w=1.3):
    return union(ring(circle(r, u, v), w) for u, v, r in spots)


# ---------------------------------------------------------------- lid art
def lid_art():
    """Raised artwork in lid coordinates (lid is 218.5 x 172; x=0 is the thumb-grip end)."""
    lx = mb.L - mb.WALL + mb.GD - mb.GAP_XY
    ly = mb.D - 2 * (mb.WALL - mb.GD) - 2 * mb.GAP_XY
    x0, x1, y0, y1 = 27.0, lx - 10.0, 7.0, ly - 7.0      # clear of grip, side lips and back wall
    parts = [ring(rrect(x0, y0, x1, y1, 10), 2.0)]
    parts.append(tail(80, 160, 116, 0, flip=True))
    parts.append(shell(44, 24, 18, -18))
    parts.append(shell(108, 20, 15, 16))
    parts.append(star(42, 70, 7, 3.2, 80))
    parts.append(bubbles([(108, 150, 4.5), (114, 138, 3.0), (106, 128, 2.2), (40, 132, 3.2), (46, 120, 2.0)]))

    tx = (122 + x1 - 6) / 2
    tw = x1 - 6 - 122
    parts.append(text(TITLE[0], 11, tx, 132, tw))
    parts.append(text(TITLE[1], 24, tx, 100, tw))
    parts.append(text(TITLE[2], 24, tx, 64, tw))
    parts.append(wave(tx - 36, tx + 36, 42, 2.0, 18, 2.2))
    parts.append(shell(tx - 14, 15, 16, -10))
    parts.append(star(tx + 22, 23, 8, 3.6))
    parts.append(bubbles([(tx + 40, 16, 2.4), (tx + 36, 28, 1.6), (tx - 40, 148, 2.6)]))
    return union(parts) ^ rect(x0, y0, x1, y1).offset(0.01)


# ---------------------------------------------------------------- box sides
def side_pattern(w, long_side):
    """Raised relief for one outside face, u across (0..w), v up. Horizontal
    waves run the full width and double as stiffening ribs."""
    parts = [wave(4, w - 4, 16, 2.5, 22, 3.0), wave(4, w - 4, 26, 2.5, 22, 2.4).translate((11, 0))
             ^ rect(4, 0, w - 4, 40)]
    if long_side:
        parts.append(text(SIDE_TEXT, 11, w / 2, 62, w - 110))
        parts += [shell(w / 2 - 78, 36, 14, -12), shell(w / 2 + 78, 36, 14, 12),
                  tail(26, 88, 40, -6), tail(w - 26, 88, 40, 6, flip=True),
                  star(w / 2 - 60, 80, 5.5, 2.4), star(w / 2 + 30, 40, 6, 2.6, 80)]
        parts.append(bubbles([(w / 2 - 40, 82, 3.2), (w / 2 + 10, 84, 2.2), (w / 2 + 40, 80, 3.6),
                              (w / 2 - 30, 42, 2.6), (w / 2 + 4, 44, 3.4), (60, 80, 2.4), (w - 60, 82, 2.4)]))
    else:
        parts += [shell(w / 2, 46, 26), star(w / 2 - 46, 70, 7, 3.0), star(w / 2 + 48, 60, 5, 2.2, 80)]
        parts.append(bubbles([(30, 50, 3.0), (40, 80, 2.2), (w - 34, 82, 3.4), (w - 26, 46, 2.4),
                              (w / 2 + 20, 82, 2.6), (w / 2 - 22, 84, 1.8)]))
    return union(parts) ^ rect(3, PLINTH + 0.5, w - 3, RECESS_TOP - 0.5)


def face_relief(w, long_side):
    """Relief for the face at y=0 spanning x 0..w: from the recessed wall (y=RECESS)
    out to the full box outline (y=0), so the box stays exactly 220 x 175."""
    m = Manifold.extrude(side_pattern(w, long_side), RECESS + 0.3).translate((0, 0, -RECESS - 0.3))
    return m.rotate((90, 0, 0))     # (u, v, w) -> (u, -w, v): y from 0 to RECESS + 0.3


def make_box():
    L, D, t = mb.L, mb.D, 0.01
    b = mb.make_box(thin=RECESS + THIN)
    # Recess the outside of the thin wall between the plinth and the top band;
    # the band edge gets a 45 degree chamfer so nothing overhangs.
    keep = box3(RECESS, RECESS, PLINTH - 1, L - RECESS, D - RECESS, RECESS_TOP)
    b = b - (box3(-1, -1, PLINTH, L + 1, D + 1, RECESS_TOP) - keep)
    b = b - (box3(-1, -1, RECESS_TOP - t, L + 1, D + 1, RECESS_TOP + RECESS) - Manifold.batch_hull([
        box3(RECESS, RECESS, RECESS_TOP - t, L - RECESS, D - RECESS, RECESS_TOP),
        box3(0, 0, RECESS_TOP + RECESS - t, L, D, RECESS_TOP + RECESS)]))
    front = face_relief(L, True)
    back = face_relief(L, True).rotate((0, 0, 180)).translate((L, D, 0))
    left = face_relief(D, False).rotate((0, 0, -90)).translate((0, D, 0))
    right = face_relief(D, False).rotate((0, 0, 90)).translate((L, 0, 0))
    return b + front + back + left + right


def box3(x0, y0, z0, x1, y1, z1):
    return Manifold.cube((x1 - x0, y1 - y0, z1 - z0)).translate((x0, y0, z0))


def make_lid():
    base = mb.make_lid()
    art = Manifold.extrude(lid_art(), ART_H).translate((0, 0, mb.LID_T))
    return base, art


# ---------------------------------------------------------------- export
def arrays(m):
    mm = m.to_mesh()
    return np.asarray(mm.vert_properties)[:, :3], np.asarray(mm.tri_verts)


def write_3mf(path, name, parts):
    """parts: list of (part name, colour, Manifold) -> one object, one part per colour."""
    slots = list(COLORS)
    out = ['<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" '
           'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n'
           f'<metadata name="Title">{name}</metadata>\n<resources>\n<basematerials id="1">\n']
    out += [f'<base name="{c}" displaycolor="{COLORS[c]}FF"/>\n' for c in slots]
    out.append('</basematerials>\n')
    ids = []
    for i, (pname, colour, m) in enumerate(parts):
        v, t = arrays(m)
        oid = i + 2
        out.append(f'<object id="{oid}" type="model" name="{pname} - slot {slots.index(colour) + 1} {colour}" '
                   f'pid="1" pindex="{slots.index(colour)}"><mesh><vertices>\n')
        out.append("\n".join(f'<vertex x="{a:.3f}" y="{b:.3f}" z="{c:.3f}"/>' for a, b, c in v))
        out.append("\n</vertices><triangles>\n")
        out.append("\n".join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in t))
        out.append("\n</triangles></mesh></object>\n")
        ids.append(oid)
    top = len(parts) + 2
    out.append(f'<object id="{top}" type="model" name="{name}"><components>\n')
    out += [f'<component objectid="{i}"/>\n' for i in ids]
    out.append(f'</components></object>\n</resources>\n<build>\n<item objectid="{top}" '
               'transform="1 0 0 0 1 0 0 0 1 20 40 0"/>\n</build>\n</model>\n')
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>\n')
        z.writestr("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>\n')
        z.writestr("3D/3dmodel.model", "".join(out))


def main():
    os.makedirs(OUT, exist_ok=True)
    box = make_box()
    base, art = make_lid()
    for name, m in (("box", box), ("lid-base", base), ("lid-art", art)):
        assert m.status().name == "NoError", name
        mb.write_stl(os.path.join(OUT, name + ".stl"), m, "Potion kit " + name)
        print(f"{name}: {m.volume() / 1000:.1f} cm3, {m.num_tri()} triangles")
    write_3mf(os.path.join(OUT, "potion-lid.3mf"), "Potion kit lid",
              [("Lid", "Light Blue", base), ("Lid art", "Pink", art)])


if __name__ == "__main__":
    main()
