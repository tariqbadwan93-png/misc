// The fixed backdrop: a slow liquid ribbon of teal and orange light with film grain (monopo-style),
// and the glass asterisk, which floats, turns on its own and can be grabbed and spun like a 3D model.
// The liquid is drawn at quarter resolution into a texture (it is all soft, so nothing is lost),
// then shown full-screen with grain added at full resolution. The glass refracts that backdrop.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const FIELD = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform float uTime, uHero, uMix, uPage;
uniform vec2 uPointer;
varying vec2 vUv;

const vec3 PEARL  = vec3(0.016, 0.078, 0.118);
const vec3 TEAL   = vec3(0.392, 0.859, 0.910);
const vec3 ORANGE = vec3(1.000, 0.427, 0.016);
const vec3 HOT    = vec3(1.000, 0.820, 0.640);

float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0., a = .5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= .5; } return v; }

void main() {
  float asp = uRes.x / uRes.y;
  vec2 p0 = (vUv - .5) * vec2(asp, 1.);
  vec2 m = uPointer * vec2(asp, 1.) * .5;
  float t = uTime;

  // the pointer pushes the liquid aside, like a finger through paint
  vec2 dm = p0 - m;
  vec2 p = p0 + dm * .24 * exp(-dot(dm, dm) * 3.5);

  // two layers of flowing noise bend the space the ribbon lives in: that is what makes it read as liquid
  vec2 q = vec2(fbm(p * 1.15 + vec2(0., t * .11)), fbm(p * 1.15 + vec2(5.2, -t * .09)));
  vec2 r = vec2(fbm(p * 1.35 + 2.3 * q + vec2(1.7, 9.2) + t * .07), fbm(p * 1.35 + 2.3 * q + vec2(8.3, 2.8) - t * .06));

  // one thick ribbon on a slow S-curve, warped; a thin echo runs beside it
  float curve = .25 * sin(p.x * 1.3 + t * .05 + uPage * 2.6) - .05;
  float d = p.y - curve + (r.y - .5) * .75 + (q.x - .5) * .28;
  float w = .16 + .07 * (r.x - .5);
  float core = exp(-pow(d / (w * .55), 2.));
  float halo = exp(-pow(d / (w * 1.8), 2.));
  float hot  = exp(-pow(d / (w * .13), 2.));
  float d2 = d + .27 + (q.y - .5) * .4;
  float echo = exp(-pow(d2 / (w * .32), 2.));

  // colour runs along the ribbon. Teal and orange are complementary and turn grey when blended,
  // so each is weighted by a squared ramp: they meet through a darker seam, never a grey one.
  float warm = smoothstep(-.55, .55, (r.x - .5) * 2.6 + p.x * .3 + (uMix - .5) * 1.7);
  // hero only: the orange street-light pool under the mark from Direction 02; teal gives way inside it
  vec2 od = (p0 - vec2(m.x * .04, -.2)) * vec2(1.1, 2.6);
  float pool = exp(-dot(od, od) * 3.4) * .3 * (1. - uHero);
  float cool = 1. - smoothstep(0., .16, pool);

  vec3 col = PEARL;
  col += TEAL * exp(-dot(p0 - vec2(0., .08), p0 - vec2(0., .08)) * 2.2) * .1 * cool;
  col += ORANGE * core * warm * warm * .72;
  col += TEAL * core * (1. - warm) * (1. - warm) * .5 * cool;
  col += TEAL * halo * (1. - core) * .14 * (1.2 - .6 * uMix) * cool;
  col += HOT * hot * warm * .38;
  col += TEAL * echo * (1. - warm * .7) * .2 * cool;
  col += ORANGE * pool;

  col *= 1. - .45 * dot(p0 * vec2(.6, 1.), p0 * vec2(.6, 1.));
  gl_FragColor = vec4(max(col, 0.), 1.);
}`;

const SCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, .9999, 1.); }`;

// Shows the liquid with film grain at full resolution (24 fps, stronger in the light, like film).
// The field is stored as sRGB; it is decoded to linear so three can encode it for the screen,
// and so the glass, which samples this in its transmission pass, refracts the right colours.
const SHOW_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform float uTime, uGrain, uPx;
varying vec2 vUv;
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec3 c = texture2D(uTex, vUv).rgb;
  float l = dot(c, vec3(.299, .587, .114));
  float n = hash(floor(gl_FragCoord.xy / uPx) + floor(uTime * 24.) * vec2(37.13, 91.71)) - .5;
  c += n * uGrain * (.6 + 1.8 * l);
  gl_FragColor = vec4(pow(max(c, 0.), vec3(2.2)), 1.);
  #include <colorspace_fragment>
}`;

export async function createScene(canvas, { reduced = false, grabArea = null } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const coarse = matchMedia('(pointer: coarse)').matches;
  const dpr = Math.min(devicePixelRatio || 1, coarse ? 1.25 : 1.5);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  if ('transmissionResolutionScale' in renderer) renderer.transmissionResolutionScale = 0.5;

  // ---- liquid field, rendered small ----
  const fieldRT = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false });
  const quad = new THREE.PlaneGeometry(2, 2);
  const fieldMat = new THREE.ShaderMaterial({
    vertexShader: SCREEN_VERT, fragmentShader: FIELD, depthTest: false, depthWrite: false,
    uniforms: {
      uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uHero: { value: 0 },
      uMix: { value: 0.42 }, uPage: { value: 0 }, uPointer: { value: new THREE.Vector2() },
    },
  });
  const fieldScene = new THREE.Scene();
  const fieldQuad = new THREE.Mesh(quad, fieldMat);
  fieldQuad.frustumCulled = false;
  fieldScene.add(fieldQuad);
  const flatCam = new THREE.Camera();

  // ---- main scene: the grainy backdrop + the glass mark ----
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0, 7.5);

  const showMat = new THREE.ShaderMaterial({
    vertexShader: SCREEN_VERT, fragmentShader: SHOW_FRAG, depthTest: false, depthWrite: false,
    uniforms: { uTex: { value: fieldRT.texture }, uTime: { value: 0 }, uGrain: { value: 0.085 }, uPx: { value: dpr } },
  });
  const backdrop = new THREE.Mesh(quad, showMat);
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -1;
  scene.add(backdrop);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.07, transmission: 1, thickness: 0.55, ior: 1.5,
    clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.5, specularIntensity: 1,
    attenuationColor: new THREE.Color('#9fe6ee'), attenuationDistance: 3, dispersion: 0.35,
  });
  const bar = new THREE.CapsuleGeometry(0.165, 2.0, 12, 40);
  const model = new THREE.Group(); // the asterisk itself; its orientation is the spin
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(bar, glass);
    m.rotation.z = (i * Math.PI) / 4;
    model.add(m);
  }
  const mark = new THREE.Group(); // position, float, scroll and the lean toward the pointer
  mark.add(model);
  scene.add(mark);

  const warm = new THREE.PointLight('#ff6d04', 24, 12, 2);
  warm.position.set(0.2, -2.4, 2.2);
  const cool = new THREE.DirectionalLight('#64dbe8', 1.6);
  cool.position.set(-3, 3.5, 2);
  scene.add(warm, cool);

  // ---- state ----
  const state = {
    hero: 0, mix: 0.42, mixTarget: 0.42, page: 0, vel: 0, px: 0, py: 0, tx: 0, ty: 0, time: 0, flow: 0,
    // spin: orientation quaternion, angular velocity (rad/s) about screen axes, pending drag rotation
    q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.32, 0, 0.18)),
    wx: 0, wy: 0, dYaw: 0, dPitch: 0, dragging: false,
  };
  const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), qa = new THREE.Quaternion();
  let baseScale = 1, w = 0, h = 0;

  function resize() {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (cw === w && ch === h) return; // the canvas is 100lvh, so mobile URL-bar moves don't change it
    w = cw; h = ch;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fieldRT.setSize(Math.max(2, Math.round(w / 4)), Math.max(2, Math.round(h / 4)));
    fieldMat.uniforms.uRes.value.set(w, h);
    // keep the mark about half the screen tall, and inside the width on narrow phones
    const visH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    baseScale = Math.min(0.86, (0.8 * visH * camera.aspect) / 2.33);
    if (reduced) requestRender();
  }

  function update(dt) {
    const s = state;
    const k = 1 - Math.exp(-dt * 3.2);
    // while the mark is held it stops leaning toward the pointer, so the drag reads cleanly
    s.px += ((s.dragging ? 0 : s.tx) - s.px) * k;
    s.py += ((s.dragging ? 0 : s.ty) - s.py) * k;
    s.mix += (s.mixTarget - s.mix) * (1 - Math.exp(-dt * 1.8));
    s.vel *= Math.exp(-dt * 3);
    const stir = Math.min(3, Math.abs(s.vel) * 0.05); // scrolling stirs the liquid and spins the mark faster
    if (!reduced) { s.time += dt; s.flow += dt * (1 + stir); }

    // spin: direct while dragged, then momentum that eases back into the idle turn
    let yaw, pitch;
    if (s.dragging) {
      yaw = s.dYaw; pitch = s.dPitch; s.dYaw = s.dPitch = 0;
      const kw = 1 - Math.exp(-dt * 18);
      s.wy += (yaw / dt - s.wy) * kw;
      s.wx += (pitch / dt - s.wx) * kw;
    } else {
      const decay = Math.exp(-dt * 1.3);
      s.wy *= decay; s.wx *= decay;
      yaw = (s.wy + (reduced ? 0 : 0.38 + stir * 0.8)) * dt;
      pitch = s.wx * dt;
    }
    s.q.premultiply(qa.setFromAxisAngle(AY, yaw)).premultiply(qa.setFromAxisAngle(AX, pitch)).normalize();
    model.quaternion.copy(s.q);

    const u = fieldMat.uniforms;
    u.uTime.value = s.flow;
    u.uHero.value = s.hero;
    u.uMix.value = s.mix;
    u.uPage.value = s.page;
    u.uPointer.value.set(s.px, s.py);
    showMat.uniforms.uTime.value = s.time;

    const hero = s.hero;
    const bob = reduced ? 0 : Math.sin(s.time * 0.9) * 0.07; // floating
    mark.visible = hero < 0.995;
    mark.rotation.set(s.py * 0.3, s.px * 0.4, reduced ? 0 : Math.sin(s.time * 0.55) * 0.05);
    mark.position.set(s.px * 0.12, hero * 2.7 - s.py * 0.08 + bob, -hero * 1.5);
    mark.scale.setScalar(baseScale * (1 - hero * 0.25));
  }

  function render() {
    renderer.setRenderTarget(fieldRT);
    renderer.render(fieldScene, flatCam);
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }

  // ---- loop: ~60fps while the mark is on screen, ~30fps for the liquid alone (at any refresh rate), nothing when reduced ----
  let raf = 0, last = 0, next = 0, dirty = false;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now < next - 2) return; // 2ms slack so a 60Hz display never skips a frame
    next = Math.max(next + (mark.visible ? 1000 / 60 : 1000 / 30), now); // keeps the grid, resyncs after a stall
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    update(dt);
    render();
  }
  function requestRender() {
    if (dirty) return;
    dirty = true;
    requestAnimationFrame(() => { dirty = false; update(1 / 60); render(); });
  }

  addEventListener('pointermove', (e) => {
    state.tx = (e.clientX / innerWidth) * 2 - 1;
    state.ty = -((e.clientY / innerHeight) * 2 - 1);
    if (reduced) requestRender();
  }, { passive: true });

  // ---- grab and spin: a generous circle around the mark is the handle ----
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  function overMark(x, y) {
    if (!mark.visible) return false;
    mark.getWorldPosition(v1);
    v2.copy(v1).addScaledVector(AX, 1.17 * mark.scale.x); // the arm's reach in world units
    v1.project(camera); v2.project(camera);
    const cx = (v1.x * 0.5 + 0.5) * w, cy = (-v1.y * 0.5 + 0.5) * h;
    const r = Math.abs((v2.x * 0.5 + 0.5) * w - cx);
    return Math.hypot(x - cx, y - cy) < r * 0.95;
  }
  if (grabArea) {
    let drag = null;
    grabArea.addEventListener('pointermove', (e) => {
      if (!drag && e.pointerType === 'mouse') grabArea.classList.toggle('is-grab', overMark(e.clientX, e.clientY));
    }, { passive: true });
    grabArea.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !overMark(e.clientX, e.clientY)) return;
      e.preventDefault(); // no text selection or native drag while spinning
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' };
      state.dragging = true;
      grabArea.setPointerCapture(e.pointerId);
      grabArea.classList.add('is-grabbing');
    });
    grabArea.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const kRad = 0.009; // radians per pixel
      state.dYaw += (e.clientX - drag.x) * kRad;
      // on touch only sideways spins; vertical swipes stay a page scroll (touch-action: pan-y)
      if (!drag.touch) state.dPitch += (e.clientY - drag.y) * kRad;
      drag.x = e.clientX; drag.y = e.clientY;
      if (reduced) requestRender();
    }, { passive: true });
    const release = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      state.dragging = false;
      // a fling keeps spinning and slows into the idle turn; capped so it never blurs
      const max = 14, sp = Math.hypot(state.wx, state.wy);
      if (reduced) state.wx = state.wy = 0;
      else if (sp > max) { state.wx *= max / sp; state.wy *= max / sp; }
      grabArea.classList.remove('is-grabbing');
    };
    grabArea.addEventListener('pointerup', release);
    grabArea.addEventListener('pointercancel', release);
  }

  let rt = 0;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 120); }, { passive: true });
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    document.documentElement.classList.add('no-webgl');
  });

  resize();
  update(1 / 60);
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  render();
  if (!reduced) raf = requestAnimationFrame(frame);

  const poke = () => reduced && requestRender();
  return {
    setHero(v) { state.hero = Math.min(1, Math.max(0, v)); poke(); },
    setMix(v) { state.mixTarget = v; if (reduced) { state.mix = v; poke(); } },
    setPage(v) { state.page = v; poke(); },
    setVelocity(v) { state.vel = v; },
  };
}
