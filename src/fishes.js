import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const rand = (a, b) => a + Math.random() * (b - a);
const PI = Math.PI;

/**
 * Every model is normalised to the same convention the swim code expects:
 * nose toward +x, back toward +y, body length 1 (manta: wingspan 1).
 * `rot` is the one-off fix for how each model was authored; `anim` models keep their own animation clip,
 * the rest get a procedural tail wag.
 */
const SPECIES = {
  snapper:   { file: 'fish',           rot: [0, 0, 0] },
  bettaWhite:{ file: 'fish_1',         rot: [0, PI, 0] },
  discus:    { file: 'fish_2',         rot: [0, PI / 2, 0] },
  goldfish:  { file: 'fish_3',         rot: [PI / 2, PI, 0] },
  tang:      { file: 'fish_4',         rot: [0, PI / 2, 0] },
  guppy:     { file: 'guppy_fish',     rot: [0, -PI / 2, 0], anim: true },
  koi:       { file: 'koi_fish',       rot: [0, PI, 0], anim: true },
  kois:      { file: 'koi_fish_1',     split: true },
  manta:     { file: 'manta',          rot: [0, PI / 2, 0], anim: true, span: true },
  bettaRed:  { file: 'red_betta_fish', rot: [0, PI / 2, 0] },
  shiny:     { file: 'shiny_fish',     rot: [0, PI / 2, 0] },
  butterfly: { file: 'small_fish',     rot: [0, 0, 0] },
};

/* ---- material tweaks: readable in a deep-blue scene, wag in the vertex shader ---- */
function tuneMaterial(m, uTime, wag) {
  m.side = THREE.DoubleSide;
  m.envMapIntensity = 0.85;
  if ('metalness' in m) { m.metalness = Math.min(m.metalness, 0.2); m.roughness = Math.max(m.roughness, 0.45); }
  if (m.emissive) {
    if (m.emissiveMap) m.emissiveIntensity = Math.max(m.emissiveIntensity, 0.7);
    else if (m.map) { m.emissiveMap = m.map; m.emissive.setScalar(0.4); }
    else m.emissive.copy(m.color).multiplyScalar(0.28);
  }
  if (wag) {
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float tailW = smoothstep(0.12, -0.5, position.x);
          float ph = uTime * 8.0 + modelMatrix[3].x * 1.3 + modelMatrix[3].y * 2.1;
          transformed.z += sin(ph - position.x * 7.0) * 0.11 * tailW;
          transformed.x += sin(ph * 0.5 - position.x * 3.0) * 0.012 * tailW;`);
    };
    m.customProgramCacheKey = () => 'fishwag';
  }
  m.needsUpdate = true;
}

/** Bake a world-space geometry into the normalised space (nose +x, length 1). */
function bake(geo, M) {
  const g = geo.clone();
  g.applyMatrix4(M);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

function normaliseMatrix(root, rotEuler, span) {
  const inner = new THREE.Group();
  inner.add(root);
  inner.quaternion.setFromEuler(rotEuler);
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner, true);
  const size = box.getSize(new THREE.Vector3());
  const ctr = box.getCenter(new THREE.Vector3());
  const s = 1 / (span ? Math.max(size.x, size.z) : size.x);
  return { inner, s, ctr, M: new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(-ctr.x, -ctr.y, -ctr.z)) };
}

/** koi_fish_1.glb was pre-split offline into one normalised mesh per koi (nose +x, length 1). */
function splitKoi(gltf, uTime) {
  const out = [];
  gltf.scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    tuneMaterial(mesh.material, uTime, true);
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(mesh.geometry, mesh.material));
    out.push({ proto: grp });
  });
  return out;
}

async function loadSpecies(loader, base, key, uTime) {
  const sp = SPECIES[key];
  const gltf = await loader.loadAsync(`${base}assets/fish/${sp.file}.glb`);
  if (sp.split) return { protos: splitKoi(gltf, uTime) };
  const rot = new THREE.Euler(sp.rot[0], sp.rot[1], sp.rot[2], 'YXZ');
  gltf.scene.updateMatrixWorld(true);
  const { inner, s, ctr, M } = normaliseMatrix(gltf.scene, rot, sp.span);
  const mats = new Set();
  gltf.scene.traverse((o) => { if (o.isMesh) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m)); } });
  mats.forEach((m) => tuneMaterial(m, uTime, !sp.anim));
  if (sp.anim) {
    inner.scale.setScalar(s); inner.position.copy(ctr).multiplyScalar(-s);
    const proto = new THREE.Group(); proto.add(inner);
    proto.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    return { proto, clips: gltf.animations, animated: true };
  }
  const proto = new THREE.Group();
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = new THREE.Mesh(bake(o.geometry, new THREE.Matrix4().multiplyMatrices(M, o.matrixWorld)), o.material);
    proto.add(m);
  });
  return { proto };
}

/**
 * Loads every species, then builds the swimmers. Records are shaped for the path code in scene.js:
 * fish -> { s, own?, off, dy, dz, size, big, o, hx, hy, obj }, rays -> own path object.
 */
export async function loadFishes({ base, narrow, reduced, uTime }) {
  const loader = new GLTFLoader();
  const keys = Object.keys(SPECIES);
  const loaded = {};
  await Promise.all(keys.map(async (k) => { try { loaded[k] = await loadSpecies(loader, base, k, uTime); } catch (e) { console.warn('fish model failed', k, e); } }));

  const k = reduced ? 0.35 : narrow ? 0.55 : 1;
  const n = (v) => Math.max(1, Math.round(v * k));
  const group = new THREE.Group();
  const mixers = [];
  const make = (key, protoIndex = -1) => {
    const L = loaded[key]; if (!L) return null;
    const src = L.protos ? L.protos[protoIndex % L.protos.length].proto : L.proto;
    const obj = L.animated ? cloneSkinned(src) : src.clone();
    obj.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    if (L.animated && L.clips?.length) {
      const mx = new THREE.AnimationMixer(obj);
      const a = mx.clipAction(L.clips[0]); a.play(); a.time = rand(0, a.getClip().duration);
      a.setEffectiveTimeScale(rand(0.85, 1.2));
      mixers.push(mx);
    }
    group.add(obj);
    return obj;
  };
  const newPath = (o = {}) => ({ dir: Math.random() < 0.5 ? -1 : 1, speed: rand(0.018, 0.04), lane: rand(-0.85, 0.85), z: rand(-5.5, 3.2), amp: rand(0.25, 0.7), freq: rand(3, 6), u: Math.random(), ...o });
  const mk = (obj, extra) => ({ obj, off: 0, dy: 0, dz: 0, ox: 0, oy: 0, big: false, o: { x: 0, y: 0, pvx: 0, pvy: 0 }, hx: 1, hy: 0, ...extra });

  const groups = [];
  // schools: one species per school, they travel together
  [
    ['butterfly', 8, [0.26, 0.38]], ['guppy', 7, [0.3, 0.42]], ['tang', 5, [0.3, 0.44]],
    ['snapper', 5, [0.4, 0.55]], ['discus', 5, [0.3, 0.42]],
  ].forEach(([key, cnt, sz]) => {
    if (!loaded[key]) return;
    const s = newPath();
    const arr = [];
    for (let i = 0; i < n(cnt); i++) {
      const obj = make(key); if (!obj) continue;
      arr.push(mk(obj, { sp: key, s, off: (Math.random() - 0.5) * 0.06 + i * 0.012, dy: rand(-0.55, 0.55), dz: rand(-0.6, 0.6), size: rand(sz[0], sz[1]) }));
    }
    groups.push(arr);
  });
  // the koi pod (one path, each koi its own model)
  if (loaded.kois?.protos?.length) {
    const s = newPath({ speed: rand(0.014, 0.022), z: rand(-4.5, -2.5) });
    const arr = [];
    loaded.kois.protos.slice(0, n(8)).forEach((_, i) => {
      const obj = make('kois', i); if (!obj) return;
      arr.push(mk(obj, { sp: 'kois', s, off: i * 0.03 + rand(-0.01, 0.01), dy: rand(-0.7, 0.7), dz: rand(-0.8, 0.8), size: rand(0.42, 0.62) }));
    });
    groups.push(arr);
  }
  // big solo swimmers
  [['koi', 2, [0.7, 0.95]], ['shiny', 2, [0.6, 0.85]], ['bettaRed', 2, [0.5, 0.72]], ['bettaWhite', 2, [0.55, 0.8]], ['goldfish', 2, [0.6, 0.85]]].forEach(([key, cnt, sz]) => {
    if (!loaded[key]) return;
    const arr = [];
    for (let i = 0; i < n(cnt); i++) {
      const obj = make(key); if (!obj) continue;
      const own = newPath({ speed: rand(0.006, 0.011), z: rand(-7, -4), lane: rand(-0.7, 0.7) });
      arr.push(mk(obj, { sp: key, s: own, own, size: rand(sz[0], sz[1]), big: true }));
    }
    groups.push(arr);
  });
  // interleave groups so cutting the count (state.fish) thins every species evenly
  const fish = [];
  for (let i = 0; groups.some((g) => g[i]); i++) groups.forEach((g) => g[i] && fish.push(g[i]));

  const rays = [];
  if (loaded.manta) {
    for (let i = 0; i < (reduced ? 1 : narrow ? 2 : 3); i++) {
      const obj = make('manta'); if (!obj) continue;
      rays.push({
        sp: 'manta', obj, dir: i % 2 ? 1 : -1, speed: rand(0.006, 0.012), lane: rand(-0.7, 0.7), z: rand(-7.5, -4.2),
        amp: rand(0.3, 0.7), freq: rand(1.5, 3), u: Math.random(), size: rand(2.0, 3.0),
        o: { x: 0, y: 0, pvx: 0, pvy: 0 }, hx: 1, hy: 0,
      });
    }
  }
  return { group, fish, rays, tick: (dt) => mixers.forEach((m) => m.update(dt)) };
}
