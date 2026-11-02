# Textured bubble letters

Puffy 3D-looking letters with a fleece or sandy-ceramic texture, drawn in the
browser with plain Canvas 2D. It needs no libraries and no build step.

Open `index.html` in a browser. You can change the text, the colours, how puffy
and chubby the letters are, how strong the texture is, and the background. Use
**Download PNG** to save the image.

| Fleece | Ceramic |
| --- | --- |
| ![fleece](screenshots/fleece.png) | ![ceramic](screenshots/ceramic.png) |

## How it works (`bubble-letters.js`)

Each letter is rendered separately:

1. **Mask**: the letter is drawn in a rounded font (Fredoka, Baloo 2 or
   Sniglet) with a thick round-joined stroke. The stroke makes it chubbier and
   rounds every corner.
2. **Distance transform**: an exact Euclidean distance transform gives each
   pixel's distance from the letter's edge.
3. **Inflate**: distance becomes height with a circular profile,
   `h = R·√(1-(1-d/R)²)`, so every stroke becomes a round tube, like a pillow.
   A small blur smooths the crease along the middle of each stroke.
4. **Texture**: procedural value noise is added to the height.
   *Fleece* combines fine fibres with soft clumps. *Ceramic* combines fine
   sandy grain with occasional dark speckles.
5. **Shade**: normals are computed from the height and lit by a light at the
   upper left. Fleece uses wrapped diffuse light with a velvet rim sheen.
   Ceramic uses a faint matte specular highlight. Lower areas get some ambient
   occlusion.
6. **Composite**: the letter is placed on the scene with a soft drop shadow and
   a tighter contact shadow.
