# Sliding-lid packaging box

Outside size: **220 mm wide × 175 mm deep × 100 mm high**, open at the top.

- `out/box.stl`: the box body
- `out/lid.stl`: the sliding lid
- `make_box.py`: regenerates both (`pip install manifold3d numpy`, then `python3 make_box.py`).
  All sizes are at the top of the file.

**How it works:** the lid slides in through the lowered front wall, running in grooves
in the side walls. It stops against the back wall, which also has a groove. A small bump on top
of the front wall clicks into a notch under the lid, so the lid stays shut. To open it,
push the thumb ridges near the front edge.

**Quick print (Bambu P1S, 0.4 nozzle, PLA):** print each part on its own plate, flat side down,
with no supports (the groove roofs are 45° chamfers). Use the 0.28 mm Extra Draft profile,
2 walls and 0 to 10% infill. The box is mostly walls, so infill hardly matters. The lid prints
with its notch facing down, and the notch only removes material, so no supports are needed there either.
