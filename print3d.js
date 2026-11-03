/*
 * Bubble letters for 3D printing.
 *
 * Every letter becomes a watertight solid with a flat back (prints flat on
 * the bed, no supports) and a puffy domed front carrying a real, printable
 * surface texture. Export: one .3mf with every letter as a separate,
 * colour-named object (for Bambu Studio + AMS) plus one .stl per letter.
 *
 * Pipeline per letter:
 *   glyph mask (rounded font + round stroke) at the chosen mesh resolution
 *   -> distance transform -> circular "pillow" profile -> smoothing
 *   -> texture displacement in millimetres -> grid mesh with side walls
 *   -> boundary smoothing (removes pixel stair-steps) -> 3MF / STL.
 */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------- config --
  const FONTS = [
    { name: 'Fredoka', weight: 700 },
    { name: 'DynaPuff', weight: 700, chub: 0.35 },
    { name: 'Baloo 2', weight: 800 },
    { name: 'Sniglet', weight: 800 },
    { name: 'Chewy', weight: 400, chub: 0.7 },
    { name: 'Titan One', weight: 400, chub: 0.5 },
    { name: 'Lilita One', weight: 400, chub: 0.7 },
    { name: 'Bubblegum Sans', weight: 400 },
  ];
  const MIX = 'Mix';
  const TEXTURES = {
    smooth: 'Smooth',
    wool: 'Wool (yarn wrapped)',
    crochet: 'Crochet stitches',
    ceramic: 'Ceramic (sandy)',
    fluffy: 'Fluffy (soft lumps)',
    fuzzy: 'Fuzzy (fine fuzz)',
  };
  const SWATCHES = [
    ['Pink', '#f2a7c3'], ['Baby blue', '#a9c8e0'], ['Peach', '#f4c19a'], ['Lilac', '#c9b3e6'],
    ['Mint', '#b4dcc2'], ['Butter', '#f6df98'], ['Cream', '#f3ece0'], ['Coral', '#ef8f86'],
  ];
  const PLATE = 256; // Bambu Lab P1S build plate, mm

  const state = {
    defaults: {
      font: 'Fredoka', size: 80, color: '#f2a7c3', texture: 'crochet',
    },
    settings: {
      depth: 1, puff: 0.8, chub: 0.08, base: 2, detail: 0.4, backHalf: false,
    },
    letters: [],
    selected: 0,
  };

  const fontByName = (n) => FONTS.find((f) => f.name === n) || FONTS[0];

  // -------------------------------------------------------------- noise --
  function hash(x, y, seed) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed);
    const c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, seed, oct) {
    let s = 0, amp = 0.5, n = 0;
    for (let o = 0; o < oct; o++) { s += amp * vnoise(x, y, seed + o * 17); n += amp; x *= 2.03; y *= 2.03; amp *= 0.5; }
    return s / n;
  }

  // Surface texture height in mm at (x, y) mm. Roughly centred on 0.
  function textureHeight(type, x, y, seed) {
    switch (type) {
      case 'wool': {
        // yarn wrapped diagonally around the letter, with ply twist + fibres
        const ang = 0.6, ca = Math.cos(ang), sa = Math.sin(ang);
        const s = x * ca + y * sa, t = -x * sa + y * ca;
        const period = 2.6;
        const wob = (fbm(t * 0.12, s * 0.04, seed, 2) - 0.5) * 1.4;
        const ph = (s + wob) / period;
        const f = ph - Math.floor(ph);
        const prof = Math.sqrt(Math.max(0, 1 - (2 * f - 1) * (2 * f - 1)));
        const twist = Math.sin(2 * Math.PI * (t / 1.6 + f * 0.9)) * 0.12 * prof;
        const fibre = (vnoise(x * 2.2, y * 2.2, seed + 9) - 0.5) * 0.12;
        return 0.75 * prof + twist + fibre - 0.4;
      }
      case 'crochet': {
        // rows of single-crochet "V" stitches, alternate rows offset
        const p = 4.6, r = 4.0;
        const row = Math.floor(y / r);
        const off = (row & 1) ? p / 2 : 0;
        const u = ((x + off) % p + p) % p - p / 2;
        const v = ((y % r) + r) % r - r / 2;
        let best = 0;
        for (const side of [-1, 1]) {
          const cx = side * p * 0.22, a = -side * 0.42;
          const du = u - cx, ca = Math.cos(a), sa = Math.sin(a);
          const uu = du * ca - v * sa, vv = du * sa + v * ca;
          const q = 1 - (uu / (p * 0.25)) ** 2 - (vv / (r * 0.56)) ** 2;
          if (q > best) best = q;
        }
        const yarn = (vnoise(x * 1.8, y * 1.8, seed) - 0.5) * 0.1;
        return 0.95 * Math.sqrt(best) + yarn - 0.45;
      }
      case 'ceramic':
        return (vnoise(x * 1.6, y * 1.6, seed) - 0.5) * 0.28 + (fbm(x * 0.3, y * 0.3, seed + 3, 2) - 0.5) * 0.3;
      case 'fluffy':
        return (fbm(x * 0.17, y * 0.17, seed, 3) - 0.5) * 2.4 + (vnoise(x * 0.8, y * 0.8, seed + 5) - 0.5) * 0.45;
      case 'fuzzy':
        return (vnoise(x * 1.3, y * 1.3, seed) - 0.5) * 0.8 + (vnoise(x * 2.6, y * 2.6, seed + 1) - 0.5) * 0.4;
      default:
        return 0;
    }
  }

  // ---------------------------------------------- distance transform ----
  function edt1d(f, n, d, v, z) {
    let k = 0;
    v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let s;
      while (true) {
        const r = v[k];
        s = ((f[q] + q * q) - (f[r] + r * r)) / (2 * q - 2 * r);
        if (s <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break;
      }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      const r = v[k];
      d[q] = (q - r) * (q - r) + f[r];
    }
  }
  function distanceTransform(inside, w, h) {
    const grid = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) grid[i] = inside[i] ? 1e20 : 0;
    const n = Math.max(w, h);
    const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
      edt1d(f, h, d, v, z);
      for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
      edt1d(f, w, d, v, z);
      for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
    }
    const out = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = Math.sqrt(grid[i]);
    return out;
  }
  function boxBlur(src, w, h, r, passes) {
    r = Math.max(1, Math.round(r));
    const a = src, b = new Float32Array(w * h), win = 2 * r + 1;
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < h; y++) {
        const row = y * w; let sum = 0;
        for (let k = -r; k <= r; k++) sum += a[row + Math.min(w - 1, Math.max(0, k))];
        for (let x = 0; x < w; x++) {
          b[row + x] = sum / win;
          sum += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
        }
      }
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += b[Math.min(h - 1, Math.max(0, k)) * w + x];
        for (let y = 0; y < h; y++) {
          a[y * w + x] = sum / win;
          sum += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
        }
      }
    }
    return a;
  }

  // ------------------------------------------------------- glyph mask ----
  function rasterGlyph(ch, font, fontPx, strokePx, P = 2) {
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    const spec = `${font.weight} ${fontPx}px "${font.name}", "Arial Rounded MT Bold", sans-serif`;
    g.font = spec;
    const m = g.measureText(ch);
    const pad = Math.ceil(strokePx / 2 + 4);
    const l = Math.ceil(m.actualBoundingBoxLeft), r = Math.ceil(m.actualBoundingBoxRight);
    const a = Math.ceil(m.actualBoundingBoxAscent), d = Math.ceil(m.actualBoundingBoxDescent);
    const w = Math.max(1, l + r + pad * 2), h = Math.max(1, a + d + pad * 2);
    c.width = w; c.height = h;
    g.font = spec;
    g.fillStyle = '#000'; g.strokeStyle = '#000';
    g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = Math.max(0.01, strokePx);
    g.fillText(ch, pad + l, pad + a);
    if (strokePx > 0.5) g.strokeText(ch, pad + l, pad + a);
    const data = g.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] >= 128) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return null;
    const cw = x1 - x0 + 1 + 2 * P, chh = y1 - y0 + 1 + 2 * P;
    const inside = new Uint8Array(cw * chh);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (data[(y * w + x) * 4 + 3] >= 128) inside[(y - y0 + P) * cw + (x - x0 + P)] = 1;
    }
    return { inside, w: cw, h: chh, glyphH: y1 - y0 + 1 };
  }

  // Remove cells that touch only diagonally (would make a non-manifold edge).
  function fixDiagonals(inside, w, h) {
    let changed = true, guard = 0;
    while (changed && guard++ < 20) {
      changed = false;
      for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
        const a = inside[y * w + x], b = inside[y * w + x + 1];
        const c = inside[(y + 1) * w + x], d = inside[(y + 1) * w + x + 1];
        if (a && d && !b && !c) { inside[y * w + x + 1] = 1; changed = true; }
        else if (b && c && !a && !d) { inside[y * w + x] = 1; changed = true; }
      }
    }
  }

  // ---------------------------------------------------------- meshing ----
  //
  // Shape of a letter (cross-section through a stroke):
  //
  //        top grid (sd > B)          the domed front, on a regular grid
  //       /                \
  //   side rings (0 < sd < B)         rings that follow the outline exactly,
  //     |                    |        stepping down the steep part of the dome
  //   base wall (0..base mm)          vertical band at the outline
  //   flat back on the bed
  //
  // sd = signed distance to the outline in mm (positive inside), computed from
  // a supersampled mask so the outline is smooth, not pixel-stepped.

  function buildLetterMesh(L, S, seed) {
    const font = fontByName(L.font);
    const cell = S.detail;
    const chub = S.chub * (font.chub ?? 1); // already-chunky fonts need less
    const probe = rasterGlyph(L.char, font, 200, 200 * chub, 2);
    if (!probe) return null;
    const fontPxCells = 200 * (L.size / cell) / probe.glyphH; // font size in cells

    // supersampling factor for the distance field (bounded for big letters)
    const approxCells = (probe.w / probe.glyphH) * (L.size / cell) * (L.size / cell) * 1.2;
    const SS = Math.max(1, Math.min(4, Math.floor(Math.sqrt(2.5e6 / approxCells))));
    const px = cell / SS; // mm per supersampled pixel
    const gm = rasterGlyph(L.char, font, fontPxCells * SS, fontPxCells * SS * chub, 3 * SS + 4);
    if (!gm) return null;

    // signed distance field (mm), supersampled
    const W = gm.w, H = gm.h, NS = W * H;
    const invert = (m) => { const o = new Uint8Array(NS); for (let i = 0; i < NS; i++) o[i] = m[i] ? 0 : 1; return o; };
    // round off sharp inside corners (morphological closing, radius 0.6 mm)
    const rc = 0.6 / px;
    const d0 = distanceTransform(invert(gm.inside), W, H);
    const dil = new Uint8Array(NS);
    for (let i = 0; i < NS; i++) dil[i] = gm.inside[i] || d0[i] <= rc ? 1 : 0;
    const dd = distanceTransform(dil, W, H);
    const mask = new Uint8Array(NS);
    for (let i = 0; i < NS; i++) mask[i] = dd[i] > rc ? 1 : 0;
    for (let i = 0; i < NS; i++) if (gm.inside[i]) mask[i] = 1;
    const din = distanceTransform(mask, W, H);
    const dout = distanceTransform(invert(mask), W, H);
    const sdf = new Float32Array(NS);
    let maxSd = 0;
    for (let i = 0; i < NS; i++) {
      sdf[i] = (mask[i] ? din[i] - 0.5 : -(dout[i] - 0.5)) * px;
      if (sdf[i] > maxSd) maxSd = sdf[i];
    }
    // light blur removes the last pixel-level ripples from the field
    boxBlur(sdf, W, H, Math.max(1, Math.round(SS / 2)), 1);

    const Wmm = W * px, Hmm = H * px;
    // bilinear sample at (x, y) in mm, image orientation (y down)
    const sd = (x, y) => {
      let fx = x / px - 0.5, fy = y / px - 0.5;
      if (fx < 0) fx = 0; if (fy < 0) fy = 0;
      if (fx > W - 1.001) fx = W - 1.001; if (fy > H - 1.001) fy = H - 1.001;
      const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, i = iy * W + ix;
      return (sdf[i] * (1 - tx) + sdf[i + 1] * tx) * (1 - ty) + (sdf[i + W] * (1 - tx) + sdf[i + W + 1] * tx) * ty;
    };
    const ge = px * 0.75;
    const grad = (x, y) => [(sd(x + ge, y) - sd(x - ge, y)) / (2 * ge), (sd(x, y + ge) - sd(x, y - ge)) / (2 * ge)];
    // move a point along the gradient until sd == level
    const project = (x, y, level) => {
      for (let k = 0; k < 8; k++) {
        const s = sd(x, y) - level;
        if (Math.abs(s) < 1e-3) break;
        const [gx, gy] = grad(x, y);
        const g2 = gx * gx + gy * gy;
        if (g2 < 1e-4) break;
        let st = s / g2;
        const lim = 2 * cell;
        if (st > lim) st = lim; else if (st < -lim) st = -lim;
        x -= st * gx; y -= st * gy;
      }
      return [x, y];
    };

    // dome profile: circular cross-section, radius = half the thickest stroke
    const R = Math.max(maxSd, cell);
    const profile = (s) => {
      if (s <= 0) return 0;
      const t = Math.min(1, s / R);
      return S.puff * R * Math.sqrt(1 - (1 - t) * (1 - t));
    };
    const B = Math.max(1.5 * cell, 0.25 * R); // width of the side band

    // cell grid for the front
    const w = Math.ceil(Wmm / cell), h = Math.ceil(Hmm / cell);
    const inside = new Uint8Array(w * h);
    const dome = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = sd((x + 0.5) * cell, (y + 0.5) * cell);
      if (s > B) inside[y * w + x] = 1;
      dome[y * w + x] = profile(s);
    }
    fixDiagonals(inside, w, h);
    // blurred copy rounds off the crease along the middle of each stroke
    const domeBlur = boxBlur(dome.slice(), w, h, (0.15 * R) / cell, 2);
    const sampleCells = (arr, x, y) => {
      let fx = x / cell - 0.5, fy = y / cell - 0.5;
      if (fx < 0) fx = 0; if (fy < 0) fy = 0;
      if (fx > w - 1.001) fx = w - 1.001; if (fy > h - 1.001) fy = h - 1.001;
      const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, i = iy * w + ix;
      if (w === 1 || h === 1) return arr[i];
      return (arr[i] * (1 - tx) + arr[i + 1] * tx) * (1 - ty) + (arr[i + w] * (1 - tx) + arr[i + w + 1] * tx) * ty;
    };
    const smoothstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    const domeAt = (x, y) => {
      const s = sd(x, y);
      const p = profile(s);
      const wgt = smoothstep(B + 0.05 * R, B + 0.3 * R, s);
      return wgt > 0 ? p + (Math.min(p, sampleCells(domeBlur, x, y)) - p) * wgt : p;
    };
    const texFade = (domeH) => smoothstep(0, 2, domeH); // keep the bottom outline clean
    const sideSoft = (nz) => 0.5 + 0.5 * nz;             // calmer texture on steep sides
    const tex = (X, Y) => textureHeight(L.texture, X, Y, seed) * S.depth;

    // ---- vertices
    const CW = w + 1, CH = h + 1;
    const topId = new Int32Array(CW * CH).fill(-1);
    const corners = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!inside[y * w + x]) continue;
      for (const ci of [y * CW + x, y * CW + x + 1, (y + 1) * CW + x, (y + 1) * CW + x + 1]) {
        if (topId[ci] < 0) { topId[ci] = corners.length; corners.push(ci); }
      }
    }
    const nC = corners.length;
    if (!nC) return null;

    // outline edges of the top grid, oriented with the inside on the right
    const edges = [];
    const inAt = (x, y) => x >= 0 && y >= 0 && x < w && y < h && inside[y * w + x];
    const faces = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!inside[y * w + x]) continue;
      const a = y * CW + x, b = y * CW + x + 1, c = (y + 1) * CW + x + 1, d = (y + 1) * CW + x;
      faces.push(a, b, c, d);
      if (!inAt(x, y - 1)) edges.push(a, b);
      if (!inAt(x + 1, y)) edges.push(b, c);
      if (!inAt(x, y + 1)) edges.push(c, d);
      if (!inAt(x - 1, y)) edges.push(d, a);
    }

    // corner positions (image mm); outline corners are snapped onto sd == B
    const cx = new Float32Array(nC), cy = new Float32Array(nC);
    const isEdge = new Uint8Array(CW * CH);
    for (let k = 0; k < edges.length; k++) isEdge[edges[k]] = 1;
    for (let k = 0; k < nC; k++) {
      const ci = corners[k];
      let x = (ci % CW) * cell, y = Math.floor(ci / CW) * cell;
      if (isEdge[ci]) [x, y] = project(x, y, B);
      cx[k] = x; cy[k] = y;
    }
    // outline neighbours (each outline corner has exactly two)
    const ring = [];            // positions (k indices into corners) of outline corners
    const nbA = new Int32Array(nC).fill(-1), nbB = new Int32Array(nC).fill(-1);
    for (let e = 0; e < edges.length; e += 2) {
      const a = topId[edges[e]], b = topId[edges[e + 1]];
      if (nbA[a] < 0) nbA[a] = b; else nbB[a] = b;
      if (nbA[b] < 0) nbA[b] = a; else nbB[b] = a;
    }
    for (let k = 0; k < nC; k++) if (isEdge[corners[k]]) ring.push(k);
    // spread points evenly along a ring at a given level (stops bunching)
    const relax = (rx, ry, level, iters) => {
      const tx = new Float32Array(nC), ty = new Float32Array(nC);
      for (let it = 0; it < iters; it++) {
        for (const k of ring) {
          const a = nbA[k], b = nbB[k];
          let x = rx[k] * 0.5 + (rx[a] + rx[b]) * 0.25;
          let y = ry[k] * 0.5 + (ry[a] + ry[b]) * 0.25;
          [x, y] = project(x, y, level);
          tx[k] = x; ty[k] = y;
        }
        for (const k of ring) { rx[k] = tx[k]; ry[k] = ty[k]; }
      }
    };
    relax(cx, cy, B, 3);

    const pos = [];
    const addV = (X, Y, Z) => { pos.push(X, Y, Z); return pos.length / 3 - 1; };
    const toMesh = (x, y) => [x - Wmm / 2, Hmm / 2 - y];

    // top grid vertices, displaced along the surface normal
    const topV = new Int32Array(nC), botV = new Int32Array(nC);
    for (let k = 0; k < nC; k++) {
      const x = cx[k], y = cy[k];
      const d0 = domeAt(x, y);
      const e = cell * 0.5;
      const dzx = (domeAt(x + e, y) - domeAt(x - e, y)) / (2 * e);
      const dzy = (domeAt(x, y + e) - domeAt(x, y - e)) / (2 * e);
      // normal in mesh coords (y flipped)
      let nx = -dzx, ny = dzy, nz = 1;
      const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const [X, Y] = toMesh(x, y);
      const t = tex(X, Y) * texFade(d0) * sideSoft(nz);
      topV[k] = addV(X + nx * t, Y + ny * t, S.base + d0 + nz * t);
      botV[k] = addV(X, Y, 0);
    }

    // side rings for every outline corner, from sd = B down to the outline
    const K = 12;
    const levels = [];
    for (let k = 1; k <= K; k++) levels.push(B * (1 - k / K) * (1 - k / K));
    const ringX = [], ringY = [];
    let px0 = cx, py0 = cy;
    for (const lv of levels) {
      const rx = new Float32Array(nC), ry = new Float32Array(nC);
      for (const k of ring) [rx[k], ry[k]] = project(px0[k], py0[k], lv);
      relax(rx, ry, lv, 3);
      ringX.push(rx); ringY.push(ry);
      px0 = rx; py0 = ry;
    }
    const cols = new Map(); // corner index -> [top, ring1.., outline@base, outline@bed, bottom]
    for (const k of ring) {
      const [Xb, Yb] = toMesh(cx[k], cy[k]);
      const col = [topV[k]];
      let arc = 0, prevH = profile(B), lastX = cx[k], lastY = cy[k];
      levels.forEach((s, li) => {
        const x = ringX[li][k], y = ringY[li][k];
        const hS = profile(s);
        arc += Math.hypot(Math.hypot(x - lastX, y - lastY), prevH - hS);
        lastX = x; lastY = y; prevH = hS;
        const [X, Y] = toMesh(x, y);
        if (s > 0) {
          // outward direction and profile slope -> surface normal
          const [gx, gy] = grad(x, y);
          const gl = Math.hypot(gx, gy) || 1;
          const ox = -gx / gl, oy = gy / gl; // outward, mesh coords
          const eps = Math.max(1e-3, s * 0.25);
          const lo = Math.max(0, s - eps);
          const slope = Math.min(40, (profile(s + eps) - profile(lo)) / (s + eps - lo));
          let nx = ox * slope, ny = oy * slope, nz = 1;
          const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
          // unfold the side so the texture continues down it without streaks
          const t = tex(Xb + ox * arc, Yb + oy * arc) * texFade(hS) * sideSoft(nz);
          col.push(addV(X + nx * t, Y + ny * t, S.base + hS + nz * t));
        } else {
          col.push(addV(X, Y, S.base)); // top of the base wall
          col.push(addV(X, Y, 0));      // outline on the bed
        }
      });
      col.push(botV[k]);
      cols.set(corners[k], col);
    }

    // ---- triangles
    const tris = [];
    for (let f = 0; f < faces.length; f += 4) {
      const a = topId[faces[f]], b = topId[faces[f + 1]], c = topId[faces[f + 2]], d = topId[faces[f + 3]];
      tris.push(topV[a], topV[c], topV[b], topV[a], topV[d], topV[c]);
      tris.push(botV[a], botV[b], botV[c], botV[a], botV[c], botV[d]);
    }
    for (let k = 0; k < edges.length; k += 2) {
      const P = cols.get(edges[k]), Q = cols.get(edges[k + 1]);
      for (let m = 0; m < P.length - 1; m++) {
        tris.push(P[m], Q[m], Q[m + 1], P[m], Q[m + 1], P[m + 1]);
      }
    }

    // weld points that landed on the same spot (tight inside corners) and
    // drop the zero-area triangles that leaves, so slicers see a clean solid
    const remap = new Int32Array(pos.length / 3);
    const seen = new Map();
    const welded = [];
    for (let v = 0; v < remap.length; v++) {
      const key = `${Math.round(pos[v * 3] * 2000)},${Math.round(pos[v * 3 + 1] * 2000)},${Math.round(pos[v * 3 + 2] * 2000)}`;
      let id = seen.get(key);
      if (id === undefined) { id = welded.length / 3; seen.set(key, id); welded.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); }
      remap[v] = id;
    }
    const clean = [];
    for (let t = 0; t < tris.length; t += 3) {
      const a = remap[tris[t]], b = remap[tris[t + 1]], c = remap[tris[t + 2]];
      if (a !== b && b !== c && a !== c) clean.push(a, b, c);
    }
    tris.length = 0; for (const v of clean) tris.push(v);

    // centre on the bounding box
    const p = Float32Array.from(welded);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, zMax = 0;
    for (let k = 0; k < p.length; k += 3) {
      if (p[k] < minX) minX = p[k]; if (p[k] > maxX) maxX = p[k];
      if (p[k + 1] < minY) minY = p[k + 1]; if (p[k + 1] > maxY) maxY = p[k + 1];
      if (p[k + 2] > zMax) zMax = p[k + 2];
    }
    const ox = (minX + maxX) / 2, oy = (minY + maxY) / 2;
    for (let k = 0; k < p.length; k += 3) { p[k] -= ox; p[k + 1] -= oy; }
    return { pos: p, idx: Uint32Array.from(tris), sx: maxX - minX, sy: maxY - minY, sz: zMax };
  }

  function mirrorMesh(m) {
    const pos = m.pos.slice();
    for (let k = 0; k < pos.length; k += 3) pos[k] = -pos[k];
    const idx = m.idx.slice();
    for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
    return { ...m, pos, idx };
  }

  // ------------------------------------------------------ mesh cache ----
  const cache = new Map();
  function letterKey(L, S) {
    return JSON.stringify([L.char, L.font, L.size, L.texture, S.depth, S.puff, S.chub, S.base, S.detail, L.seed]);
  }
  function meshFor(L) {
    const k = letterKey(L, state.settings);
    if (!cache.has(k)) {
      if (cache.size > 60) cache.clear();
      cache.set(k, buildLetterMesh(L, state.settings, L.seed));
    }
    return cache.get(k);
  }

  // ------------------------------------------------------------ export ----
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  async function deflate(data) {
    if (typeof CompressionStream === 'undefined') return null;
    try {
      const cs = new CompressionStream('deflate-raw');
      const out = new Response(new Blob([data]).stream().pipeThrough(cs));
      return new Uint8Array(await out.arrayBuffer());
    } catch (e) { return null; }
  }
  async function makeZip(files) { // files: [{name, data: Uint8Array|string}]
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    const d = new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const raw = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const name = enc.encode(f.name);
      const crc = crc32(raw);
      const comp = await deflate(raw);
      const useDeflate = comp && comp.length < raw.length;
      const body = useDeflate ? comp : raw;
      const method = useDeflate ? 8 : 0;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, method, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, body.length, true); lh.setUint32(22, raw.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, body);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true); ch.setUint16(10, method, true); ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, body.length, true);
      ch.setUint32(24, raw.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + body.length;
    }
    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }

  function stlBinary(m, name) {
    const nt = m.idx.length / 3;
    const buf = new ArrayBuffer(84 + nt * 50);
    const dv = new DataView(buf);
    const head = new TextEncoder().encode(('bubble letter ' + name).slice(0, 79));
    new Uint8Array(buf, 0, 80).set(head);
    dv.setUint32(80, nt, true);
    let o = 84;
    const p = m.pos;
    for (let t = 0; t < nt; t++) {
      const a = m.idx[t * 3] * 3, b = m.idx[t * 3 + 1] * 3, c = m.idx[t * 3 + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      dv.setFloat32(o, nx / nl, true); dv.setFloat32(o + 4, ny / nl, true); dv.setFloat32(o + 8, nz / nl, true);
      o += 12;
      for (const v of [a, b, c]) {
        dv.setFloat32(o, p[v], true); dv.setFloat32(o + 4, p[v + 1], true); dv.setFloat32(o + 8, p[v + 2], true);
        o += 12;
      }
      dv.setUint16(o, 0, true); o += 2;
    }
    return new Uint8Array(buf);
  }

  const xmlEsc = (s) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

  // Simple shelf packing on the P1S plate; overflow continues on more plates.
  function layout(items) {
    const gap = 6;
    let x = gap, y = gap, rowH = 0, plate = 0;
    for (const it of items) {
      if (x + it.m.sx > PLATE - gap && x > gap) { x = gap; y += rowH + gap; rowH = 0; }
      if (y + it.m.sy > PLATE - gap && y > gap) { plate++; x = gap; y = gap; rowH = 0; }
      it.tx = x + it.m.sx / 2 + plate * (PLATE + 20);
      it.ty = PLATE - (y + it.m.sy / 2);
      it.plate = plate;
      x += it.m.sx + gap; rowH = Math.max(rowH, it.m.sy);
    }
    return plate + 1;
  }

  function build3MFModel(items, colors) {
    const out = [];
    out.push('<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n');
    out.push('<metadata name="Title">Bubble letters</metadata>\n<metadata name="Application">Bubble Letter Maker</metadata>\n<resources>\n');
    out.push('<basematerials id="1">\n');
    for (const c of colors) out.push(`<base name="${xmlEsc(c.label)}" displaycolor="${c.hex.toUpperCase()}FF"/>\n`);
    out.push('</basematerials>\n');
    items.forEach((it, n) => {
      const id = n + 2;
      out.push(`<object id="${id}" type="model" name="${xmlEsc(it.name)}" pid="1" pindex="${it.colorIndex}"><mesh><vertices>\n`);
      const p = it.m.pos;
      const vs = [];
      for (let k = 0; k < p.length; k += 3) vs.push(`<vertex x="${p[k].toFixed(3)}" y="${p[k + 1].toFixed(3)}" z="${p[k + 2].toFixed(3)}"/>`);
      out.push(vs.join('\n'));
      out.push('\n</vertices><triangles>\n');
      const ix = it.m.idx;
      const ts = [];
      for (let k = 0; k < ix.length; k += 3) ts.push(`<triangle v1="${ix[k]}" v2="${ix[k + 1]}" v3="${ix[k + 2]}"/>`);
      out.push(ts.join('\n'));
      out.push('\n</triangles></mesh></object>\n');
    });
    out.push('</resources>\n<build>\n');
    items.forEach((it, n) => {
      out.push(`<item objectid="${n + 2}" transform="1 0 0 0 1 0 0 0 1 ${it.tx.toFixed(3)} ${it.ty.toFixed(3)} 0"/>\n`);
    });
    out.push('</build>\n</model>\n');
    return out.join('');
  }

  async function build3MF(items, colors) {
    return makeZip([
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>\n' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>\n' },
      { name: '3D/3dmodel.model', data: build3MFModel(items, colors) },
    ]);
  }

  function colorName(hex) {
    const s = SWATCHES.find(([, h]) => h.toLowerCase() === hex.toLowerCase());
    return s ? s[0] : hex.toUpperCase();
  }

  // Filament slots: one per distinct colour, in order of first use.
  function filamentPlan() {
    const colors = [];
    for (const L of state.letters) {
      if (!colors.find((c) => c.hex.toLowerCase() === L.color.toLowerCase())) {
        colors.push({ hex: L.color, label: colorName(L.color) });
      }
    }
    colors.forEach((c, i) => { c.slot = i + 1; });
    return colors;
  }

  async function exportItems() {
    const colors = filamentPlan();
    const items = [];
    const counts = {};
    for (const L of state.letters) {
      const m = meshFor(L);
      if (!m) continue;
      const ci = colors.findIndex((c) => c.hex.toLowerCase() === L.color.toLowerCase());
      counts[L.char] = (counts[L.char] || 0) + 1;
      const suffix = counts[L.char] > 1 ? ` ${counts[L.char]}` : '';
      const base = `${L.char}${suffix} - slot ${colors[ci].slot} ${colors[ci].label}`;
      items.push({ name: base, m, colorIndex: ci, file: `${L.char}${suffix}` });
      if (state.settings.backHalf) {
        items.push({ name: `${L.char}${suffix} back - slot ${colors[ci].slot} ${colors[ci].label}`, m: mirrorMesh(m), colorIndex: ci, file: `${L.char}${suffix}-back` });
      }
    }
    const plates = layout(items);
    return { items, colors, plates };
  }

  function wordName() {
    const w = state.letters.map((l) => l.char).join('').replace(/[^A-Za-z0-9]+/g, '');
    return (w || 'letters').toLowerCase();
  }

  function guideText(colors, plates) {
    const lines = [
      'Bubble letters - print guide (Bambu Lab P1S + AMS)',
      '',
      'Load these filaments in your AMS:',
      ...colors.map((c) => `  Slot ${c.slot}: ${c.label} (${c.hex.toUpperCase()})`),
      colors.length > 4 ? '  Note: more than 4 colours needs a second AMS, or swap spools between plates.' : null,
      '',
      'In Bambu Studio:',
      '  1. File > Import > Import 3MF/STL..., choose the .3mf file. If asked, load geometry only.',
      '  2. Each letter is its own object. Its name says which AMS slot to use.',
      '     Select a letter in the object list and pick that filament number.',
      `  3. ${plates > 1 ? 'Letters did not fit on one plate: add plates and press Arrange (A).' : 'Press Arrange (A) if you change sizes.'}`,
      '  4. Letters lie flat-back down. No supports needed.',
      '  5. Suggested: 0.16 mm layers, 2-3 walls, 10-15% gyroid infill.',
      '     Fuzzy or fluffy: also turn on Fuzzy Skin (Quality > Others > Fuzzy skin: Outer walls).',
      state.settings.backHalf ? '  6. Glue each "back" half to its letter for a fully round, free-standing letter.' : null,
    ];
    return lines.filter((l) => l !== null).join('\n') + '\n';
  }

  async function saveBlob(blob, filename) {
    const dl = window.claude && window.claude.use ? await claudeDownloads : null;
    if (dl) {
      await dl.save({ filename, data: blob });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  // Inside a claude.ai artifact, files are handed over through the
  // "downloads" capability (zip / json only); elsewhere, normal downloads.
  const claudeDownloads = (window.claude && window.claude.use)
    ? window.claude.use('downloads').catch(() => null)
    : Promise.resolve(null);

  async function exportZip() {
    if (!state.letters.length) return;
    setBusy('Building print files...');
    await tick();
    try {
      const { items, colors, plates } = await exportItems();
      const tmf = await build3MF(items, colors);
      const name = wordName();
      const files = [
        { name: `${name}.3mf`, data: new Uint8Array(await tmf.arrayBuffer()) },
        { name: 'print-guide.txt', data: guideText(colors, plates) },
        { name: `${name}-template.json`, data: JSON.stringify(templateData(), null, 2) },
      ];
      for (const it of items) files.push({ name: `stl/${it.file}.stl`, data: stlBinary(it.m, it.file) });
      const zip = await makeZip(files);
      await saveBlob(zip, `${name}-bubble-letters.zip`);
      setBusy('');
    } catch (e) {
      setBusy(errorText(e));
    }
  }

  async function export3MF() {
    if (!state.letters.length) return;
    setBusy('Building 3MF...');
    await tick();
    try {
      const { items, colors } = await exportItems();
      const tmf = await build3MF(items, colors);
      await saveBlob(tmf, `${wordName()}.3mf`);
      setBusy('');
    } catch (e) { setBusy(errorText(e)); }
  }

  function errorText(e) {
    const code = e && e.code;
    if (code === 'declined') return 'Download cancelled.';
    if (code === 'rejected_extension') return 'This view can only save the .zip. Use "Download print files".';
    return 'Could not save the file' + (e && e.message ? `: ${e.message}` : '.');
  }

  // ----------------------------------------------------------- template ----
  function templateData() {
    return {
      kind: 'bubble-letters-template', version: 1,
      settings: { ...state.settings },
      defaults: { ...state.defaults },
      letters: state.letters.map(({ char, font, size, color, texture }) => ({ char, font, size, color, texture })),
    };
  }
  function loadTemplate(obj) {
    if (!obj || obj.kind !== 'bubble-letters-template') throw new Error('That file is not a bubble letters template.');
    Object.assign(state.settings, obj.settings || {});
    Object.assign(state.defaults, obj.defaults || {});
    state.letters = (obj.letters || []).map((l, i) => newLetter(l.char, l, i));
    state.selected = 0;
    syncSettingsUI();
    renderRows();
    schedulePreview();
  }

  // ------------------------------------------------------------- state ----
  let seedCounter = 1;
  function newLetter(ch, over = {}, index = 0) {
    let font = over.font || state.defaults.font;
    if (font === MIX) font = FONTS[index % FONTS.length].name;
    return {
      char: ch,
      font,
      size: over.size || state.defaults.size,
      color: over.color || state.defaults.color,
      texture: over.texture || state.defaults.texture,
      seed: 100 + (seedCounter++) * 7919,
    };
  }
  function fillFromWord(word) {
    const chars = [...word].filter((c) => c.trim() !== '');
    state.letters = chars.map((c, i) => newLetter(c, {}, i));
    state.selected = 0;
    renderRows();
    schedulePreview();
  }

  // ---------------------------------------------------------------- UI ----
  const tick = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  function setBusy(msg) { $('status').textContent = msg; }

  function optionList(sel, items, value) {
    sel.innerHTML = '';
    for (const [v, label] of items) {
      const o = document.createElement('option'); o.value = v; o.textContent = label;
      if (v === value) o.selected = true;
      sel.appendChild(o);
    }
  }
  const fontOptions = () => FONTS.map((f) => [f.name, f.name]);
  const textureOptions = () => Object.entries(TEXTURES);

  function swatchRow(onPick) {
    const wrap = document.createElement('div');
    wrap.className = 'swatches';
    for (const [name, hex] of SWATCHES) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'swatch'; b.title = name; b.setAttribute('aria-label', name);
      b.style.background = hex;
      b.addEventListener('click', () => onPick(hex));
      wrap.appendChild(b);
    }
    return wrap;
  }

  function renderRows() {
    const list = $('letters');
    list.innerHTML = '';
    const plan = filamentPlan();
    state.letters.forEach((L, i) => {
      const row = document.createElement('div');
      row.className = 'letter' + (i === state.selected ? ' selected' : '');
      row.addEventListener('click', (e) => {
        if (state.selected !== i) { state.selected = i; for (const r of list.children) r.classList.remove('selected'); row.classList.add('selected'); updateSummary(); }
      });

      const head = document.createElement('div');
      head.className = 'letter-head';
      const chIn = document.createElement('input');
      chIn.type = 'text'; chIn.maxLength = 2; chIn.value = L.char; chIn.className = 'char';
      chIn.id = `char-${i}`; chIn.setAttribute('aria-label', `Letter ${i + 1}`);
      chIn.style.fontFamily = `"${L.font}", sans-serif`;
      chIn.addEventListener('input', () => {
        const v = [...chIn.value].filter((c) => c.trim() !== '').pop();
        if (v) { L.char = v; schedulePreview(); }
      });
      const slot = plan.find((c) => c.hex.toLowerCase() === L.color.toLowerCase());
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = `<span class="dot" style="background:${L.color}"></span>AMS slot ${slot ? slot.slot : '-'}`;
      const del = document.createElement('button');
      del.type = 'button'; del.className = 'icon-btn'; del.textContent = 'Remove';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        state.letters.splice(i, 1);
        state.selected = Math.min(state.selected, state.letters.length - 1);
        renderRows(); schedulePreview();
      });
      head.append(chIn, meta, del);

      const grid = document.createElement('div');
      grid.className = 'letter-grid';

      const fontL = labelled('Font', document.createElement('select'), `font-${i}`);
      optionList(fontL.input, fontOptions(), L.font);
      fontL.input.addEventListener('change', () => { L.font = fontL.input.value; chIn.style.fontFamily = `"${L.font}", sans-serif`; ensureFont(L.font).then(schedulePreview); });

      const texL = labelled('Texture', document.createElement('select'), `tex-${i}`);
      optionList(texL.input, textureOptions(), L.texture);
      texL.input.addEventListener('change', () => { L.texture = texL.input.value; schedulePreview(); });

      const sizeIn = document.createElement('input');
      sizeIn.type = 'number'; sizeIn.min = 20; sizeIn.max = 240; sizeIn.step = 1; sizeIn.value = L.size; sizeIn.inputMode = 'numeric';
      const sizeL = labelled('Height (mm)', sizeIn, `size-${i}`);
      sizeIn.addEventListener('change', () => {
        const v = Math.max(20, Math.min(240, parseFloat(sizeIn.value) || L.size));
        sizeIn.value = v; L.size = v; schedulePreview();
      });

      const colIn = document.createElement('input');
      colIn.type = 'color'; colIn.value = L.color;
      const colL = labelled('Colour', colIn, `color-${i}`);
      const setColor = (hex) => { L.color = hex; colIn.value = hex; renderRows(); schedulePreview(); };
      colIn.addEventListener('change', () => setColor(colIn.value));
      colL.el.appendChild(swatchRow(setColor));

      grid.append(fontL.el, texL.el, sizeL.el, colL.el);
      row.append(head, grid);
      list.appendChild(row);
    });
    $('empty').hidden = state.letters.length > 0;
    updateSummary();
  }

  function labelled(text, input, id) {
    const el = document.createElement('label');
    input.id = id;
    el.append(document.createTextNode(text), input);
    return { el, input };
  }

  function updateSummary() {
    const plan = filamentPlan();
    const box = $('filaments');
    box.innerHTML = '';
    for (const c of plan) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="dot" style="background:${c.hex}"></span>Slot ${c.slot}: ${xmlEsc(c.label)}`;
      box.appendChild(li);
    }
    $('ams-warn').hidden = plan.length <= 4;
    const dims = $('dims');
    const L = state.letters[state.selected];
    const m = L ? cache.get(letterKey(L, state.settings)) : null;
    dims.textContent = m
      ? `Letter "${L.char}": ${m.sx.toFixed(0)} x ${m.sy.toFixed(0)} x ${m.sz.toFixed(1)} mm, ${(m.idx.length / 3 / 1000).toFixed(0)}k triangles`
      : '';
  }

  function syncSettingsUI() {
    optionList($('d-font'), [[MIX, 'Mix (a different font per letter)'], ...fontOptions()], state.defaults.font);
    optionList($('d-texture'), textureOptions(), state.defaults.texture);
    $('d-size').value = state.defaults.size;
    $('d-color').value = state.defaults.color;
    $('s-depth').value = state.settings.depth;
    $('s-puff').value = state.settings.puff;
    $('s-chub').value = state.settings.chub;
    $('s-base').value = state.settings.base;
    $('s-detail').value = String(state.settings.detail);
    $('s-back').checked = state.settings.backHalf;
    showValues();
  }
  function showValues() {
    $('v-depth').textContent = `${Math.round(state.settings.depth * 100)}%`;
    $('v-puff').textContent = `${Math.round(state.settings.puff * 100)}%`;
    $('v-chub').textContent = `${Math.round(state.settings.chub * 100)}%`;
    $('v-base').textContent = `${state.settings.base} mm`;
  }

  // ------------------------------------------------------------ fonts ----
  const fontPromises = {};
  function ensureFont(name) {
    const f = fontByName(name);
    if (!fontPromises[name]) {
      fontPromises[name] = Promise.race([
        document.fonts.load(`${f.weight} 100px "${f.name}"`),
        new Promise((r) => setTimeout(r, 4000)),
      ]).catch(() => {});
    }
    return fontPromises[name];
  }

  // ---------------------------------------------------------- preview ----
  let three = null;
  function initThree() {
    if (three || !window.THREE) return three;
    const T = window.THREE;
    const host = $('preview');
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    host.appendChild(renderer.domElement);
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(35, 1, 1, 5000);
    scene.add(new T.HemisphereLight(0xffffff, 0x9a8f88, 0.75));
    const key = new T.DirectionalLight(0xffffff, 0.75); key.position.set(-200, 300, 400); scene.add(key);
    const fill = new T.DirectionalLight(0xffffff, 0.25); fill.position.set(300, -100, 200); scene.add(fill);
    const group = new T.Group(); scene.add(group);
    const controls = T.OrbitControls ? new T.OrbitControls(camera, renderer.domElement) : null;
    if (controls) { controls.enableDamping = true; controls.addEventListener('change', () => draw()); }
    const draw = () => renderer.render(scene, camera);
    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix(); draw();
    };
    window.addEventListener('resize', resize);
    const loop = () => { if (controls) controls.update(); requestAnimationFrame(loop); };
    loop();
    three = { T, renderer, scene, camera, group, controls, draw, resize };
    resize();
    return three;
  }

  let previewToken = 0;
  let previewTimer = 0;
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 120);
  }
  async function updatePreview() {
    const token = ++previewToken;
    renderRowsMetaOnly();
    const t = initThree();
    const fonts = [...new Set(state.letters.map((l) => l.font))];
    await Promise.all(fonts.map(ensureFont));
    const meshes = [];
    for (let i = 0; i < state.letters.length; i++) {
      const L = state.letters[i];
      const key = letterKey(L, state.settings);
      if (!cache.has(key)) { setBusy(`Shaping "${L.char}" (${i + 1}/${state.letters.length})...`); await tick(); }
      if (token !== previewToken) return;
      meshes.push({ L, m: meshFor(L) });
    }
    setBusy('');
    updateSummary();
    if (!t) { $('preview-fallback').hidden = false; return; }
    const { T, group, camera, controls } = t;
    while (group.children.length) {
      const c = group.children.pop();
      c.geometry.dispose(); c.material.dispose();
    }
    let x = 0;
    const gap = 6;
    let maxH = 0, maxZ = 0;
    for (const { L, m } of meshes) {
      if (!m) continue;
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(m.pos, 3));
      geo.setIndex(new T.BufferAttribute(m.idx, 1));
      geo.computeVertexNormals();
      const mat = new T.MeshStandardMaterial({ color: new T.Color(L.color), roughness: 0.85, metalness: 0 });
      const mesh = new T.Mesh(geo, mat);
      mesh.position.set(x + m.sx / 2, 0, 0);
      group.add(mesh);
      x += m.sx + gap;
      maxH = Math.max(maxH, m.sy); maxZ = Math.max(maxZ, m.sz);
    }
    const total = Math.max(1, x - gap);
    group.position.set(-total / 2, 0, 0);
    // frame it (keep the user's orbit if they have moved the camera)
    const dist = Math.max(total / camera.aspect, maxH) / (2 * Math.tan((camera.fov * Math.PI) / 360)) * 0.95 + maxZ;
    if (!t.framed || t.lastSpan !== Math.round(total)) {
      camera.position.set(0, -dist * 0.35, dist);
      camera.lookAt(0, 0, maxZ / 2);
      if (controls) { controls.target.set(0, 0, maxZ / 2); controls.update(); }
      t.framed = true; t.lastSpan = Math.round(total);
    }
    t.draw();
  }
  function renderRowsMetaOnly() {
    const plan = filamentPlan();
    const rows = $('letters').children;
    state.letters.forEach((L, i) => {
      const meta = rows[i] && rows[i].querySelector('.meta');
      const slot = plan.find((c) => c.hex.toLowerCase() === L.color.toLowerCase());
      if (meta) meta.innerHTML = `<span class="dot" style="background:${L.color}"></span>AMS slot ${slot ? slot.slot : '-'}`;
    });
  }

  // ----------------------------------------------------------- wiring ----
  function wire() {
    syncSettingsUI();
    $('fill').addEventListener('click', () => fillFromWord($('word').value));
    $('word').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fillFromWord($('word').value); } });
    $('add').addEventListener('click', () => {
      state.letters.push(newLetter('A', {}, state.letters.length));
      state.selected = state.letters.length - 1;
      renderRows(); schedulePreview();
    });
    $('d-font').addEventListener('change', () => { state.defaults.font = $('d-font').value; });
    $('d-texture').addEventListener('change', () => { state.defaults.texture = $('d-texture').value; });
    $('d-size').addEventListener('change', () => { state.defaults.size = Math.max(20, Math.min(240, parseFloat($('d-size').value) || 80)); $('d-size').value = state.defaults.size; });
    $('d-color').addEventListener('change', () => { state.defaults.color = $('d-color').value; });
    $('d-swatches').appendChild(swatchRow((hex) => { state.defaults.color = hex; $('d-color').value = hex; }));
    $('apply-all').addEventListener('click', () => {
      state.letters = state.letters.map((L, i) => {
        const n = newLetter(L.char, {}, i); n.seed = L.seed; return n;
      });
      renderRows(); schedulePreview();
    });

    const bindRange = (id, key) => $(id).addEventListener('input', () => {
      state.settings[key] = parseFloat($(id).value); showValues(); schedulePreview();
    });
    bindRange('s-depth', 'depth'); bindRange('s-puff', 'puff'); bindRange('s-chub', 'chub'); bindRange('s-base', 'base');
    $('s-detail').addEventListener('change', () => { state.settings.detail = parseFloat($('s-detail').value); schedulePreview(); });
    $('s-back').addEventListener('change', () => { state.settings.backHalf = $('s-back').checked; });

    $('export-zip').addEventListener('click', exportZip);
    $('export-3mf').addEventListener('click', export3MF);
    $('save-template').addEventListener('click', async () => {
      try {
        await saveBlob(new Blob([JSON.stringify(templateData(), null, 2)], { type: 'application/json' }), `${wordName()}-template.json`);
      } catch (e) { setBusy(errorText(e)); }
    });
    $('load-template').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try { loadTemplate(JSON.parse(await f.text())); setBusy(`Loaded ${f.name}`); } catch (err) { setBusy(err.message || 'Could not read that template.'); }
      e.target.value = '';
    });

    // the .3mf-only button only works where normal downloads do
    claudeDownloads.then((dl) => { if (dl) $('export-3mf').hidden = true; });

    fillFromWord($('word').value);
  }

  wire();
})();
