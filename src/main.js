import './styles.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { initScene, state } from './scene.js';
import { createAudio } from './audio.js';
import { createPageRoadmap, createTimelineRoad } from './roadmap.js';

gsap.registerPlugin(ScrollTrigger);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const TAU = Math.PI * 2;
const audio = createAudio();

const soundBtn = $('#soundToggle');
const soundText = $('#soundText');

/* ----------------------------------------------------------------------------
 * Scroll choreography: one state per section, for wide and for narrow screens.
 * x / y are screen fractions (-1..1), sizes are fractions of the viewport.
 * faceRot is in radians: one full turn between every section.
 * -------------------------------------------------------------------------- */
const rot = (n) => (reduced ? 0 : n * TAU);

const WIDE = [
  { faceX: 0.68, faceY: -0.4, faceH: 0.46, faceRot: rot(0), cardX: 0.52, cardY: 0.2, cardW: 0.35, cardRX: 0.1, cardRY: -0.32, cardRZ: 0.08, blobX: 0.56, blobY: 0.02, blobS: 1.15 },
  { faceX: -0.52, faceY: -0.2, faceH: 0.52, faceRot: rot(1), cardX: -0.45, cardY: 0.64, cardW: 0.22, cardRX: 0.18, cardRY: Math.PI + 0.35, cardRZ: -0.08, blobX: -0.3, blobY: -0.1, blobS: 0.9 },
  { faceX: 0.55, faceY: -0.16, faceH: 0.54, faceRot: rot(2), cardX: 0.52, cardY: 0.52, cardW: 0.22, cardRX: 0.1, cardRY: -0.5, cardRZ: 0.08, blobX: 0.5, blobY: 0.2, blobS: 1.0 },
  { faceX: 0.84, faceY: -0.72, faceH: 0.38, faceRot: rot(3), cardX: 0.78, cardY: 0.52, cardW: 0.16, cardRX: 0.2, cardRY: 0.5, cardRZ: -0.1, blobX: 0.05, blobY: -0.2, blobS: 0.85 },
  { faceX: -0.78, faceY: -0.64, faceH: 0.34, faceRot: rot(4), cardX: 0.84, cardY: 0.6, cardW: 0.15, cardRX: 0.2, cardRY: -0.5, cardRZ: 0.1, blobX: -0.3, blobY: -0.3, blobS: 0.7 },
  { faceX: -0.64, faceY: -0.52, faceH: 0.5, faceRot: rot(5), cardX: 0.62, cardY: 0.58, cardW: 0.2, cardRX: 0.1, cardRY: -0.4, cardRZ: 0.1, blobX: 0.5, blobY: 0.2, blobS: 0.9 },
  { faceX: 0, faceY: 0.36, faceH: 0.46, faceRot: rot(6), cardX: 0.4, cardY: 0.34, cardW: 0.24, cardRX: 0.08, cardRY: -0.35, cardRZ: 0.1, blobX: -0.05, blobY: 0.3, blobS: 1.3 },
];

const NARROW = [
  { faceX: 0.38, faceY: -0.66, faceH: 0.3, faceRot: rot(0), cardX: -0.12, cardY: -0.46, cardW: 0.62, cardRX: 0.1, cardRY: -0.3, cardRZ: 0.08, blobX: 0, blobY: -0.45, blobS: 0.8 },
  { faceX: -0.3, faceY: 0.42, faceH: 0.32, faceRot: rot(1), cardX: 0.38, cardY: 0.5, cardW: 0.42, cardRX: 0.15, cardRY: Math.PI + 0.3, cardRZ: -0.08, blobX: 0, blobY: 0.4, blobS: 0.7 },
  { faceX: 0.3, faceY: 0.45, faceH: 0.32, faceRot: rot(2), cardX: -0.32, cardY: 0.52, cardW: 0.42, cardRX: 0.1, cardRY: -0.4, cardRZ: 0.08, blobX: 0, blobY: 0.4, blobS: 0.7 },
  { faceX: 0.7, faceY: 0.78, faceH: 0.2, faceRot: rot(3), cardX: -0.7, cardY: 0.8, cardW: 0.26, cardRX: 0.2, cardRY: 0.5, cardRZ: -0.1, blobX: 0, blobY: 0.3, blobS: 0.6 },
  { faceX: -0.72, faceY: 0.8, faceH: 0.18, faceRot: rot(4), cardX: 0.72, cardY: 0.8, cardW: 0.24, cardRX: 0.2, cardRY: 0.5, cardRZ: -0.1, blobX: 0, blobY: 0.3, blobS: 0.6 },
  { faceX: -0.3, faceY: 0.45, faceH: 0.3, faceRot: rot(5), cardX: 0.36, cardY: 0.5, cardW: 0.4, cardRX: 0.1, cardRY: -0.4, cardRZ: 0.1, blobX: 0, blobY: 0.4, blobS: 0.7 },
  { faceX: 0, faceY: 0.4, faceH: 0.38, faceRot: rot(6), cardX: 0.45, cardY: 0.5, cardW: 0.34, cardRX: 0.06, cardRY: -0.3, cardRZ: 0.1, blobX: -0.1, blobY: 0.4, blobS: 0.9 },
];

function buildScroll() {
  const sections = $$('[data-sec]');
  const mm = gsap.matchMedia();
  const make = (states) => {
    Object.assign(state, states[0], { faceRot: reduced ? 0 : -TAU }); // intro spin lands on 0
    sections.forEach((sec, i) => {
      if (i === 0) return;
      gsap.fromTo(
        state,
        { ...states[i - 1] },
        {
          ...states[i],
          ease: 'power2.inOut',
          immediateRender: false,
          scrollTrigger: { trigger: sec, start: 'top 92%', end: 'top 12%', scrub: reduced ? true : 1.2 },
        }
      );
    });
  };
  mm.add('(min-aspect-ratio: 9/10)', () => make(WIDE));
  mm.add('(max-aspect-ratio: 9/10)', () => make(NARROW));
}

/* ---------------------------------------------------------------------------- */
function setupReveals() {
  $$('[data-reveal]').forEach((el) => {
    if (el.closest('#hero')) return; // hero is revealed on enter
    gsap.to(el, {
      opacity: 1, y: 0, duration: 1.1, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none none' },
    });
  });
}

function revealHero() {
  const items = $$('#hero [data-reveal]');
  gsap.to(items, { opacity: 1, y: 0, duration: 1.2, ease: 'power3.out', stagger: 0.12, delay: 0.25 });
  $$('[data-count]', $('#hero')).forEach((el) => {
    const end = +el.dataset.count;
    const o = { v: 0 };
    gsap.to(o, { v: end, duration: 2, delay: 0.8, ease: 'power2.out', onUpdate: () => { el.textContent = Math.round(o.v) + (el.dataset.suffix || ''); } });
  });
}

function setupTilt() {
  if (reduced) return;
  $$('.card3d').forEach((el) => {
    const rx = gsap.quickTo(el, 'rotationX', { duration: 0.5, ease: 'power3.out' });
    const ry = gsap.quickTo(el, 'rotationY', { duration: 0.5, ease: 'power3.out' });
    gsap.set(el, { transformPerspective: 900 });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      ry((x - 0.5) * 12);
      rx(-(y - 0.5) * 12);
      el.style.setProperty('--mx', x * 100 + '%');
      el.style.setProperty('--my', y * 100 + '%');
    });
    el.addEventListener('pointerleave', () => { rx(0); ry(0); });
  });
}

function setupHoverSounds() {
  $$('a, button, .card3d, .marquee__row span').forEach((el) => {
    el.addEventListener('pointerenter', () => audio.hover());
  });
}

function setupFilters() {
  const chips = $$('.filters .chip');
  const cards = $$('.proj');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const f = chip.dataset.filter;
      chips.forEach((c) => { const on = c === chip; c.classList.toggle('is-on', on); c.setAttribute('aria-pressed', String(on)); });
      audio.bubble(1);
      cards.forEach((c) => {
        const show = f === 'all' || c.dataset.cat === f;
        c.hidden = !show;
        if (show) gsap.fromTo(c, { opacity: 0, y: 24, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'power3.out', clearProps: 'scale' });
      });
      ScrollTrigger.refresh();
    });
  });
}

const muted0 = { v: false }; // true once the visitor has switched sound off themselves
function updateSoundUI() {
  const on = audio.isOn();
  soundBtn.setAttribute('aria-pressed', String(on));
  const waiting = !on && !muted0.v; // browser is still blocking sound until the first click / tap / key
  soundBtn.classList.toggle('is-waiting', waiting);
  soundText.textContent = on ? 'Sound on' : waiting ? 'Tap for sound' : 'Sound off';
}

/* ---------------------------------------------------------------------------- */
async function main() {
  document.documentElement.classList.add('js');

  // text first: never wait on the 3D scene to show content
  try { setupReveals(); revealHero(); window.__shown = true; } catch (e) { console.error(e); document.documentElement.classList.add('reveal-all'); }
  setTimeout(() => {
    const hidden = [...document.querySelectorAll('[data-reveal]')].some((el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight && getComputedStyle(el).opacity < 0.05; });
    if (hidden) document.documentElement.classList.add('reveal-all');
  }, 4500);

  let scene;
  try {
    scene = await initScene({
      canvas: $('#gl'),
      reduced,
    });
  } catch (err) {
    console.error('WebGL scene failed', err);
    document.body.classList.add('no-webgl');
  }

  // smooth scroll, driven by GSAP's ticker
  let lenis = null;
  if (!reduced) {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  let lastY = 0;
  gsap.ticker.add(() => {
    const y = window.scrollY;
    const v = (y - lastY) * 60;
    lastY = y;
    scene?.setScrollVelocity(v);
    audio.whoosh(v);
  });

  if (scene) buildScroll();
  setupTilt();
  setupFilters();
  setupHoverSounds();

  // nav + anchor links
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const target = $(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      audio.splash();
      if (lenis) lenis.scrollTo(target, { duration: 1.8, easing: (t) => 1 - Math.pow(1 - t, 4) });
      else target.scrollIntoView({ behavior: 'auto' });
    });
  });

  // chime when a new section arrives
  $$('[data-sec]').forEach((sec, i) => {
    if (i === 0) return;
    ScrollTrigger.create({ trigger: sec, start: 'top 55%', onEnter: () => audio.chime(), onEnterBack: () => audio.chime() });
  });

  // click the 3D card to flip it
  window.addEventListener('click', (e) => {
    if (!scene || e.target.closest('a, button, .panel, .card3d, .loader')) return;
    if (scene.hitCard(e.clientX, e.clientY)) { scene.flip(); audio.splash(); }
  });
  window.addEventListener('pointermove', (e) => {
    if (!scene || e.target.closest('a, button, .panel, .card3d')) { document.body.style.cursor = ''; return; }
    document.body.style.cursor = scene.hitCard(e.clientX, e.clientY) ? 'pointer' : '';
  }, { passive: true });

  try {
  // journey roadmap (right), status readout (bottom-left) and the experience trail
  const sections = $$('[data-sec]');
  const names = ['Home', 'About', 'Experience', 'Work', 'Projects', 'Skills', 'Contact'];
  const jump = (target) => {
    audio.splash();
    if (lenis) lenis.scrollTo(target, { duration: 1.8, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else target.scrollIntoView({ behavior: 'auto' });
  };
  const road = createPageRoadmap({ sections, labels: names, onJump: jump });
  const hud = { place: $('#hudPlace'), pct: $('#hudPct'), depth: $('#hudDepth'), temp: $('#hudTemp') };
  let lastPlace = -1;
  const onProgress = (p) => {
    state.depth = p;
    const cur = road.update(p);
    $('.hud').classList.toggle('is-on', p > 0.03); // readout appears once you start descending
    hud.pct.textContent = Math.round(p * 100) + '%';
    hud.depth.textContent = Math.round(p * 120) + ' m';
    hud.temp.textContent = Math.round(24 - p * 16) + '°C';
    if (cur !== lastPlace) { lastPlace = cur; hud.place.textContent = names[cur] ?? names[0]; }
  };
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (self) => onProgress(self.progress) });
  onProgress(0);

  const tlOl = $('.timeline');
  if (tlOl) {
    const tl = createTimelineRoad(tlOl);
    ScrollTrigger.create({
      trigger: tlOl, start: 'top 65%', end: 'bottom 55%', scrub: true,
      onUpdate: (self) => tl.set(self.progress),
    });
    ScrollTrigger.addEventListener('refreshInit', () => tl.layout());
  }
  window.addEventListener('load', () => ScrollTrigger.refresh());

  } catch (e) { console.error('roadmap failed', e); }

  // sound is ON by default. Browsers only allow audio after a gesture, so we try straight away and retry on the
  // first click / tap / key / scroll anywhere. After that, the button is a normal on/off toggle.
  const GESTURES = ['pointerdown', 'pointerup', 'click', 'keydown', 'touchstart', 'touchend', 'wheel'];
  let muted = false, enabledAt = 0;
  const tryAudio = async () => {
    if (muted || audio.isOn()) return;
    if (await audio.enable()) {
      enabledAt = performance.now();
      GESTURES.forEach((ev) => window.removeEventListener(ev, tryAudio, true));
      updateSoundUI();
    }
  };
  GESTURES.forEach((ev) => window.addEventListener(ev, tryAudio, { capture: true, passive: true }));
  tryAudio().then(updateSoundUI);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tryAudio(); });
  soundBtn.addEventListener('click', async () => {
    // the very first gesture may be this click: it switches sound on, it must not also switch it off again
    if (audio.isOn() && performance.now() - enabledAt > 500) { muted = true; muted0.v = true; audio.disable(); }
    else if (muted) { muted = false; muted0.v = false; await audio.enable(); enabledAt = 0; audio.bubble(); }
    else await tryAudio();
    updateSoundUI();
  });

  // go
  scene?.start();
  document.body.classList.add('is-ready');
  lenis?.start();
  if (scene) gsap.to(state, { intro: 1, faceRot: 0, duration: reduced ? 0.01 : 2.6, ease: 'power3.out' });

  window.__ready = true; // used by the test harness
  window.__scene = scene;
}

main();
