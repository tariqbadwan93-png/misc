// misc.* — orchestration. Vanilla + GSAP/ScrollTrigger + Lenis. No framework, no build.
import { MARK, PROGRESSION, ICONS, DIGITS, svg, paint } from './glyphs.js';
import { pointer, startPointer, clamp } from './pointer.js';
import { createField, createTieredField } from './field.js';
import { createDither } from './dither.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('static');
const D = reduced ? 0 : 1; // duration multiplier: reduced motion = everything lands instantly
const fine = matchMedia('(pointer: fine)').matches;
if (reduced) document.documentElement.classList.add('reduced');

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });
startPointer($('#cursor'));

/* ---------- glyph injection ---------- */
$$('[data-glyph]').forEach((el) => {
  const k = el.dataset.glyph;
  el.innerHTML = svg(k === 'mark' ? MARK : ICONS[k] || MARK);
});

/* ---------- smooth scroll ---------- */
const lenis = reduced ? null : new Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 1, touchMultiplier: 1.4 });
if (lenis) {
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
const focusTarget = (t) => { if (!t.hasAttribute('tabindex')) t.tabIndex = -1; t.focus({ preventScroll: true }); };
const scrollTo = (target) => {
  if (lenis) lenis.scrollTo(target, { offset: 0, duration: 1.4, onComplete: () => focusTarget(target) });
  else { target.scrollIntoView(); focusTarget(target); }
};
$$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
  const t = document.querySelector(a.getAttribute('href'));
  if (!t) return;
  e.preventDefault(); closeMenu(); scrollTo(t);
  history.replaceState(null, '', a.getAttribute('href'));
}));

/* ---------- cursor ---------- */
const cursor = $('#cursor');
if (fine && !reduced) {
  document.body.classList.add('has-cursor');
  const hoverSel = 'a, button, .service, .row, .card, .person__you, .dither';
  document.addEventListener('pointerover', (e) => { if (e.target.closest(hoverSel)) cursor.classList.add('is-hover'); });
  document.addEventListener('pointerout', (e) => { if (e.target.closest(hoverSel)) cursor.classList.remove('is-hover'); });
  addEventListener('pointerdown', () => cursor.classList.add('is-down'));
  addEventListener('pointerup', () => cursor.classList.remove('is-down'));
  document.addEventListener('mouseleave', () => cursor.classList.add('is-hidden'));
  document.addEventListener('mouseenter', () => cursor.classList.remove('is-hidden'));
}
// the cursor turns void over lime and plum surfaces — decided by what is actually under it
let cursorRaf = 0;
function cursorSurface() {
  cursorRaf = 0;
  const el = document.elementFromPoint(pointer.x, pointer.y);
  cursor.classList.toggle('is-dark', !!(el && el.closest('.surface--lime, .surface--plum')));
}
const queueCursorSurface = () => { if (fine && !cursorRaf) cursorRaf = requestAnimationFrame(cursorSurface); };
addEventListener('pointermove', queueCursorSurface, { passive: true });

/* ---------- nav ---------- */
const nav = $('#nav');
const burger = $('#burger'), menu = $('#menu');
const inertables = [$('main'), $('footer')];
function closeMenu(refocus) {
  if (!menu.classList.contains('is-open')) return;
  menu.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-hidden', 'true');
  inertables.forEach((el) => el.removeAttribute('inert'));
  lenis && lenis.start();
  if (refocus) burger.focus();
}
function openMenu() {
  menu.classList.add('is-open'); burger.setAttribute('aria-expanded', 'true'); menu.setAttribute('aria-hidden', 'false');
  inertables.forEach((el) => el.setAttribute('inert', ''));
  lenis && lenis.stop();
  $('a', menu).focus();
}
burger.addEventListener('click', () => (menu.classList.contains('is-open') ? closeMenu(true) : openMenu()));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(true); });
// theme follows the surface under the nav; hide nav on fast downward scroll
$$('[id]').forEach((sec) => {
  const theme = sec.classList.contains('surface--lime') ? 'lime' : sec.classList.contains('surface--plum') ? 'plum' : null;
  if (!theme && !sec.classList.contains('section') && sec.id !== 'hero') return;
  ScrollTrigger.create({
    trigger: sec, start: 'top 40px', end: 'bottom 40px',
    onToggle: (st) => { if (st.isActive) nav.dataset.theme = theme || 'void'; },
  });
});
const readout = $('#readout'), readoutPct = $('#readoutPct');
readout.classList.add('is-off');                            // hidden over the hero until you scroll past it
ScrollTrigger.create({
  start: 0, end: 'max',
  onUpdate: (st) => {
    const down = st.direction === 1 && st.scroll() > 200 && st.getVelocity() > 400 && !nav.contains(document.activeElement);
    nav.classList.toggle('is-hidden', down);
    if (st.getVelocity() < -100) nav.classList.remove('is-hidden');
    queueCursorSurface();
    // the site is the thing loading: 00% at the top, 100% when you reach the contact mark
    const p = Math.round(st.progress * 100);
    readoutPct.textContent = String(p).padStart(2, '0') + '%';
    readout.classList.toggle('is-done', p >= 100);
  },
});

/* ---------- magnetic ---------- */
if (fine && !reduced) $$('.magnetic').forEach((el) => {
  const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3' }), yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3' });
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    xTo((e.clientX - (r.left + r.width / 2)) * 0.28); yTo((e.clientY - (r.top + r.height / 2)) * 0.28);
  });
  el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
});

/* ---------- hero field ---------- */
const field = createField($('#field'), { pitch: 30, unit: 3, radius: 320, reduced });
const hero = $('#hero');
ScrollTrigger.create({
  trigger: hero, start: 'top top', end: 'bottom top', scrub: true,
  onUpdate: (st) => { field.setScroll(st.progress); field.setTop(-st.scroll()); },
  onToggle: (st) => { st.isActive ? field.start() : field.stop(); readout.classList.toggle('is-off', st.isActive); },
});
hero.addEventListener('pointerdown', (e) => field.ripple(e.clientX, e.clientY));
addEventListener('visibilitychange', () => (document.hidden ? field.stop() : ScrollTrigger.isInViewport(hero) && field.start()));
if (!reduced) gsap.to('#heroTitle', { yPercent: -18, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });

/* ---------- loader ---------- */
const loader = $('#loader');
if (!reduced) gsap.set('#heroTitle .line > span', { yPercent: 110 });
function intro() {
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.fromTo('#heroTitle .line > span', { yPercent: 110 }, { yPercent: 0, duration: 1.3 }, 0)
    .fromTo(['#heroTag', '#heroScribble'], { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 1, stagger: 0.12 }, 0.35)
    .fromTo(['.hero__meta', '.hero__foot', '.nav'], { opacity: 0 }, { opacity: 1, duration: 0.9, stagger: 0.08 }, 0.5);
  field.start();
}
if (reduced || document.documentElement.classList.contains('no-js')) {
  loader.remove(); field.start();
} else {
  lenis && lenis.stop();
  const pct = $('#loaderPct'), bar = $('#loaderBar'), gc = $('#loaderGlyph').getContext('2d');
  const drawStep = (i) => { gc.clearRect(0, 0, 56, 56); gc.fillStyle = '#D0FF00'; paint(gc, PROGRESSION[i], 0, 0, 8); };
  const state = { p: 0 };
  drawStep(0);
  let finished = false;
  const finish = () => {                                    // idempotent: tween end, visibility change or the 4.5s guard
    if (finished) return; finished = true;
    pct.textContent = '100%'; bar.style.transform = 'scaleX(1)'; drawStep(4);
    gsap.to(loader, { yPercent: -100, duration: 0.9, ease: 'expo.inOut', onComplete: () => { loader.remove(); lenis && lenis.start(); ScrollTrigger.refresh(); } });
    gsap.delayedCall(0.35, intro);
  };
  gsap.to(state, {
    p: 100, duration: 1.5, ease: 'power2.inOut',
    onUpdate: () => { const v = Math.round(state.p); pct.textContent = String(v).padStart(2, '0') + '%'; bar.style.transform = `scaleX(${state.p / 100})`; drawStep(Math.min(4, Math.floor(state.p / 20.01))); },
    onComplete: finish,
  });
  setTimeout(finish, 4500);                                  // never trap a background tab on the loader
  addEventListener('visibilitychange', () => { if (!document.hidden && state.p >= 99) finish(); });
}

/* ---------- reveals ---------- */
if (!reduced) {
  ScrollTrigger.batch('.reveal', {
    start: 'top 88%', once: true,
    onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1.1 * D, ease: 'expo.out', stagger: 0.08 * D, overwrite: true }),
  });
} else gsap.set('.reveal', { opacity: 1, y: 0 });

/* ---------- manifesto: words resolve on scroll, mark turns ---------- */
{
  const el = $('#manifestoText');
  el.innerHTML = el.textContent.split(' ').map((w) => `<span class="w">${w}</span>`).join(' ');
  if (reduced) gsap.set('#manifestoText .w', { opacity: 1 });
  else {
    gsap.to('#manifestoText .w', { opacity: 1, stagger: 0.06, ease: 'none', scrollTrigger: { trigger: el, start: 'top 75%', end: 'bottom 45%', scrub: 0.6 } });
    gsap.to('#manifestoMark', { rotation: 360, ease: 'steps(4)', scrollTrigger: { trigger: '#manifesto', start: 'top bottom', end: 'bottom top', scrub: true } });
  }
}

/* ---------- services: highlight follows the pointer, icon glitches on hover ---------- */
{
  const grid = $('#services');
  grid.addEventListener('pointermove', (e) => {
    const s = e.target.closest('.service'); if (!s) return;
    const r = s.getBoundingClientRect();
    s.style.setProperty('--hx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
    s.style.setProperty('--hy', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
  }, { passive: true });
  if (!reduced) $$('.service').forEach((s) => {
    const g = $('.glyph', s), final = g.innerHTML;
    let t = 0;
    s.addEventListener('pointerenter', () => {
      clearTimeout(t); let i = 0;
      const step = () => { g.innerHTML = i < 4 ? svg(PROGRESSION[i]) : final; if (i++ < 4) t = setTimeout(step, 55); };
      step();
    });
  });
  ScrollTrigger.batch('.service', { start: 'top 90%', once: true, onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.9 * D, stagger: 0.07 * D, ease: 'expo.out' }) });
}

/* ---------- ticker: drifts, speeds with scroll velocity ---------- */
{
  const track = $('#tickerTrack');
  const items = ['branding', 'spaces', 'apps', 'f&amp;b', 'menus', 'launches', 'et cetera<b>*</b>'];
  const unit = items.map((i) => `<span>${i}</span>`).join('<span>—</span>');
  track.innerHTML = Array(3).fill(unit).join('<span>—</span>');
  let x = 0, w = 0, on = false;
  const measure = () => (w = track.scrollWidth / 3);
  measure(); addEventListener('app:resize', measure);
  const tickFn = (_, dt) => {
    const v = lenis ? clamp(lenis.velocity, -60, 60) : 0;
    x -= (0.6 + Math.abs(v) * 0.08) * (dt / 16.7) * (v < 0 ? -1 : 1);
    if (x <= -w) x += w; if (x > 0) x -= w;
    track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
  };
  const setOn = (v) => { if (v === on) return; on = v; v ? gsap.ticker.add(tickFn) : gsap.ticker.remove(tickFn); };
  if (!reduced) {
    ScrollTrigger.create({ trigger: '#ticker', start: 'top bottom', end: 'bottom top', onToggle: (st) => setOn(st.isActive && !document.hidden) });
    addEventListener('visibilitychange', () => setOn(!document.hidden && ScrollTrigger.isInViewport($('#ticker'))));
  }
}

/* ---------- process: pixel morph through the progression ---------- */
{
  const cv = $('#processGlyph'), g = cv.getContext('2d'), U = 48; // 7×48 = 336
  const cur = new Float32Array(49), tgt = new Float32Array(49);
  const steps = $$('.step'), nEl = $('#processN');
  let active = 0, raf = 0;
  const setTarget = (i) => { for (let k = 0; k < 49; k++) tgt[k] = PROGRESSION[i][(k / 7) | 0][k % 7]; };
  const draw = () => {
    g.clearRect(0, 0, 336, 336); g.fillStyle = '#D0FF00';
    let busy = false;
    for (let k = 0; k < 49; k++) {
      // cells near the centre settle first — the mark grows outward
      const r = (k / 7) | 0, c = k % 7, dist = Math.abs(r - 3) + Math.abs(c - 3);
      const speed = reduced ? 1 : 0.18 - dist * 0.012;
      cur[k] += (tgt[k] - cur[k]) * speed;
      if (Math.abs(tgt[k] - cur[k]) > 0.01) busy = true;
      const a = cur[k]; if (a < 0.02) continue;
      const s = U * (0.35 + 0.65 * a);
      g.globalAlpha = a; g.fillRect(c * U + (U - s) / 2, r * U + (U - s) / 2, s, s);
    }
    g.globalAlpha = 1;
    if (busy) raf = requestAnimationFrame(draw);
  };
  const go = (i) => {
    if (i === active && cur.some((v) => v > 0)) return;
    active = i; setTarget(i); steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
    nEl.textContent = String(i + 1).padStart(2, '0');
    cancelAnimationFrame(raf); raf = requestAnimationFrame(draw);
  };
  setTarget(0); cur.set(tgt); draw();
  steps.forEach((s, i) => ScrollTrigger.create({ trigger: s, start: 'top 60%', end: 'bottom 60%', onEnter: () => go(i), onEnterBack: () => go(i) }));
}

/* ---------- dithered imagery: scroll reveals, pointer lens ---------- */
{
  $$('.dither').forEach((fig) => {
    const img = $('img', fig), cv = $('canvas', fig);
    const api = createDither(img, cv, { palette: fig.dataset.palette || 'lime', cell: 4, lens: 170, reduced });
    if (reduced) api.setResolve(1);
    else ScrollTrigger.create({ trigger: fig, start: 'top 95%', end: 'top 45%', onUpdate: (st) => api.setResolve(st.progress) });
    const host = fig.closest('.card') || fig;
    host.addEventListener('pointerenter', () => api.hover(true));
    host.addEventListener('pointerleave', () => api.hover(false));
  });
}

/* ---------- why: P06 bloom in plum-deep follows the pointer — the cursor's shadow. never lime on plum. ---------- */
{
  const why = $('#why');
  const bloom = createField($('#whyField'), { pitch: 30, unit: 3, radius: 280, ambient: 0.7, baseFloor: 0.06, hud: false, reduced,
    palette: { near: '#4C0D86', far: '#4C0D86', rare: null } });
  ScrollTrigger.create({
    trigger: why, start: 'top bottom', end: 'bottom top',
    onUpdate: (st) => bloom.setTop(innerHeight - st.progress * (innerHeight + bloom.height)),
    onToggle: (st) => (st.isActive ? bloom.start() : bloom.stop()),
  });
  ScrollTrigger.batch('.reason', { start: 'top 85%', once: true, onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1 * D, stagger: 0.12 * D, ease: 'expo.out' }) });
}

/* ---------- numbers: counters ---------- */
$$('.stat__v').forEach((el) => {
  const target = +el.dataset.count, pad = +(el.dataset.pad || 1), prefix = el.dataset.prefix || '';
  const suffix = el.querySelector('.ast')?.outerHTML || '';
  const st = { v: 0 };
  const render = () => (el.innerHTML = prefix + String(Math.round(st.v)).padStart(pad, '0') + suffix);
  ScrollTrigger.create({ trigger: el, start: 'top 88%', once: true, onEnter: () => (reduced ? (st.v = target, render()) : gsap.to(st, { v: target, duration: 1.4, ease: 'expo.out', onUpdate: render })) });
});

/* ---------- work: mark field behind, cards rise ---------- */
{
  const cv = $('#workField'), tf = createTieredField(cv, { color: '#141414', pitch: 132, unit: 7 });
  const work = $('#work');
  // focus line = viewport centre, derived from trigger geometry (no layout reads per frame)
  const paintTiers = (st) => { const top = innerHeight - st.progress * (innerHeight + tf.height); tf.paint(innerHeight / 2 - top, innerHeight * 0.55); };
  ScrollTrigger.create({ trigger: work, start: 'top bottom', end: 'bottom top', onUpdate: paintTiers, onRefresh: (st) => { tf.resize(); paintTiers(st); } });
  ScrollTrigger.batch('.card', { start: 'top 88%', once: true, onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1.2 * D, stagger: 0.1 * D, ease: 'expo.out' }) });
  gsap.fromTo('#outcome', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1.1 * D, ease: 'expo.out', scrollTrigger: { trigger: '#outcome', start: 'top 85%', once: true } });
}

/* ---------- people ---------- */
ScrollTrigger.batch('.person', { start: 'top 88%', once: true, onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1 * D, stagger: 0.1 * D, ease: 'expo.out' }) });

/* ---------- contact: your project, loading… ---------- */
{
  const prog = $('#contactProg');
  prog.innerHTML = PROGRESSION.map((b) => `<i class="glyph">${svg(b)}</i>`).join('');
  const gl = $$('.glyph', prog), mail = $('.contact__mail');
  let scrollN = 0, near = false;
  const render = () => { const n = near ? 5 : Math.min(4, scrollN); gl.forEach((g, i) => g.classList.toggle('is-on', i < n)); gl[4].classList.toggle('is-lime', near); };
  ScrollTrigger.create({
    trigger: '#contact', start: 'top 80%', end: 'bottom bottom', scrub: true,
    onUpdate: (st) => { scrollN = Math.floor(st.progress * 4.999); render(); },
  });
  // the fifth step — the mark — only lights as you close in on hello@wearemisc.com
  if (fine) $('#contact').addEventListener('pointermove', (e) => {
    const r = mail.getBoundingClientRect();
    const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    const n = d < Math.max(260, r.width * 0.8);
    if (n !== near) { near = n; render(); }
  }, { passive: true });
  mail.addEventListener('focus', () => { near = true; render(); });
  mail.addEventListener('blur', () => { near = false; render(); });
  gsap.fromTo('#contactTitle', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 1.3 * D, ease: 'expo.out', scrollTrigger: { trigger: '#contactTitle', start: 'top 85%', once: true } });
}

/* ---------- housekeeping ---------- */
addEventListener('load', () => ScrollTrigger.refresh());
document.fonts && document.fonts.ready.then(() => ScrollTrigger.refresh());
