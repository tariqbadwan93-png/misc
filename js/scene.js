// The fixed backdrop: a soft teal/orange light field with a slow ribbon (monopo-style), and the glass asterisk.
// The light field is drawn at quarter resolution into a texture (it is all blur, so nothing is lost),
// then shown full-screen as an opaque quad, which is also what the glass refracts.
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

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0., a = .5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= .5; } return v; }

void main() {
  float asp = uRes.x / uRes.y;
  vec2 p = (vUv - .5) * vec2(asp, 1.);
  vec2 m = uPointer * vec2(asp, 1.) * .5;
  float t = uTime;

  // teal pool behind the mark, leaning toward the pointer
  vec2 tc = vec2(0., .05) + m * .1;
  float teal = exp(-dot(p - tc, p - tc) * 2.2);

  // orange "street light" under the mark; rises and widens as the hero scrolls away
  vec2 od = (p - vec2(m.x * .06, -.2 + uHero * .2)) * vec2(1.15 - uHero * .35, 2.6);
  float orange = exp(-dot(od, od) * 3.4);

  // one slow ribbon across the screen, bending toward the pointer: a wide teal halo around a thin orange core.
  // Teal and orange are complementary: stacked at low light they cancel to grey, so each one
  // gives way where the other is (orange wins), and they meet side by side like monopo's bands.
  float w = fbm(vec2(p.x * 1.1 + t * .025, t * .018 + uPage * 1.5)) - .5;
  float curve = .3 * sin(p.x * 1.5 + t * .06 + uPage * 2.6) + w * .55 - .08
              + m.y * .22 * exp(-pow(p.x - m.x, 2.) * 2.5);
  float width = .12 + .05 * sin(t * .05 + p.x * 1.3);
  float halo = exp(-pow((p.y - curve) / (width * 1.9), 2.));
  float core = exp(-pow((p.y - curve - .02) / (width * .55), 2.));
  float along = .45 + .55 * smoothstep(-.9, .9, sin(p.x * 1.2 - t * .04 + uPage * 4.) + (uMix - .5) * 1.4);

  vec3 col = PEARL;
  float o1 = orange * (.42 + .3 * uMix) * (1. - uHero * .45);
  float o2 = core * along * (.07 + .2 * uHero) * (.45 + uMix);
  float warmth = clamp((o1 + o2) * 4., 0., 1.);
  col += TEAL * teal * .2 * (1. - .45 * uMix) * (1. - warmth);
  col += TEAL * halo * (.08 + .1 * uHero) * (1.25 - .7 * uMix) * (1. - warmth);
  col += ORANGE * (o1 + o2);
  col *= 1. - .5 * dot(p * vec2(.6, 1.), p * vec2(.6, 1.));
  col += (hash(gl_FragCoord.xy + fract(t) * 91.) - .5) / 255.;
  gl_FragColor = vec4(max(col, 0.), 1.);
}`;

const SCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, .9999, 1.); }`;

// Shows the field texture; stored as sRGB, decoded to linear so three can tone-map and encode it
// (and so the glass, which samples it in its transmission pass, refracts the right colours).
const SHOW_FRAG = /* glsl */ `
uniform sampler2D uTex;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(pow(texture2D(uTex, vUv).rgb, vec3(2.2)), 1.);
  #include <colorspace_fragment>
}`;

export async function createScene(canvas, { reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const coarse = matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.25 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  if ('transmissionResolutionScale' in renderer) renderer.transmissionResolutionScale = 0.5;

  // ---- light field, rendered small ----
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

  // ---- main scene: the field as an opaque backdrop + the glass mark ----
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0, 7.5);

  const backdrop = new THREE.Mesh(quad, new THREE.ShaderMaterial({
    vertexShader: SCREEN_VERT, fragmentShader: SHOW_FRAG, depthTest: false, depthWrite: false,
    uniforms: { uTex: { value: fieldRT.texture } },
  }));
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
  const spinner = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(bar, glass);
    m.rotation.z = (i * Math.PI) / 4;
    spinner.add(m);
  }
  const mark = new THREE.Group();
  mark.add(spinner);
  scene.add(mark);

  const warm = new THREE.PointLight('#ff6d04', 24, 12, 2);
  warm.position.set(0.2, -2.4, 2.2);
  const cool = new THREE.DirectionalLight('#64dbe8', 1.6);
  cool.position.set(-3, 3.5, 2);
  scene.add(warm, cool);

  // ---- state ----
  const state = { hero: 0, mix: 0.42, mixTarget: 0.42, page: 0, vel: 0, px: 0, py: 0, tx: 0, ty: 0, spin: 0, time: 0 };
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
    s.px += (s.tx - s.px) * k;
    s.py += (s.ty - s.py) * k;
    s.mix += (s.mixTarget - s.mix) * (1 - Math.exp(-dt * 1.8));
    s.vel *= Math.exp(-dt * 3);
    if (!reduced) {
      s.time += dt;
      s.spin += dt * (0.38 + Math.min(2.5, Math.abs(s.vel) * 0.04));
    }
    const u = fieldMat.uniforms;
    u.uTime.value = s.time;
    u.uHero.value = s.hero;
    u.uMix.value = s.mix;
    u.uPage.value = s.page;
    u.uPointer.value.set(s.px, s.py);

    const hero = s.hero;
    mark.visible = hero < 0.995;
    spinner.rotation.set(0.32, s.spin, 0.18);
    mark.rotation.set(s.py * 0.32, s.px * 0.45, 0);
    mark.position.set(s.px * 0.12, hero * 2.7 - s.py * 0.08, -hero * 1.5);
    mark.scale.setScalar(baseScale * (1 - hero * 0.25));
  }

  function render() {
    renderer.setRenderTarget(fieldRT);
    renderer.render(fieldScene, flatCam);
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }

  // ---- loop: ~60fps while the mark is on screen, ~30fps for the field alone (at any refresh rate), nothing when reduced ----
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
