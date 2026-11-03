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

**Fast print settings (Bambu Studio, P1S, 0.4 nozzle, PLA).** Print each part on its own plate,
flat side down. Neither part needs supports: the groove roofs are 45° chamfers, and the lid notch only removes material.

| Setting | Value | Why |
|---|---|---|
| Process preset | 0.28mm Extra Draft | fewest layers (about 360 instead of about 500 at 0.20) |
| Filament preset | Bambu PLA Basic, or Max volumetric speed 18-21 mm³/s | generic PLA is capped at 12 mm³/s, which is often the real limit |
| Wall loops | 3 | fills the 2.4 mm walls solid with long lines and no slow gap fill |
| Inner wall / sparse infill line width | 0.50 mm | fewer, fatter lines |
| Sparse infill density | 0% (box); 15% (lid) | the box walls are all perimeter anyway |
| Top shell layers | 0 (box); 3 (lid) | the box has no top surface to cover |
| Bottom shell layers | 4 (box); 3 (lid) | 1.2 mm floor |
| Ironing, prime tower | off | |
| Detect overhang walls / slow down for overhangs | off for the box | the only overhangs are the small 45° groove chamfers |

Print the box and the lid at the same time on two printers if you can. They don't fit on one bed together.
