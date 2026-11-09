// misc.* — orchestration. Vanilla + GSAP (ScrollTrigger, SplitText) + Lenis + a lazy three.js backdrop. No build.
import { createGallery } from './gallery.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
// ?static=1 forces the reduced-motion path (QA screenshots in throttled/hidden tabs)
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('static');
if (reduced) root.classList.add('reduced');

// a visible way to stop the moving backdrop (WCAG 2.2.2); the system setting already does it on its own
const motionLink = $('.js-motion');
if (matchMedia('(prefers-reduced-motion: reduce)').matches) motionLink.remove();
else if (reduced) { motionLink.textContent = 'Motion on'; motionLink.href = location.pathname; }

gsap.registerPlugin(ScrollTrigger, SplitText);
ScrollTrigger.config({ ignoreMobileResize: true });

/* ---------- smooth scroll ---------- */
const lenis = reduced ? null : new Lenis({ lerp: 0.1, smoothWheel: true });
if (lenis) {
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

$$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
  const id = a.getAttribute('href');
  const el = id === '#top' ? $('main') : $(id);
  if (!el) return;
  e.preventDefault();
  if (lenis) lenis.scrollTo(id === '#top' ? 0 : el, { duration: 1.4 });
  else el.scrollIntoView();
  history.replaceState(null, '', id === '#top' ? location.pathname : id);
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
}));

/* ---------- backdrop: the liquid light + the glass asterisk you can spin, loaded after first paint ---------- */
let scene = null;
let mix = { work: 0.42, inWork: false, inContact: false };
const applyMix = () => scene?.setMix(mix.inContact ? 0.86 : mix.inWork ? mix.work : 0.42);

import('./scene.js?v=4')
  .then(({ createScene }) => createScene($('#scene'), { reduced, grabArea: $('.hero') }))
  .then((s) => {
    scene = s;
    $('#scene').classList.add('is-ready');
    applyMix();
    ScrollTrigger.refresh();
  })
  .catch((err) => {
    console.warn('WebGL backdrop unavailable:', err);
    root.classList.add('no-webgl');
  });

ScrollTrigger.create({
  trigger: '.hero', start: 'top top', end: 'bottom top',
  onUpdate: (st) => scene?.setHero(st.progress),
  onRefresh: (st) => scene?.setHero(st.progress),
});
ScrollTrigger.create({
  start: 0, end: 'max',
  onUpdate: (st) => { scene?.setPage(st.progress); scene?.setVelocity(st.getVelocity() / 100); },
});
ScrollTrigger.create({ trigger: '#work', start: 'top 55%', end: 'bottom 45%', onToggle: (st) => { mix.inWork = st.isActive; applyMix(); } });
ScrollTrigger.create({ trigger: '#contact', start: 'top 65%', onToggle: (st) => { mix.inContact = st.isActive; applyMix(); } });

/* ---------- work gallery (falls back to the plain list if anything throws) ---------- */
root.classList.add('is-3d');
try {
  createGallery($('#work'), { lenis, reduced, onActive: (i, m) => { mix.work = m; applyMix(); } });
} catch (err) {
  console.warn('Gallery fell back to the list:', err);
  root.classList.remove('is-3d');
}

/* ---------- reveals: content is visible by default; motion only adds the entrance ---------- */
if (!reduced) {
  gsap.from(['.top', '.hero__copy > *', '.hero__scroll'], {
    opacity: 0, y: 18, duration: 1.4, stagger: 0.09, ease: 'expo.out', delay: 0.25, clearProps: 'all',
  });

  $$('.studio__lede, .contact__big').forEach((el) => {
    SplitText.create(el, {
      type: 'lines', mask: 'lines', autoSplit: true,
      onSplit: (self) => gsap.from(self.lines, {
        yPercent: 105, duration: 1.3, stagger: 0.09, ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 82%', once: true },
      }),
    });
  });
  gsap.from('.studio__note', {
    opacity: 0, y: 16, duration: 1.2, ease: 'expo.out',
    scrollTrigger: { trigger: '.studio__note', start: 'top 88%', once: true },
  });
}

document.fonts?.ready.then(() => ScrollTrigger.refresh());
