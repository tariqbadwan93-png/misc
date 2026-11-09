// Selected work: a receding 3D row of cards. Page scroll pans it, dragging (or a sideways swipe) pans it,
// and a click flies the card out of the row into a detail view. Esc, Close or a click outside flies it back.
// Each card's pose is a mix of its place in the row and the detail pose, so open/close is one shared-element move.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ramp = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - t, 4);

export function createGallery(section, { lenis = null, reduced = false, onActive = () => {} } = {}) {
  const q = (s) => section.querySelector(s);
  const stage = q('.work__stage');
  const track = q('.work__track');
  const cards = [...track.querySelectorAll('.card')];
  const hits = cards.map((c) => c.querySelector('.card__hit'));
  const N = cards.length;
  const data = cards.map((c) => ({
    mix: parseFloat(c.dataset.mix) || 0.5,
    title: c.querySelector('h3').textContent,
    meta: c.querySelector('.card__meta').textContent,
    desc: c.querySelector('.card__desc').innerHTML,
  }));
  const ui = {
    count: q('.js-count'), title: q('.js-title'), meta: q('.js-meta'), caption: q('.work__caption'), head: q('.work__head'),
    detail: q('.work__detail'), dIndex: q('.js-d-index'), dTitle: q('#detail-title'), dMeta: q('.js-d-meta'),
    dDesc: q('.js-d-desc'), prev: q('.js-prev'), next: q('.js-next'), close: q('.js-close'),
  };
  const pad = (n) => String(n + 1).padStart(2, '0');
  q('.js-total').textContent = pad(N - 1);
  section.style.setProperty('--n', N);
  const D = (s) => (reduced ? 0 : s);

  // ---------- geometry (recomputed on every ScrollTrigger refresh) ----------
  const g = { top: 0, span: 1, perCard: 1 };
  function measure() {
    const W = stage.clientWidth, H = stage.clientHeight, mobile = W < 760;
    // the card's real size is its detail size; in the row it is scaled down, which keeps the image crisp
    let ch, cx, cy;
    if (mobile) {
      const cw0 = Math.min(W * 0.86, H * 0.5 * 0.75);
      ch = cw0 / 0.75; cx = W / 2; cy = Math.max(70, H * 0.085) + ch / 2;
    } else {
      ch = Math.min(H * 0.74, (W * 0.48) / 0.75); cx = W * 0.64; cy = H * 0.52;
    }
    const cw = ch * 0.75;
    const th = H * (mobile ? 0.44 : 0.42);
    const ts = th / ch;
    Object.assign(g, {
      W, H, mobile, cw, ch, cx, cy, th, ts,
      ax: W * (mobile ? 0.5 : 0.33), ay: H * (mobile ? 0.53 : 0.57),
      gx: cw * ts * (mobile ? 0.86 : 1.06), gy: th * (mobile ? 0.1 : 0.2), gz: mobile ? 280 : 240,
    });
    stage.style.setProperty('--cw', `${cw}px`);
    stage.style.setProperty('--ch', `${ch}px`);
    stage.style.setProperty('--ts', ts.toFixed(3));
    stage.style.setProperty('--persp', `${mobile ? 900 : 1200}px`);
    g.top = section.getBoundingClientRect().top + scrollY;
    g.span = Math.max(1, section.offsetHeight - H);
    g.perCard = g.span / Math.max(1, N - 1);
  }

  // ---------- render ----------
  const openState = cards.map(() => ({ v: 0 }));
  let p = 0, pTarget = 0, active = -1, time = 0, openIndex = -1;
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };

  function render(dt) {
    time += dt;
    p += (pTarget - p) * (reduced ? 1 : 1 - Math.exp(-dt * 10));
    const kt = 1 - Math.exp(-dt * 3);
    tilt.x += (tilt.tx - tilt.x) * kt;
    tilt.y += (tilt.ty - tilt.y) * kt;
    let go = 0;
    for (const s of openState) go = Math.max(go, s.v);

    for (let i = 0; i < N; i++) {
      const d = i - p, o = openState[i].v;
      const float = reduced ? 0 : Math.sin(time * 0.8 + i * 1.3) * g.th * 0.012;
      let x = g.ax + d * g.gx + tilt.x * 14;
      let y = g.ay - d * g.gy + float;
      let z = -d * g.gz;
      let ry = -16 + tilt.x * 6, rx = 4 - tilt.y * 4, s = g.ts;
      let a = ramp(-0.95, -0.3, d) * (1 - ramp(4.4, 6.4, d));
      const rest = go * (1 - o); // everyone else steps back while a card is open
      z -= rest * 320;
      a *= 1 - rest * 0.96;
      if (o > 0) {
        x = lerp(x, g.cx, o); y = lerp(y, g.cy, o); z = lerp(z, 0, o);
        ry = lerp(ry, 0, o); rx = lerp(rx, 0, o); s = lerp(s, 1, o); a = lerp(a, 1, o);
      }
      const el = cards[i].style;
      el.transform = `translate3d(${(x - g.cw / 2).toFixed(2)}px,${(y - g.ch / 2).toFixed(2)}px,${z.toFixed(1)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${s.toFixed(4)})`;
      el.opacity = a.toFixed(3);
      el.zIndex = o > 0.001 ? 5000 + Math.round(o * 100) : 1000 - Math.round(d * 100);
      el.pointerEvents = a < 0.35 ? 'none' : '';
    }
    ui.caption.style.opacity = ui.head.style.opacity = (1 - go).toFixed(3);
    const ai = clamp(Math.round(p), 0, N - 1);
    if (ai !== active) setActive(ai);
  }

  function setActive(i) {
    active = i;
    ui.count.textContent = pad(i);
    ui.title.textContent = data[i].title;
    ui.meta.textContent = data[i].meta;
    if (!reduced) gsap.fromTo([ui.title, ui.meta], { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.05, ease: 'expo.out', overwrite: true });
    onActive(i, data[i].mix);
  }

  // loop runs only while the section is on screen
  let raf = 0, last = 0, visible = false;
  function frame(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    render(dt);
    raf = visible || openIndex >= 0 ? requestAnimationFrame(frame) : 0;
  }
  const wake = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };

  // ---------- scroll ----------
  ScrollTrigger.create({
    trigger: section, start: 'top top', end: 'bottom bottom',
    onUpdate: (st) => { pTarget = st.progress * (N - 1); },
    onRefresh: (st) => { measure(); pTarget = st.progress * (N - 1); wake(); },
  });
  ScrollTrigger.create({
    trigger: section, start: 'top bottom', end: 'bottom top',
    onToggle: (st) => { visible = st.isActive; if (visible) wake(); },
  });

  const cardScroll = (i) => g.top + g.perCard * i;
  function scrollTo(y, opts = {}) {
    y = clamp(y, g.top, g.top + g.span);
    if (lenis) lenis.scrollTo(y, { force: true, ...opts, ...(reduced ? { immediate: true } : {}) });
    else window.scrollTo({ top: y, behavior: 'instant' });
  }

  // ---------- pointer tilt (fine pointers only) ----------
  if (!reduced && matchMedia('(pointer: fine)').matches) {
    addEventListener('pointermove', (e) => {
      tilt.tx = (e.clientX / innerWidth) * 2 - 1;
      tilt.ty = (e.clientY / innerHeight) * 2 - 1;
    }, { passive: true });
  }

  // ---------- drag to pan (mouse and sideways touch); vertical touch stays native scroll ----------
  let drag = null, suppressClick = false;
  track.addEventListener('pointerdown', (e) => {
    if (openIndex >= 0 || e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y0: scrollY, moved: false, vx: 0, lx: e.clientX, lt: performance.now() };
  });
  addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) < 6) return;
      drag.moved = true;
      track.classList.add('is-dragging');
    }
    const now = performance.now();
    drag.vx = lerp(drag.vx, (e.clientX - drag.lx) / Math.max(1, now - drag.lt), 0.35);
    drag.lx = e.clientX; drag.lt = now;
    scrollTo(drag.y0 - dx * (g.perCard / g.gx), { immediate: true });
  }, { passive: true });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved) {
      track.classList.remove('is-dragging');
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 60);
      // fling, then settle on the nearest card
      const flung = scrollY - drag.vx * 280 * (g.perCard / g.gx);
      scrollTo(g.top + Math.round((flung - g.top) / g.perCard) * g.perCard, { duration: 1.1, easing: easeOut });
    }
    drag = null;
  };
  addEventListener('pointerup', endDrag);
  addEventListener('pointercancel', endDrag);
  track.addEventListener('click', (e) => { if (suppressClick) { e.preventDefault(); e.stopPropagation(); } }, true);

  // trackpad sideways swipes pan the row too
  track.addEventListener('wheel', (e) => {
    if (openIndex >= 0 || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    const from = lenis ? lenis.targetScroll : scrollY;
    scrollTo(from + e.deltaX * (g.perCard / g.gx));
  }, { passive: false });

  // ---------- keyboard: focusing a card brings it to the front; arrows walk the row ----------
  hits.forEach((hit, i) => {
    hit.addEventListener('click', () => open(i));
    hit.addEventListener('focus', () => { if (openIndex < 0 && hit.matches(':focus-visible')) scrollTo(cardScroll(i), { duration: 0.9, easing: easeOut }); });
  });
  track.addEventListener('keydown', (e) => {
    if (openIndex >= 0) return;
    const i = hits.indexOf(document.activeElement);
    if (i < 0) return;
    const j = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : -2;
    if (j === -2) return;
    e.preventDefault();
    hits[clamp(j, 0, N - 1)].focus();
  });

  // ---------- open / step / close ----------
  const outside = [...document.querySelectorAll('.top, .hero, .studio, .contact, .foot')].concat(track);
  let lastFocus = null;

  function fill(i) {
    ui.dIndex.textContent = `${pad(i)} / ${pad(N - 1)}`;
    ui.dTitle.textContent = data[i].title;
    ui.dMeta.textContent = data[i].meta;
    ui.dDesc.innerHTML = data[i].desc;
    ui.prev.disabled = i === 0;
    ui.next.disabled = i === N - 1;
    if (document.activeElement && document.activeElement.disabled) ui.close.focus({ preventScroll: true });
  }

  function open(i) {
    if (openIndex >= 0) return;
    openIndex = i;
    lastFocus = hits[i];
    fill(i);
    cards[i].classList.add('is-open');
    gsap.killTweensOf(ui.detail.children);
    ui.detail.hidden = false;
    outside.forEach((el) => (el.inert = true));
    lenis?.stop();
    scrollTo(cardScroll(i), { duration: 1.1, easing: easeOut });
    gsap.to(openState[i], { v: 1, duration: D(1.1), ease: 'power4.inOut', overwrite: true });
    gsap.fromTo(ui.detail.children, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: D(0.8), stagger: D(0.05), delay: D(0.35), ease: 'expo.out' });
    ui.close.focus({ preventScroll: true });
    document.addEventListener('keydown', onKey);
    wake();
  }

  function step(dir) {
    const i = openIndex, j = i + dir;
    if (i < 0 || j < 0 || j >= N) return;
    openIndex = j;
    lastFocus = hits[j];
    cards[j].classList.add('is-open');
    gsap.to(openState[i], { v: 0, duration: D(0.9), ease: 'power3.inOut', overwrite: true, onComplete: () => { if (openIndex !== i) cards[i].classList.remove('is-open'); } });
    gsap.to(openState[j], { v: 1, duration: D(1), ease: 'power4.inOut', overwrite: true });
    scrollTo(cardScroll(j), { duration: 1, easing: easeOut });
    const text = [ui.dIndex, ui.dTitle, ui.dMeta, ui.dDesc];
    gsap.to(text, {
      opacity: 0, y: -8 * dir, duration: D(0.22), ease: 'power2.in', overwrite: true,
      onComplete: () => { fill(j); gsap.fromTo(text, { opacity: 0, y: 10 * dir }, { opacity: 1, y: 0, duration: D(0.6), stagger: D(0.04), ease: 'expo.out' }); },
    });
  }

  function close() {
    const i = openIndex;
    if (i < 0) return;
    openIndex = -1;
    gsap.to(openState[i], { v: 0, duration: D(0.95), ease: 'power3.inOut', overwrite: true, onComplete: () => { if (openIndex !== i) cards[i].classList.remove('is-open'); } });
    gsap.to(ui.detail.children, {
      opacity: 0, y: -8, duration: D(0.3), stagger: D(0.02), ease: 'power2.in', overwrite: true,
      onComplete: () => { if (openIndex < 0) ui.detail.hidden = true; },
    });
    outside.forEach((el) => (el.inert = false));
    lenis?.start();
    document.removeEventListener('keydown', onKey);
    lastFocus?.focus({ preventScroll: true });
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); return; }
    if (e.key === 'Tab') {
      const f = [...ui.detail.querySelectorAll('a[href], button:not([disabled])')];
      const k = f.indexOf(document.activeElement);
      if (e.shiftKey && k <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && k === f.length - 1) { e.preventDefault(); f[0].focus(); }
      return;
    }
    // the page is frozen while a project is open
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key) || (e.key === ' ' && !e.target.closest('button, a'))) e.preventDefault();
  }

  ui.close.addEventListener('click', close);
  ui.prev.addEventListener('click', () => step(-1));
  ui.next.addEventListener('click', () => step(1));
  stage.addEventListener('click', (e) => {
    if (openIndex >= 0 && !ui.detail.contains(e.target) && !cards[openIndex].contains(e.target)) close();
  });

  measure();
  render(0);
  return { measure };
}
