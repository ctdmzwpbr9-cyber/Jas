"""Sensory Potion Kit: themed packaging built on the sliding-lid box.

Same box as make_box.py (220 x 175 x 100 mm outside, open top, sliding lid,
back-wall stop, click bump), dressed for the potion kit:
  * Box: single colour (Light Blue). Waves and bubbles are sunk 0.8 mm into all
    four sides, with "SENSORY POTION KIT" on both long sides. No colour changes,
    so it prints as fast as the plain box.
  * Lid: Light Blue plate with raised Pink artwork on top (potion bottle,
    bubbles, starfish, title, border). The colour change happens only in the
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
DEBOSS = 0.8      # depth of the side decoration
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


# ---------------------------------------------------------------- lid art
def lid_art():
    """Raised artwork in lid coordinates (lid is 218.5 x 172; x=0 is the thumb-grip end)."""
    lx = mb.L - mb.WALL + mb.GD - mb.GAP_XY
    ly = mb.D - 2 * (mb.WALL - mb.GD) - 2 * mb.GAP_XY
    x0, x1, y0, y1 = 27.0, lx - 10.0, 7.0, ly - 7.0      # clear of grip, side lips and back wall
    parts = [ring(rrect(x0, y0, x1, y1, 10), 2.0)]

    # Potion flask: round body, neck, lip, cork; liquid with a wavy surface and bubbles.
    bx, by, br = 72.0, 72.0, 31.0
    flask = circle(br, bx, by) + rect(bx - 10, by + 20, bx + 10, by + br + 22) \
        + rrect(bx - 15, by + br + 20, bx + 15, by + br + 27, 2.5)
    parts.append(ring(flask, 2.6))
    parts.append(rrect(bx - 8, by + br + 27, bx + 8, by + br + 37, 2.5))          # cork
    surface = [(x, by + 6 + 2.2 * math.sin(2 * math.pi * (x - bx + br) / 15))
               for x in np.linspace(bx + br + 1, bx - br - 1, 80)]
    above = CrossSection([surface + [(bx - br - 1, by + 300), (bx + br + 1, by + 300)]])
    liquid = circle(br - 5.5, bx, by) - above
    for (dx, dy, r) in [(-10, -8, 3.5), (6, -14, 2.5), (12, -2, 4.0), (-2, 2, 2.0), (-14, -20, 2.0)]:
        liquid = liquid - circle(r, bx + dx, by + dy)
    parts.append(liquid)
    # Bubbles rising out of the flask
    for (dx, dy, r) in [(16, 70, 4.5), (24, 82, 3.0), (10, 86, 2.2)]:
        parts.append(ring(circle(r, bx + dx, by + dy), 1.4))
    # Sparkles
    parts.append(star(bx - 26, by + 52, 6, 2.2))
    parts.append(star(bx + 30, by + 44, 4, 1.5))

    # Title
    tx = (118 + x1 - 6) / 2
    tw = x1 - 6 - 118
    parts.append(text(TITLE[0], 11, tx, 125, tw))
    parts.append(text(TITLE[1], 24, tx, 92, tw))
    parts.append(text(TITLE[2], 24, tx, 56, tw))
    # Underline wave and a starfish
    parts.append(wave(tx - 38, tx + 38, 34, 2.0, 19, 2.2))
    parts.append(star(x1 - 18, 20, 8, 3.6))
    for (x, y, r) in [(x1 - 40, 18, 2.6), (x1 - 48, 24, 1.8), (124, 140, 2.8)]:
        parts.append(ring(circle(r, x, y), 1.3))
    return union(parts)


# ---------------------------------------------------------------- side decoration
def side_pattern(w, with_text):
    """2D pattern for one outside face, u across (0..w), v up (0..H)."""
    parts = [wave(6, w - 6, 14, 2.5, 22, 2.6), wave(6, w - 6, 24, 2.5, 22, 2.0).translate((11, 0))
             ^ rect(6, 0, w - 6, 40)]
    rng = np.random.default_rng(7 if with_text else 3)
    spots = []
    while len(spots) < (10 if with_text else 12):
        u, v, r = rng.uniform(14, w - 14), rng.uniform(34, 84), rng.uniform(2.0, 4.5)
        if with_text and abs(v - 58) < 13:
            continue
        if all(math.hypot(u - a, v - b) > r + c + 5 for a, b, c in spots):
            spots.append((u, v, r))
    parts += [ring(circle(r, u, v), 1.3) for u, v, r in spots]
    if with_text:
        parts.append(text(SIDE_TEXT, 11, w / 2, 58, w - 30))
    return union(parts)


def face_cutter(w, with_text):
    """Cutter for the face at y=0 spanning x 0..w (sinks DEBOSS into the wall)."""
    m = Manifold.extrude(side_pattern(w, with_text), DEBOSS + 1.0).translate((0, 0, -DEBOSS))
    return m.rotate((90, 0, 0))     # (u, v, w) -> (u, -w, v): y from -1 to +DEBOSS


def make_box():
    b = mb.make_box()
    L, D = mb.L, mb.D
    front = face_cutter(L, True)
    back = face_cutter(L, True).rotate((0, 0, 180)).translate((L, D, 0))
    left = face_cutter(D, False).rotate((0, 0, -90)).translate((0, D, 0))
    right = face_cutter(D, False).rotate((0, 0, 90)).translate((L, 0, 0))
    return b - front - back - left - right


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
