// Runtime duotone + halftone dither for treated stock photos.
// The image is sampled once into a luminance grid and painted once into a small pixel buffer
// (4 sub-cells per cell). Scroll reveal is a clip blit of that buffer — one drawImage, no pixel work.
// The cursor is a focus lens: only while a card is hovered (fine pointers) is the buffer repainted,
// with full tonal range inside the lens and 5-level quantisation outside.
import { pointer, smoothstep, clamp } from './pointer.js';

const PALETTES = {
  lime: { bg: [8, 8, 8], ink: [208, 255, 0] },
  plum: { bg: [8, 8, 8], ink: [129, 22, 224] },
  mono: { bg: [8, 8, 8], ink: [254, 255, 252] },
  'lime-inv': { bg: [208, 255, 0], ink: [8, 8, 8] },
  'plum-inv': { bg: [129, 22, 224], ink: [8, 8, 8] },
};
const css = ([r, g, b]) => `rgb(${r},${g},${b})`;

export function createDither(img, canvas, opts = {}) {
  const o = Object.assign({ cell: 4, sub: 4, palette: 'lime', lens: 180, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches }, opts);
  const ctx = canvas.getContext('2d');
  const pal = PALETTES[o.palette] || PALETTES.lime;
  let cols = 0, rows = 0, W = 0, lum = null, buf = null, bctx = null, imgData = null;
  let hover = 0, target = 0, raf = 0, running = false, resolve = 0, lastCut = -1;

  function sample() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width | 0);
    const Hc = Math.max(1, r.height | 0);
    const cell = W < 480 ? o.cell * 1.2 : o.cell;
    cols = Math.max(1, Math.round(W / cell)); rows = Math.max(1, Math.round(Hc / cell));
    // cover-fit the image into cols×rows
    const s = document.createElement('canvas'); s.width = cols; s.height = rows;
    const g = s.getContext('2d', { willReadFrequently: true });
    const ir = img.naturalWidth / img.naturalHeight, cr = cols / rows;
    let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
    if (ir > cr) { sw = sh * cr; sx = (img.naturalWidth - sw) / 2; } else { sh = sw / cr; sy = (img.naturalHeight - sh) / 2; }
    g.drawImage(img, sx, sy, sw, sh, 0, 0, cols, rows);
    const d = g.getImageData(0, 0, cols, rows).data;
    lum = new Float32Array(cols * rows);
    // tone curve: lift shadows a touch, hold highlights back so photos read as ink on void, not a white wall
    for (let i = 0; i < cols * rows; i++) { const l = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255; lum[i] = Math.pow(l, 1.35) * 0.88; }
    buf = document.createElement('canvas'); buf.width = cols * o.sub; buf.height = rows * o.sub;
    bctx = buf.getContext('2d'); imgData = bctx.createImageData(buf.width, buf.height);
    canvas.width = buf.width; canvas.height = buf.height; // upscaled by CSS, smoothing off
    ctx.imageSmoothingEnabled = false;
    lastCut = -1;
  }

  // Paint the whole grid into the offscreen buffer. h = lens strength (0 = static frame).
  function paintInto(h) {
    const px = imgData.data, S = o.sub, bw = buf.width;
    const [br, bg, bb] = pal.bg, [ir, ig, ib] = pal.ink;
    let fx = -1e9, fy = -1e9, L = 0;
    if (h > 0) {
      const r = canvas.getBoundingClientRect();
      fx = (pointer.lx - r.left) / r.width * cols; fy = (pointer.ly - r.top) / r.height * rows;
      L = (o.lens / r.width) * cols;
    }
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let v = lum[y * cols + x];
        const dx = x - fx, dy = y - fy, d = Math.sqrt(dx * dx + dy * dy);
        const inl = h > 0 && d < L ? smoothstep(1 - d / L) * h : 0;
        const q = Math.round(v * 4) / 4;
        v = q + (v * 1.15 - q) * inl;
        // dot size 0..S sub-cells, ordered by a 2×2 bayer so mid-tones dither
        const bay = ((x & 1) + ((y & 1) << 1)) / 4 - 0.375;
        const n = clamp(Math.round(v * S + bay * (1 - inl)), 0, S);
        for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
          const on = sx < n && sy < n;
          const i = ((y * S + sy) * bw + (x * S + sx)) * 4;
          px[i] = on ? ir : br; px[i + 1] = on ? ig : bg; px[i + 2] = on ? ib : bb; px[i + 3] = 255;
        }
      }
    }
    bctx.putImageData(imgData, 0, 0);
  }

  // Copy the revealed rows of the buffer to the visible canvas. Skips when nothing changed.
  function blit(force) {
    if (!buf) return;
    const cut = Math.min(rows, Math.floor((smoothstep(resolve) + 0.02) * rows)) * o.sub;
    if (!force && cut === lastCut) return;
    lastCut = cut;
    ctx.fillStyle = css(pal.bg); ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (cut > 0) ctx.drawImage(buf, 0, 0, buf.width, cut, 0, 0, buf.width, cut);
  }

  function loop() {
    if (!running) return;
    hover += (target - hover) * 0.12;
    if (Math.abs(target - hover) < 0.005 && target === 0) { hover = 0; paintInto(0); blit(true); running = false; return; }
    paintInto(hover); blit(true);
    raf = requestAnimationFrame(loop);
  }
  function wake() { if (!running) { running = true; raf = requestAnimationFrame(loop); } }

  const api = {
    init() { sample(); paintInto(0); blit(true); },
    setResolve(p) { resolve = clamp(p, 0, 1); if (!running) blit(false); },
    hover(on) { if (o.reduced || !pointer.fine || !lum) return; target = on ? 1 : 0; wake(); },
    resize() { if (!lum) return; if ((canvas.getBoundingClientRect().width | 0) === W) return; sample(); paintInto(0); blit(true); },
    destroy() { running = false; cancelAnimationFrame(raf); },
  };
  if (img.complete && img.naturalWidth) api.init(); else img.addEventListener('load', api.init, { once: true });
  addEventListener('app:resize', api.resize);
  return api;
}
