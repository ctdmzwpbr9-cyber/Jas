/*
 * Textured bubble letters, rendered with plain Canvas 2D (no libraries).
 *
 * How it works, per letter:
 *   1. Draw the glyph in a rounded font, plus a thick round-joined stroke to
 *      make it chubbier and round off every corner.  -> a 2D mask
 *   2. Euclidean distance transform: how far each pixel is from the edge.
 *   3. Turn distance into height with a circular profile, so the letter
 *      becomes a rounded "tube" / pillow. Blur it a little to smooth creases.
 *   4. Add procedural noise to the height (fleece fuzz or ceramic grain).
 *   5. Height -> surface normals -> lighting (soft diffuse, fleece sheen,
 *      ceramic specular, height-based ambient occlusion).
 *   6. Composite onto the scene with a soft drop shadow + contact shadow.
 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  const PASTELS = ['#f2b8c9', '#a9c3d9', '#f2c09a', '#c8b6e2', '#b5d8bf', '#f5da95'];

  const PRESETS = {
    fleece: {
      texture: 'fleece', color: '#f2a7c3', multi: false, bg: '#efe8e1',
      stars: true, shelf: true, puff: 1, chub: 0.16, grain: 0.7, spacing: 0.02,
      font: 'Fredoka', shelfColor: '#f7f3ee',
    },
    ceramic: {
      texture: 'ceramic', color: '#eab9c4', multi: true, bg: '#d8c2c8',
      stars: false, shelf: true, puff: 1.1, chub: 0.15, grain: 0.7, spacing: 0.1,
      font: 'Fredoka', shelfColor: '#8a5a3c',
    },
  };

  let starSeed = 7;
  let shelfColor = PRESETS.fleece.shelfColor;

  // ---------------------------------------------------------------- noise --
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

  function fbm(x, y, seed, octaves) {
    let sum = 0, amp = 0.5, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * vnoise(x, y, seed + o * 17);
      norm += amp;
      x *= 2.03; y *= 2.03; amp *= 0.5;
    }
    return sum / norm;
  }

  // ------------------------------------------------ distance transform ----
  // Felzenszwalb & Huttenlocher exact squared EDT, separable.
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
      k++;
      v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      const r = v[k];
      d[q] = (q - r) * (q - r) + f[r];
    }
  }

  function distanceTransform(inside, w, h) {
    const INF = 1e20;
    const grid = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) grid[i] = inside[i] ? INF : 0;
    const n = Math.max(w, h);
    const f = new Float64Array(n), d = new Float64Array(n);
    const v = new Int32Array(n), z = new Float64Array(n + 1);
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

  // Separable box blur, repeated => approximately Gaussian.
  function boxBlur(src, w, h, r, passes) {
    r = Math.max(1, Math.round(r));
    let a = src, b = new Float32Array(w * h);
    const win = 2 * r + 1;
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < h; y++) {           // horizontal
        const row = y * w;
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += a[row + Math.min(w - 1, Math.max(0, k))];
        for (let x = 0; x < w; x++) {
          b[row + x] = sum / win;
          sum += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
        }
      }
      for (let x = 0; x < w; x++) {           // vertical
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

  // --------------------------------------------------------------- colour --
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const toLin = (c) => Math.pow(c / 255, 2.2);
  const toSrgb = (c) => 255 * Math.pow(Math.min(1, Math.max(0, c)), 1 / 2.2);

  // ------------------------------------------------------- render letter --
  function renderLetter(ch, o) {
    const off = document.createElement('canvas');
    const g = off.getContext('2d');
    const font = `${o.weight} ${o.fontPx}px "${o.font}", "Arial Rounded MT Bold", system-ui, sans-serif`;
    g.font = font;
    const m = g.measureText(ch);
    const stroke = o.fontPx * o.chub;
    const pad = Math.ceil(stroke / 2 + o.fontPx * 0.06 + 4);
    const left = Math.ceil(m.actualBoundingBoxLeft), right = Math.ceil(m.actualBoundingBoxRight);
    const asc = Math.ceil(m.actualBoundingBoxAscent), desc = Math.ceil(m.actualBoundingBoxDescent);
    const w = left + right + pad * 2, h = asc + desc + pad * 2;
    off.width = w; off.height = h;

    // 1. mask
    g.font = font;
    g.fillStyle = '#000'; g.strokeStyle = '#000';
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.lineWidth = Math.max(0.01, stroke);
    const ox = pad + left, oy = pad + asc;
    g.fillText(ch, ox, oy);
    if (stroke > 0.5) g.strokeText(ch, ox, oy);

    const img = g.getImageData(0, 0, w, h);
    const px = img.data;
    const N = w * h;
    const alpha = new Float32Array(N);
    const inside = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      alpha[i] = px[i * 4 + 3] / 255;
      inside[i] = alpha[i] > 0.5 ? 1 : 0;
    }

    // 2. distance to edge
    const dist = distanceTransform(inside, w, h);
    let maxD = 1;
    for (let i = 0; i < N; i++) if (dist[i] > maxD) maxD = dist[i];

    // 3. distance -> rounded height (circular cross-section), then smooth
    const R = maxD * 0.98;
    const height = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      if (!inside[i]) { height[i] = 0; continue; }
      const t = Math.min(1, (dist[i] + 0.5) / R);
      height[i] = R * Math.sqrt(1 - (1 - t) * (1 - t));
    }
    const smooth = boxBlur(height, w, h, maxD * 0.18, 2);
    const hScale = o.puff;
    for (let i = 0; i < N; i++) smooth[i] *= hScale;

    // 4. surface texture
    const s = o.dpr;           // keep texture scale constant in CSS pixels
    const seed = o.seed;
    const tex = o.texture;
    const grain = o.grain;
    const albedoVar = new Float32Array(N);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (alpha[i] <= 0) continue;
        const wx = (x + o.worldX) / s, wy = (y + o.worldY) / s;
        if (tex === 'fleece') {
          // fine fibres + soft clumps, slightly stretched to feel "brushed"
          const fine = fbm(wx * 0.9, wy * 0.75, seed, 3) - 0.5;
          const clump = fbm(wx * 0.16, wy * 0.16, seed + 101, 3) - 0.5;
          smooth[i] += (fine * 1.6 + clump * 3.2) * grain * s;
          albedoVar[i] = (fine * 0.10 + clump * 0.10) * grain;
        } else if (tex === 'ceramic') {
          // fine sandy grain + rare darker speckles
          const fine = vnoise(wx * 1.6, wy * 1.6, seed) - 0.5;
          const mid = fbm(wx * 0.35, wy * 0.35, seed + 33, 2) - 0.5;
          smooth[i] += (fine * 0.9 + mid * 0.8) * grain * s;
          let v = fine * 0.05 * grain;
          if (hash(Math.floor(wx * 1.3), Math.floor(wy * 1.3), seed + 77) < 0.012 * grain) v -= 0.12;
          albedoVar[i] = v;
        } else {
          const mid = fbm(wx * 0.05, wy * 0.05, seed + 5, 2) - 0.5;
          smooth[i] += mid * 0.6 * grain * s;
        }
      }
    }

    // 5. shading
    const base = hexToRgb(o.color).map(toLin);
    let lx = -0.5, ly = -0.65, lz = 0.6;
    const ll = Math.hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;
    let hx = lx, hy = ly, hz = lz + 1;    // Blinn half-vector, viewer at +z
    const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
    const peak = R * hScale;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const a = alpha[i];
        if (a <= 0) { px[i * 4 + 3] = 0; continue; }
        const xl = x > 0 ? i - 1 : i, xr = x < w - 1 ? i + 1 : i;
        const yu = y > 0 ? i - w : i, yd = y < h - 1 ? i + w : i;
        const gx = (smooth[xr] - smooth[xl]) * 0.5;
        const gy = (smooth[yd] - smooth[yu]) * 0.5;
        let nx = -gx, ny = -gy, nz = 1;
        const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;

        const ndl = nx * lx + ny * ly + nz * lz;
        const hNorm = Math.min(1, height[i] * hScale / Math.max(1e-3, peak));
        const ao = 0.62 + 0.38 * Math.sqrt(hNorm);

        let diffuse, sheen = 0, spec = 0, ambient;
        if (tex === 'fleece') {
          diffuse = Math.max(0, (ndl + 0.45) / 1.45);       // wrapped, soft
          sheen = Math.pow(1 - nz, 2.5) * 0.22;              // velvet rim glow
          ambient = 0.30;
        } else if (tex === 'ceramic') {
          diffuse = Math.max(0, (ndl + 0.2) / 1.2);
          const ndh = Math.max(0, nx * hx + ny * hy + nz * hz);
          spec = Math.pow(ndh, 28) * 0.10;                  // matte glaze
          ambient = 0.30;
        } else {
          diffuse = Math.max(0, ndl);
          const ndh = Math.max(0, nx * hx + ny * hy + nz * hz);
          spec = Math.pow(ndh, 60) * 0.55;                  // glossy
          ambient = 0.28;
        }

        const light = (ambient + diffuse * 0.95) * ao;
        const av = 1 + albedoVar[i];
        for (let c = 0; c < 3; c++) {
          const lit = base[c] * av * light + sheen * (0.6 + base[c] * 0.4) + spec;
          px[i * 4 + c] = toSrgb(lit);
        }
        px[i * 4 + 3] = Math.round(a * 255);
      }
    }
    g.putImageData(img, 0, 0);
    return { canvas: off, w, h, ox, oy, advance: m.width, left, pad };
  }

  // --------------------------------------------------------------- scene --
  function drawStar(g, x, y, r, color) {
    g.save();
    g.translate(x, y);
    g.fillStyle = color;
    g.beginPath();
    const pts = 8;
    for (let k = 0; k < pts * 2; k++) {
      const ang = (k / (pts * 2)) * Math.PI * 2 - Math.PI / 2;
      const long = k % 4 === 0;
      const rr = k % 2 === 1 ? r * 0.16 : long ? r : r * 0.55;
      g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    g.closePath();
    g.fill();
    g.restore();
  }

  function drawBackground(W, H, o, ledgeY) {
    const bg = hexToRgb(o.bg);
    ctx.fillStyle = o.bg;
    ctx.fillRect(0, 0, W, H);

    // soft window light
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.05)');
    grad.addColorStop(1, `rgba(${bg[0] * 0.6 | 0},${bg[1] * 0.6 | 0},${bg[2] * 0.6 | 0},0.18)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    if (o.stars) {
      const colors = ['#d8384f', '#e2a62c', '#2f8a4f', '#6f8fbf', '#d24a7b', '#e0782f'];
      const count = Math.round((W * H) / (o.dpr * o.dpr * 9000));
      for (let k = 0; k < count; k++) {
        const x = hash(k, 1, starSeed) * W;
        const y = hash(k, 2, starSeed) * (ledgeY - 10 * o.dpr);
        const r = (6 + hash(k, 3, starSeed) * 14) * o.dpr;
        drawStar(ctx, x, y, r, colors[Math.floor(hash(k, 4, starSeed) * colors.length)]);
      }
    }

    if (o.shelf) {
      const t = 14 * o.dpr;
      ctx.fillStyle = shelfColor;
      ctx.fillRect(0, ledgeY, W, t);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(0, ledgeY, W, 2 * o.dpr);
      const sh = ctx.createLinearGradient(0, ledgeY + t, 0, ledgeY + t + 40 * o.dpr);
      sh.addColorStop(0, 'rgba(0,0,0,0.18)');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(0, ledgeY + t, W, 40 * o.dpr);
      ctx.fillStyle = shelfColor;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(0, ledgeY + t, W, H - ledgeY - t);
      ctx.globalAlpha = 1;
    }
  }

  function readOptions() {
    return {
      text: $('text').value || ' ',
      texture: $('texture').value,
      font: $('font').value,
      color: $('color').value,
      multi: $('multi').checked,
      puff: parseFloat($('puff').value),
      chub: parseFloat($('chub').value),
      grain: parseFloat($('grain').value),
      spacing: parseFloat($('spacing').value),
      bg: $('bg').value,
      stars: $('stars').checked,
      shelf: $('shelf').checked,
    };
  }

  const WEIGHTS = { 'Fredoka': 700, 'Baloo 2': 800, 'Sniglet': 800 };

  function render() {
    const o = readOptions();
    const t0 = performance.now();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.parentElement.clientWidth;
    const cssH = Math.round(Math.max(300, Math.min(620, cssW * 0.62)));
    const W = Math.round(cssW * dpr), H = Math.round(cssH * dpr);
    canvas.width = W; canvas.height = H;
    o.dpr = dpr;
    o.weight = WEIGHTS[o.font] || 700;

    // fit font size to width
    ctx.font = `${o.weight} 100px "${o.font}", system-ui, sans-serif`;
    const chars = [...o.text];
    let unit = 0;
    for (const ch of chars) unit += ctx.measureText(ch).width + 100 * (o.chub * 0.9 + o.spacing);
    const fontPx = Math.min((W * 0.86) / (unit / 100), H * 0.5);
    o.fontPx = fontPx;

    const ledgeY = Math.round(H * 0.74);
    drawBackground(W, H, o, ledgeY);

    // lay out & render letters
    const letters = [];
    let x = 0, colorIdx = 0;
    chars.forEach((ch, idx) => {
      ctx.font = `${o.weight} ${fontPx}px "${o.font}", system-ui, sans-serif`;
      const adv = ctx.measureText(ch).width + fontPx * (o.chub * 0.9 + o.spacing);
      if (ch.trim() === '') { x += adv; return; }
      const color = o.multi ? PASTELS[colorIdx++ % PASTELS.length] : o.color;
      letters.push({ ch, x, color, idx });
      x += adv;
    });
    const totalW = x - fontPx * o.spacing;
    const startX = (W - totalW) / 2 + fontPx * o.chub * 0.45;
    const baseline = ledgeY - fontPx * o.chub * 0.5;

    const shadowCol = (() => {
      const [r, g, b] = hexToRgb(o.bg);
      return `rgba(${r * 0.35 | 0},${g * 0.3 | 0},${b * 0.3 | 0},`;
    })();

    for (const L of letters) {
      const r = renderLetter(L.ch, {
        ...o, color: L.color, seed: 1000 + L.idx * 7919,
        worldX: startX + L.x, worldY: baseline,
      });
      const dx = Math.round(startX + L.x - r.ox);
      const dy = Math.round(baseline - r.oy);

      // shadows drawn from far off-canvas so only the shadow lands
      const FAR = 100000;
      ctx.save();
      ctx.shadowColor = shadowCol + '0.28)';
      ctx.shadowBlur = fontPx * 0.10;
      ctx.shadowOffsetX = FAR + fontPx * 0.05;
      ctx.shadowOffsetY = fontPx * 0.04;
      ctx.drawImage(r.canvas, dx - FAR, dy);
      ctx.shadowColor = shadowCol + '0.35)';
      ctx.shadowBlur = fontPx * 0.025;
      ctx.shadowOffsetX = FAR + fontPx * 0.01;
      ctx.shadowOffsetY = fontPx * 0.012;
      ctx.drawImage(r.canvas, dx - FAR, dy);
      ctx.restore();

      ctx.drawImage(r.canvas, dx, dy);
    }

    canvas.style.aspectRatio = `${W} / ${H}`;
    $('status').textContent = `Rendered in ${Math.round(performance.now() - t0)} ms`;
  }

  // ------------------------------------------------------------ wiring ----
  let pending = 0;
  function schedule() {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(render);
  }

  function applyPreset(name) {
    const p = PRESETS[name];
    $('texture').value = p.texture;
    $('color').value = p.color;
    $('multi').checked = p.multi;
    $('bg').value = p.bg;
    $('stars').checked = p.stars;
    $('shelf').checked = p.shelf;
    $('puff').value = p.puff;
    $('chub').value = p.chub;
    $('grain').value = p.grain;
    $('spacing').value = p.spacing;
    $('font').value = p.font;
    shelfColor = p.shelfColor;
    if (name === 'ceramic' && $('text').value === 'SOPHIE') $('text').value = 'OLIVE';
    if (name === 'fleece' && $('text').value === 'OLIVE') $('text').value = 'SOPHIE';
    schedule();
  }

  ['text', 'texture', 'font', 'color', 'multi', 'puff', 'chub', 'grain', 'spacing', 'bg', 'stars', 'shelf']
    .forEach((id) => $(id).addEventListener('input', schedule));
  $('preset').addEventListener('change', (e) => applyPreset(e.target.value));
  $('reseed').addEventListener('click', () => { starSeed = (Math.random() * 1e6) | 0; schedule(); });
  $('download').addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = `${($('text').value || 'letters').toLowerCase()}-bubble-letters.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  });
  let lastW = 0;
  window.addEventListener('resize', () => {
    const w = canvas.parentElement.clientWidth;
    if (w !== lastW) { lastW = w; schedule(); }
  });

  // wait for the web fonts (falls back gracefully if offline)
  const fonts = Object.entries(WEIGHTS).map(([f, wgt]) => document.fonts.load(`${wgt} 100px "${f}"`));
  Promise.race([Promise.all(fonts), new Promise((r) => setTimeout(r, 2500))])
    .catch(() => {})
    .then(() => { lastW = canvas.parentElement.clientWidth; render(); });
})();
