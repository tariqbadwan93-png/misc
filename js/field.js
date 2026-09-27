// Hero glyph field — the 5-step progression (dot → ring → x → diamond → mark) laid on a unit grid.
// Each cell's step = f(slow noise, cursor proximity, scroll). Sprites are pre-rendered once,
// so a frame is ~2–3k drawImage calls. ponytail: 2D canvas, not WebGL — fine at this cell count.
import { PROGRESSION, MARK, ICONS } from './glyphs.js';
import { pointer, smoothstep, clamp } from './pointer.js';

const LIME = '#D0FF00', BLANCHE = '#FEFFFC', ELECTRIC = '#9B5CFF';

export function createField(canvas, opts = {}) {
  const o = Object.assign({
    pitch: 30,          // px between cell origins (glyph occupies 7 units inside)
    unit: 3,            // px per glyph unit → glyph = 21px
    radius: 300,        // cursor influence radius px
    baseFloor: 0.05,    // ambient alpha for far cells
    ambient: 1,         // multiplier on the breathing noise
    palette: { near: LIME, far: BLANCHE, rare: ELECTRIC }, // rare: null disables the counter-voice scatter
    hud: true,          // thin lines from the cursor to the hottest cells + bracket corners
    dprCap: 1.5,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  }, opts);

  const ctx = canvas.getContext('2d', { alpha: true });
  let W = 0, H = 0, dpr = 1, cols = 0, rows = 0, cells = [];
  let sprites = null;
  let t0 = performance.now(), running = false, raf = 0;
  let scroll = 0;             // 0..1 hero scroll progress (set from outside)
  let ripples = [];           // {x,y,t}
  let auto = { x: 0.5, y: 0.5 }; // wandering focus for touch / idle

  // ---------- sprites: [color][step] offscreen canvases ----------
  function buildSprites() {
    const u = o.unit * dpr, size = 7 * u;
    const make = (bits, color) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      g.fillStyle = color;
      for (let r = 0; r < 7; r++) for (let k = 0; k < 7; k++) if (bits[r][k]) g.fillRect(k * u, r * u, u, u);
      return c;
    };
    const set = (color) => PROGRESSION.map((b) => make(b, color));
    const p = o.palette;
    sprites = { near: set(p.near), far: set(p.far), rare: p.rare ? set(p.rare) : null, size };
  }

  let left = 0, top = 0;                                 // canvas position in the viewport (no per-frame layout reads)
  function resize() {
    const r = canvas.getBoundingClientRect();
    left = r.left; top = r.top;
    dpr = clamp(Math.round(devicePixelRatio || 1), 1, 2);  // integer so 3px units land on device pixels
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pitch = W < 720 ? o.pitch * 0.8 : o.pitch;
    cols = Math.ceil(W / pitch) + 1; rows = Math.ceil(H / pitch) + 1;
    const ox = Math.round((W - (cols - 1) * pitch) / 2), oy = Math.round((H - (rows - 1) * pitch) / 2);
    cells = new Array(cols * rows);
    let i = 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const seed = hash(x * 73856093 ^ y * 19349663);
      cells[i++] = { x: ox + x * pitch, y: oy + y * pitch, seed, ph: seed * Math.PI * 2, spd: 0.25 + seed * 0.5, e: 0, v: 0, step: 0 };
    }
    buildSprites();
    if (o.reduced) draw(0);
  }

  function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = Math.imul(n, 9); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return (n >>> 0) / 4294967295; }

  // ---------- frame ----------
  function draw(now) {
    const t = (now - t0) / 1000;
    ctx.clearRect(0, 0, W, H);
    const half = (7 * o.unit) / 2;
    const s = sprites.size / dpr;

    // focus point: real pointer on fine devices, gentle wander otherwise
    let fx, fy;
    if (pointer.fine && pointer.active) {
      fx = pointer.lx - left; fy = pointer.ly - top;
    } else {
      auto.x = 0.5 + 0.32 * Math.sin(t * 0.23) + 0.08 * Math.sin(t * 0.71);
      auto.y = 0.5 + 0.26 * Math.cos(t * 0.19) + 0.08 * Math.cos(t * 0.53);
      fx = auto.x * W; fy = auto.y * H;
    }
    const R = (W < 720 ? o.radius * 0.6 : o.radius) * (pointer.down ? 1.35 : 1);
    const wave = scroll * 6;                              // scroll pushes a wave through the grid
    const reduced = o.reduced;
    const rip = ripples.filter((p) => t - p.t < 1.6);
    ripples = rip;
    const live = pointer.fine && pointer.active;
    const hot = [];                                       // candidates for the HUD lines

    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      // ambient: slow breathing noise, biased low (the 80% void rule)
      let v = 0.5 + 0.5 * Math.sin(t * c.spd + c.ph + c.y * 0.004 + wave);
      v = v * v * v * 0.42 * o.ambient;
      // cursor: radial swell
      const dx = c.x - fx, dy = c.y - fy, d = Math.sqrt(dx * dx + dy * dy);
      const target = d < R ? smoothstep(1 - d / R) : 0;
      // energy: fast attack, slow decay — the mark blooms under the cursor and dissolves behind it
      c.e += (target - c.e) * (reduced ? 1 : target > c.e ? 0.22 : 0.055);
      const inf = c.e < 0.005 ? 0 : c.e;
      v += inf * 1.05;
      if (o.hud && live && inf > 0.55 && d > 26) hot.push(d, i);
      // click ripples: a ring that runs out and thins
      for (let k = 0; k < rip.length; k++) {
        const p = rip[k], age = t - p.t, rr = age * 420;
        const rd = Math.abs(Math.hypot(c.x - p.x, c.y - p.y) - rr);
        if (rd < 40) v += (1 - rd / 40) * (1 - age / 1.6) * 0.9;
      }
      // scroll disintegration, bottom-up: the print pulled off the plate
      const fade = 1 - smoothstep(clamp(scroll * 1.5 - (1 - c.y / H) * 0.55, 0, 1));
      v = clamp(v * fade, 0, 1);
      if (v < 0.04) { c.v = v; continue; }

      // rung hysteresis: a cell only changes tier once the value has moved a little
      let step = Math.min(4, (v * 5.2) | 0);
      if (Math.abs(v - c.v) < 0.04) step = c.step; else c.v = v;
      c.step = step;
      let set, alpha;
      if (inf > 0.02) { set = sprites.near; alpha = 0.35 + 0.65 * smoothstep(inf); }
      else if (v > 0.8) { set = sprites.far; alpha = 0.9; }
      else { set = sprites.far; alpha = o.baseFloor + v * 0.42; }
      // a scattering of the counter-voice colour — rare
      if (sprites.rare && c.seed > 0.985 && inf < 0.02 && v > 0.3) { set = sprites.rare; alpha = 0.7; }
      ctx.globalAlpha = alpha;
      ctx.drawImage(set[step], Math.round(c.x - half), Math.round(c.y - half), s, s);
    }
    ctx.globalAlpha = 1;

    // HUD: three hairlines from the cursor to the nearest lit cells, bracket ticks around the cursor
    if (o.hud && live && hot.length) {
      const idx = [];
      for (let k = 0; k < hot.length; k += 2) idx.push(k);
      idx.sort((a, b) => hot[a] - hot[b]);
      ctx.strokeStyle = o.palette.near; ctx.globalAlpha = 0.22; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k < Math.min(3, idx.length); k++) { const c = cells[hot[idx[k] + 1]]; ctx.moveTo(fx, fy); ctx.lineTo(c.x, c.y); }
      ctx.stroke();
      ctx.globalAlpha = 0.5; const b = 16, l = 5;
      ctx.beginPath();
      ctx.moveTo(fx - b, fy - b + l); ctx.lineTo(fx - b, fy - b); ctx.lineTo(fx - b + l, fy - b);
      ctx.moveTo(fx + b - l, fy - b); ctx.lineTo(fx + b, fy - b); ctx.lineTo(fx + b, fy - b + l);
      ctx.moveTo(fx + b, fy + b - l); ctx.lineTo(fx + b, fy + b); ctx.lineTo(fx + b - l, fy + b);
      ctx.moveTo(fx - b + l, fy + b); ctx.lineTo(fx - b, fy + b); ctx.lineTo(fx - b, fy + b - l);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  let frame = 0;
  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (!pointer.fine && (frame++ & 1)) return;           // touch devices: 30fps is plenty for a wandering field
    draw(now);
  }

  const api = {
    start() {
      if (o.reduced) {                                    // reduced motion: one frame, plus one frame per pointer move
        draw(performance.now());
        if (!api._pm) { api._pm = true; let pm = 0; addEventListener('pointermove', () => { if (!pm) pm = requestAnimationFrame((n) => { pm = 0; draw(n); }); }, { passive: true }); }
        return;
      }
      if (!running) { running = true; raf = requestAnimationFrame(loop); }
    },
    stop() { running = false; cancelAnimationFrame(raf); },
    resize,
    setScroll(p) { scroll = clamp(p, 0, 1); if (o.reduced) draw(performance.now()); },
    ripple(x, y) { ripples.push({ x: x - left, y: y - top, t: (performance.now() - t0) / 1000 }); },
    setTop(px) { top = px; },                              // fed from ScrollTrigger geometry
    get reduced() { return o.reduced; },
    get height() { return H; },
  };
  resize();
  addEventListener('app:resize', () => { const r = canvas.getBoundingClientRect(); if (Math.round(r.width) === W && Math.round(r.height) === H) { left = r.left; top = r.top; return; } resize(); });
  return api;
}

// Small static field for section backgrounds (P05 mark field) — drawn once, cheap.
export function paintMarkField(canvas, { color = '#141414', pitch = 96, unit = 6, alpha = 1 } = {}) {
  const ctx = canvas.getContext('2d');
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = r.width * dpr; canvas.height = r.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = color; ctx.globalAlpha = alpha;
  for (let y = -pitch; y < r.height + pitch; y += pitch)
    for (let x = -pitch; x < r.width + pitch; x += pitch)
      for (let rr = 0; rr < 7; rr++) for (let k = 0; k < 7; k++) if (MARK[rr][k]) ctx.fillRect(x + k * unit, y + rr * unit, unit, unit);
}

// Tiered mark field: each mark's rung depends on its distance from a focus line (viewport centre).
// Decorative layer at dpr 1 (CSS upscales, pixelated). Only rows whose rung changed are repainted,
// so most scroll frames are no-ops and the rest touch one 132px strip.
export function createTieredField(canvas, { color = '#141414', pitch = 132, unit = 7 } = {}) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, tiers = [], last = null;
  function resize() {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    canvas.width = W; canvas.height = H;
    tiers = [];
    if (last) paint(last[0], last[1]);
  }
  function paint(focusY, span) {
    last = [focusY, span];
    ctx.fillStyle = color;
    let i = 0;
    for (let y = -pitch; y < H + pitch; y += pitch, i++) {
      const d = Math.abs(y + 3.5 * unit - focusY) / span;
      const t = d < 0.12 ? 4 : d < 0.3 ? 3 : d < 0.5 ? 2 : d < 0.72 ? 1 : 0;
      if (tiers[i] === t) continue;
      tiers[i] = t;
      ctx.clearRect(0, Math.max(0, y), W, pitch);
      const bits = PROGRESSION[t];
      for (let x = -pitch; x < W + pitch; x += pitch)
        for (let rr = 0; rr < 7; rr++) for (let k = 0; k < 7; k++) if (bits[rr][k]) ctx.fillRect(x + k * unit, y + rr * unit, unit, unit);
    }
  }
  resize();
  addEventListener('app:resize', resize);
  return { paint, resize, get height() { return H; } };
}

export { ICONS };
