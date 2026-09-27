// Shared pointer state. One listener, lerped in rAF while the cursor is moving, asleep when it settles.
export const pointer = {
  x: innerWidth / 2, y: innerHeight / 2,   // raw
  lx: innerWidth / 2, ly: innerHeight / 2, // lerped
  active: false,                            // has a real pointer moved yet
  down: false,
  fine: matchMedia('(pointer: fine)').matches,
};

let raf = 0, cursorEl = null, idle = 0;

function tick() {
  const k = 0.16;
  pointer.lx += (pointer.x - pointer.lx) * k;
  pointer.ly += (pointer.y - pointer.ly) * k;
  if (cursorEl) cursorEl.style.transform = `translate3d(${pointer.lx.toFixed(1)}px,${pointer.ly.toFixed(1)}px,0)`;
  const still = Math.abs(pointer.x - pointer.lx) + Math.abs(pointer.y - pointer.ly) < 0.05;
  idle = still ? idle + 1 : 0;
  raf = idle > 30 ? 0 : requestAnimationFrame(tick);   // sleep once the cursor has settled
}
function wake() { if (!raf && pointer.fine) { idle = 0; raf = requestAnimationFrame(tick); } }

addEventListener('pointermove', (e) => {
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true; wake();
}, { passive: true });
addEventListener('pointerdown', () => (pointer.down = true), { passive: true });
addEventListener('pointerup', () => (pointer.down = false), { passive: true });
addEventListener('blur', () => (pointer.down = false));

// One debounced resize for every consumer (canvas rebuilds, image re-sampling) — never the raw event.
let rt = 0;
addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => dispatchEvent(new Event('app:resize')), 150); }, { passive: true });

export function startPointer(cursor) { cursorEl = cursor || null; wake(); }
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smoothstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
