import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeVertices, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadFishes } from './fishes.js';
import { createFrontFace, createBackFace, glowTexture, bubbleTexture } from './cardTexture.js';

/**
 * Shared, scroll-driven state. GSAP tweens these numbers; the render loop reads them.
 * x / y are in "screen fractions" (-1..1 from centre), sizes are fractions of the viewport.
 */
export const state = {
  intro: 0, depth: 0,
  faceX: 0.3, faceY: -0.2, faceH: 0.6, faceRot: 0,
  cardX: 0.46, cardY: 0.14, cardW: 0.36, cardRX: 0.14, cardRY: -0.38, cardRZ: 0.1,
  blobX: 0.44, blobY: 0.06, blobS: 1.0,
  fish: 1,
};

const rand = (a, b) => a + Math.random() * (b - a);
const base = './';

/* ----------------------------------------------------------------------------
 * Environment: a purple / pink / aqua studio used for chrome + glass reflections
 * -------------------------------------------------------------------------- */
function buildEnvironment(renderer) {
  const env = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(50, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = vP.y * 0.5 + 0.5;
          vec3 lo  = vec3(0.01, 0.06, 0.28);
          vec3 mid = vec3(0.10, 0.42, 0.95);
          vec3 hi  = vec3(0.62, 0.92, 1.00);
          vec3 c = mix(lo, mid, smoothstep(0.0, 0.55, h));
          c = mix(c, hi, smoothstep(0.55, 1.0, h));
          float side = smoothstep(0.2, 1.0, vP.x * 0.5 + 0.5) * smoothstep(0.25, 0.65, h) * (1.0 - smoothstep(0.65, 0.9, h));
          c += vec3(0.30, 0.85, 1.0) * side * 0.55;
          gl_FragColor = vec4(c * 1.25, 1.0);
        }`,
    })
  );
  env.add(sky);
  const panel = (w, h, pos, k, color = 0xffffff) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide })
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(24, 8, [-14, 14, 14], 9);            // key softbox
  panel(10, 26, [22, 4, 8], 6, 0x9fe9ff);     // aqua strip
  panel(18, 6, [0, -16, 12], 4, 0x66b8ff);    // blue floor bounce
  panel(14, 14, [0, 18, -18], 5, 0x9fd4ff);   // sky back top
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.02);
  pmrem.dispose();
  return rt.texture;
}

function gradientBackground() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, '#1a74d2');
  g.addColorStop(0.34, '#1350ae');
  g.addColorStop(0.7, '#0c2f83');
  g.addColorStop(1.0, '#071a55');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ----------------------------------------------------------------------------
 * Chrome blob (morphing, ribbed lower half like the reference)
 * -------------------------------------------------------------------------- */
function buildBlob() {
  let g = new THREE.IcosahedronGeometry(1.5, 40);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-4);
  const pos = g.attributes.position;
  const n = pos.count;
  const baseP = new Float32Array(n * 3);
  const shape = (variant) => {
    const out = new Float32Array(n * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const { x, y, z } = v;
      let r = 1.5;
      if (variant === 0) {
        r += 0.22 * Math.sin(2.2 * x + 1.0) * Math.sin(2.0 * y + 2.0) * Math.sin(2.4 * z)
          + 0.10 * Math.sin(4.1 * x + 3.0 * y) * Math.cos(3.3 * z);
      } else if (variant === 1) {
        r += 0.30 * Math.sin(1.7 * x + 0.5) * Math.sin(1.6 * y + 0.2) * Math.sin(2.0 * z + 1.4)
          + 0.12 * Math.cos(3.7 * y + 2.0 * z) * Math.sin(2.9 * x);
        v.y *= 1.12;
      } else {
        r += 0.16 * Math.sin(2.6 * z + 0.4) * Math.sin(2.4 * x + 2.0) + 0.09 * Math.sin(5.0 * y);
        v.x *= 1.08;
      }
      // coiled ribs on the lower hemisphere
      const low = THREE.MathUtils.smoothstep(-y, 0.05, 0.55);
      r += low * 0.075 * Math.sin(y * 26.0);
      r *= 1 - low * 0.07;
      out[i * 3] = v.x * r;
      out[i * 3 + 1] = v.y * r;
      out[i * 3 + 2] = v.z * r;
    }
    return out;
  };
  const arrays = [shape(0), shape(1), shape(2)];
  baseP.set(arrays[0]);
  const normalsOf = (arr) => {
    const t = new THREE.BufferGeometry();
    t.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    t.setIndex(g.index);
    t.computeVertexNormals();
    return t.attributes.normal.array;
  };
  const n0 = normalsOf(arrays[0]);
  g.setAttribute('position', new THREE.BufferAttribute(baseP, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(n0, 3));
  const rel = (arr, base) => {
    const d = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) d[i] = arr[i] - base[i];
    return new THREE.BufferAttribute(d, 3);
  };
  g.morphAttributes.position = [rel(arrays[1], arrays[0]), rel(arrays[2], arrays[0])];
  g.morphAttributes.normal = [rel(normalsOf(arrays[1]), n0), rel(normalsOf(arrays[2]), n0)];
  g.morphTargetsRelative = true;

  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x9fd2ff,
    metalness: 1,
    roughness: 0.12,
    iridescence: 1,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [180, 520],
    clearcoat: 0.6,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.25,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.morphTargetInfluences = [0, 0];
  return mesh;
}


/* ----------------------------------------------------------------------------
 * Main scene
 * -------------------------------------------------------------------------- */
export async function initScene({ canvas, onProgress, reduced = false }) {
  const narrowInit = window.innerWidth < 760;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const maxDpr = narrowInit ? 1.5 : 1.75;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = gradientBackground();
  scene.environment = buildEnvironment(renderer);
  scene.environmentIntensity = 1.0;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 9);
  const FOV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const halfH = (z) => FOV * (camera.position.z - z);

  // lights ------------------------------------------------------------------
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x0a2a6e, 0.6));
  const key = new THREE.DirectionalLight(0xfff1e6, 2.4);
  key.position.set(-3, 4, 6);
  scene.add(key);
  const pinkRim = new THREE.PointLight(0x4f9bff, 60, 18, 2);
  pinkRim.position.set(4, 1, -1);
  scene.add(pinkRim);
  const aquaRim = new THREE.PointLight(0x7fe3ff, 55, 18, 2);
  aquaRim.position.set(-4, -1, 0);
  scene.add(aquaRim);

  // loaders -----------------------------------------------------------------
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_u, loaded, total) => onProgress?.(loaded / total);
  const loader = new GLTFLoader(manager);
  const [cardGltf, faceGltf] = await Promise.all([
    loader.loadAsync(`${base}assets/card.glb`),
    loader.loadAsync(`${base}assets/face.glb`),
  ]);
  if (document.fonts?.load) {
    await Promise.all([
      document.fonts.load('700 62px Manrope'),
      document.fonts.load('600 30px Manrope'),
      document.fonts.load('400 92px Marcellus'),
    ]);
  }

  /* ---- card ------------------------------------------------------------- */
  const card = new THREE.Group();          // positioned / tilted by scroll state
  const cardFlip = new THREE.Group();      // click-to-flip
  card.add(cardFlip);
  scene.add(card);

  cardGltf.scene.updateMatrixWorld(true);
  const byMat = {};
  cardGltf.scene.traverse((o) => { if (o.isMesh) byMat[o.material.name] = o; });
  const bake = (mesh) => { const g = mesh.geometry.clone(); g.applyMatrix4(mesh.matrixWorld); return g; };
  const slabGeo = bake(byMat.border_card);
  slabGeo.computeBoundingBox();
  const bb = slabGeo.boundingBox;
  const size = bb.getSize(new THREE.Vector3());
  const ctr = bb.getCenter(new THREE.Vector3());
  const CARD_W = 3.4;
  const sc = CARD_W / size.z;
  const M = new THREE.Matrix4()
    .makeScale(sc, sc, sc)
    .multiply(new THREE.Matrix4().makeRotationY(-Math.PI / 2))
    .multiply(new THREE.Matrix4().makeTranslation(-ctr.x, -ctr.y, -ctr.z));
  slabGeo.applyMatrix4(M);
  slabGeo.computeBoundingBox();
  const sb = slabGeo.boundingBox.getSize(new THREE.Vector3());
  const CARD_H = sb.y;
  const THICK = sb.z;
  const aspect = CARD_W / CARD_H;

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x2d6fd6,
    metalness: 0,
    roughness: 0.5,
    transmission: 1,
    thickness: 0.7,
    ior: 1.45,
    attenuationColor: new THREE.Color(0x0c3aa0),
    attenuationDistance: 0.45,
    iridescence: 0.55,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [200, 640],
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 0.85,
    specularIntensity: 0.8,
  });
  const slab = new THREE.Mesh(slabGeo, glass);
  cardFlip.add(slab);

  // chrome bezel (mirror-finish frame around the glass)
  const rr = (shape, x, y, w, h, r) => {
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y); shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r); shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
    return shape;
  };
  const R = 0.13;
  const frameShape = rr(new THREE.Shape(), -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, R);
  const bw = 0.028;
  const hole = rr(new THREE.Path(), -CARD_W / 2 + bw, -CARD_H / 2 + bw, CARD_W - bw * 2, CARD_H - bw * 2, R - bw * 0.6);
  frameShape.holes.push(hole);
  const frameGeo = new THREE.ExtrudeGeometry(frameShape, {
    depth: THICK, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.007, bevelSegments: 3, curveSegments: 24,
  });
  frameGeo.translate(0, 0, -THICK / 2);
  const chrome = new THREE.MeshPhysicalMaterial({
    color: 0xe6f4ff, metalness: 1, roughness: 0.06, envMapIntensity: 2.0, iridescence: 0.6, iridescenceIOR: 1.8,
  });
  cardFlip.add(new THREE.Mesh(frameGeo, chrome));

  // chip from the supplied model, re-chromed and moved bottom-right
  const chipGroup = new THREE.Group();
  const chipParts = [byMat.border, byMat.inside].filter(Boolean);
  const chipMats = [
    new THREE.MeshPhysicalMaterial({ color: 0xe6f4ff, metalness: 1, roughness: 0.18, envMapIntensity: 1.8 }),
    new THREE.MeshPhysicalMaterial({ color: 0x4f9bff, metalness: 1, roughness: 0.12, envMapIntensity: 1.8, iridescence: 1 }),
  ];
  const chipBox = new THREE.Box3();
  chipParts.forEach((p, i) => {
    const g = bake(p); g.applyMatrix4(M);
    const m = new THREE.Mesh(g, chipMats[i]);
    chipGroup.add(m);
    g.computeBoundingBox(); chipBox.union(g.boundingBox);
  });
  const cc = chipBox.getCenter(new THREE.Vector3());
  chipGroup.position.set(CARD_W * 0.365 - cc.x, -CARD_H * 0.24 - cc.y, 0);
  cardFlip.add(chipGroup);

  // text layers
  const front = createFrontFace(aspect, narrowInit ? 1024 : 1280);
  const back = createBackFace(aspect, 1280);
  const frontPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(CARD_W, CARD_H),
    new THREE.MeshBasicMaterial({ map: front.texture, transparent: true, depthWrite: false, toneMapped: false })
  );
  frontPlane.position.z = THICK / 2 + 0.006;
  cardFlip.add(frontPlane);
  const backPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(CARD_W, CARD_H),
    new THREE.MeshBasicMaterial({ map: back, transparent: true, depthWrite: false, toneMapped: false })
  );
  backPlane.rotation.y = Math.PI;
  backPlane.position.z = -THICK / 2 - 0.006;
  cardFlip.add(backPlane);

  // holographic sheen
  const sheenU = { uTime: { value: 0 }, uMouse: { value: new THREE.Vector2() }, uSize: { value: new THREE.Vector2(CARD_W, CARD_H) } };
  const sheenMat = new THREE.ShaderMaterial({
    uniforms: sheenU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uTime; uniform vec2 uMouse; uniform vec2 uSize;
      float sdRR(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
      void main(){
        vec2 p = (vUv - 0.5) * uSize;
        float d = sdRR(p, uSize * 0.5, 0.13);
        if (d > 0.0) discard;
        float diag = vUv.x * 0.85 + vUv.y * 0.55;
        float t = diag * 1.3 - uTime * 0.11 - uMouse.x * 0.35;
        float band = exp(-pow((fract(t) - 0.5) * 6.5, 2.0));
        vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (diag * 1.4 + vec3(0.0, 0.33, 0.67) + uTime * 0.03));
        vec3 col = mix(vec3(0.5, 0.78, 1.0), vec3(1.0), band) * band * 0.2 + rainbow * 0.05;
        col += vec3(0.75, 0.9, 1.0) * smoothstep(-0.05, 0.0, d) * 0.22; // inner rim light
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sheen = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), sheenMat);
  sheen.position.z = THICK / 2 + 0.012;
  cardFlip.add(sheen);

  /* ---- chrome blob ------------------------------------------------------- */
  const blob = buildBlob();
  blob.position.z = -1.8;
  scene.add(blob);

  /* ---- fish -------------------------------------------------------------- */
  const uTime = { value: 0 };
  const fishGroup = new THREE.Group();
  scene.add(fishGroup);
  let fishList = [], rayList = [], fishTick = null;
  loadFishes({ base, narrow: narrowInit, reduced, uTime }).then((r) => {
    fishGroup.add(r.group); fishList = r.fish; rayList = r.rays; fishTick = r.tick;
  }).catch((e) => console.warn('fish failed', e));
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion();
  const tmpV = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), AXZ = new THREE.Vector3(0, 0, 1), AXY = new THREE.Vector3(0, 1, 0);
  let aspectRatio = 1;
  const fishScale = narrowInit ? 0.7 : 1;
  const fishPos = (f, s, u) => {
    const hh = halfH(s.z), hw = hh * aspectRatio;
    const span = (hw + 2.2) * 2;
    const x = (u - 0.5) * span * s.dir + f.dz * 0.2;
    const y = s.lane * hh + Math.sin(u * s.freq * 6.283 + f.dy * 3) * s.amp + f.dy * 0.5;
    return [x, y, s.z + f.dz];
  };

  /* ---- bubbles ----------------------------------------------------------- */
  const BUB = reduced ? 40 : narrowInit ? 60 : 120;
  const bGeo = new THREE.BufferGeometry();
  const bPos = new Float32Array(BUB * 3), bSize = new Float32Array(BUB), bSpd = new Float32Array(BUB), bPh = new Float32Array(BUB);
  const resetBubble = (i, anywhere) => {
    bPos[i * 3] = rand(-7, 7);
    bPos[i * 3 + 1] = anywhere ? rand(-5, 5) : -5.5;
    bPos[i * 3 + 2] = rand(-4, 4);
    bSize[i] = rand(0.05, 0.2);
    bSpd[i] = rand(0.25, 0.8);
    bPh[i] = rand(0, 6.28);
  };
  for (let i = 0; i < BUB; i++) resetBubble(i, true);
  bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  bGeo.setAttribute('aSize', new THREE.BufferAttribute(bSize, 1));
  const bubbleMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uMap: { value: bubbleTexture() }, uScale: { value: 600 } },
    vertexShader: `attribute float aSize; uniform float uScale;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: 'uniform sampler2D uMap; void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(t.rgb, t.a * 0.8); }',
  });
  const bubbles = new THREE.Points(bGeo, bubbleMat);
  bubbles.frustumCulled = false;
  scene.add(bubbles);

  /* ---- drifting plankton specks (like the particles in the reference ocean) ---- */
  const SPK = reduced ? 80 : narrowInit ? 120 : 240;
  const sGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(SPK * 3), sSize = new Float32Array(SPK), sPh = new Float32Array(SPK);
  for (let i = 0; i < SPK; i++) {
    sPos[i * 3] = rand(-8, 8); sPos[i * 3 + 1] = rand(-5, 5); sPos[i * 3 + 2] = rand(-6, 4);
    sSize[i] = rand(0.012, 0.045); sPh[i] = rand(0, 6.28);
  }
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1));
  const dot = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d'); const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(200,240,255,0.95)'); g.addColorStop(1, 'rgba(200,240,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  })();
  const specks = new THREE.Points(sGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uMap: { value: dot }, uScale: bubbleMat.uniforms.uScale },
    vertexShader: bubbleMat.vertexShader, fragmentShader: bubbleMat.fragmentShader,
  }));
  specks.frustumCulled = false;
  scene.add(specks);

  /* ---- face -------------------------------------------------------------- */
  const face = new THREE.Group();
  const facePivot = new THREE.Group();
  face.add(facePivot);
  const fbox = new THREE.Box3().setFromObject(faceGltf.scene);
  const fc = fbox.getCenter(new THREE.Vector3());
  const FACE_H = fbox.max.y - fbox.min.y;
  faceGltf.scene.position.set(-fc.x, -fc.y, -fc.z);
  faceGltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    m.side = THREE.DoubleSide;
    m.roughness = 0.85;
    m.metalness = 0;
    m.envMapIntensity = 0.3;
    m.color = new THREE.Color(0x7c7f96); // darker avatar
    if (m.map) { m.emissiveMap = m.map; m.emissive = new THREE.Color(0x05070f); }
  });
  facePivot.add(faceGltf.scene);
  const FACE_Z = 2.4;
  face.position.z = FACE_Z;
  scene.add(face);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(130,200,255,0.5)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8,
  }));
  glow.position.z = FACE_Z - 0.6;
  scene.add(glow);

  /* ---- interaction ------------------------------------------------------- */
  const pointer = { x: 0, y: 0, sx: 0, sy: 0, fx: 9, fy: 9 };
  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    pointer.fx = pointer.x; pointer.fy = pointer.y;
  }, { passive: true });
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hitCard = (cx, cy) => {
    ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObject(slab, false).length > 0;
  };
  let flipped = 0, flipTarget = 0;

  /* ---- layout + frame ---------------------------------------------------- */
  let w = 1, h = 1;
  function resize() {
    w = window.innerWidth; h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, w < 760 ? 1.5 : 1.75));
    renderer.setSize(w, h, false);
    aspectRatio = w / h;
    camera.aspect = aspectRatio;
    camera.updateProjectionMatrix();
    bubbleMat.uniforms.uScale.value = (h * renderer.getPixelRatio()) / (2 * FOV);
  }
  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('pointerleave', () => { pointer.fx = 9; pointer.fy = 9; });

  let scrollVel = 0;
  let textClock = 0;
  let lastNow = performance.now();
  let running = true;
  let t = 0;
  let frameNo = 0;

  function frame() {
    if (!running) return;
    const now = performance.now();
    const dt = Math.min((now - lastNow) / 1000, 0.05);
    lastNow = now;
    t += dt;
    frameNo++;
    uTime.value = t;
    sheenU.uTime.value = t;

    pointer.sx += (pointer.x - pointer.sx) * 0.06;
    pointer.sy += (pointer.y - pointer.sy) * 0.06;
    sheenU.uMouse.value.set(pointer.sx, pointer.sy);
    scrollVel *= 0.92;
    const boost = 1 + Math.min(Math.abs(scrollVel) * 0.0025, 5);

    // camera sway (screen moves with the pointer)
    camera.position.x = pointer.sx * 0.35;
    camera.position.y = -pointer.sy * 0.22;
    camera.lookAt(0, 0, 0);

    const I = THREE.MathUtils.smoothstep(state.intro, 0, 1);
    scene.backgroundIntensity = 1 - 0.5 * state.depth; // the water darkens as you descend

    // card ------------------------------------------------------------------
    const hc = halfH(0), wc = hc * aspectRatio;
    const cs = (state.cardW * 2 * wc) / CARD_W * (0.7 + 0.3 * I);
    card.scale.setScalar(Math.max(cs, 0.0001));
    card.position.set(state.cardX * wc, state.cardY * hc + Math.sin(t * 0.9) * 0.08, 0);
    flipped += (flipTarget - flipped) * 0.08;
    cardFlip.rotation.y = flipped * Math.PI;
    card.rotation.set(
      state.cardRX + pointer.sy * 0.18 + Math.sin(t * 0.7) * 0.03,
      state.cardRY + pointer.sx * 0.3 + Math.sin(t * 0.5) * 0.05,
      state.cardRZ + Math.sin(t * 0.6) * 0.02,
      'YXZ'
    );
    card.visible = cs > 0.01;

    // blob ------------------------------------------------------------------
    const hb = halfH(blob.position.z), wb = hb * aspectRatio;
    blob.position.x = state.blobX * wb;
    blob.position.y = state.blobY * hb + Math.sin(t * 0.7) * 0.1;
    blob.scale.setScalar(state.blobS * 0.32 * hb * (0.4 + 0.6 * I));
    blob.rotation.y = t * 0.12 + state.faceRot * 0.12;
    blob.rotation.x = Math.sin(t * 0.3) * 0.2;
    blob.morphTargetInfluences[0] = 0.5 + 0.5 * Math.sin(t * 0.45);
    blob.morphTargetInfluences[1] = 0.5 + 0.5 * Math.sin(t * 0.31 + 2.0);
    blob.visible = state.blobS > 0.02;

    // face ------------------------------------------------------------------
    const hf = halfH(FACE_Z), wf = hf * aspectRatio;
    const fs = (state.faceH * 2 * hf) / FACE_H * (0.75 + 0.25 * I);
    face.scale.setScalar(Math.max(fs, 0.0001));
    face.position.x = state.faceX * wf;
    face.position.y = state.faceY * hf + Math.sin(t * 1.1) * 0.05;
    facePivot.rotation.y = state.faceRot + pointer.sx * 0.35 + Math.sin(t * 0.8) * 0.05;
    facePivot.rotation.x = pointer.sy * 0.08;
    glow.position.x = face.position.x;
    glow.position.y = face.position.y;
    glow.scale.setScalar(state.faceH * 2 * hf * 1.9);
    glow.material.opacity = 0.55 + 0.25 * Math.sin(t * 1.2);
    face.visible = fs > 0.01;
    glow.visible = face.visible;
    pinkRim.position.x = 4 + Math.sin(state.faceRot) * 2;

    // fish + rays: glide along their lanes, swim away from the cursor ---------
    const pathStep = (f, s, dt, R, rate, isRay) => {
      if (s._f !== frameNo) { s._f = frameNo; s.u = (s.u + dt * s.speed * boost * (reduced ? 0.4 : 1) + 1) % 1; }
      const u = isRay ? s.u : (s.u + f.off + 1) % 1;
      const P = isRay ? s : s;
      const [x, y, z] = fishPos(isRay ? { dz: 0, dy: 0 } : f, P, u);
      const [x2, y2] = fishPos(isRay ? { dz: 0, dy: 0 } : f, P, (u + 0.004) % 1 || 0.0001);
      let vx = x2 - x, vy = y2 - y;
      if (Math.abs(vx) > 5) { vx = P.dir; vy = 0; }
      // world-space path velocity
      const o = f.o;
      // cursor repulsion (screen-space cursor projected to this fish's depth)
      const hh = halfH(z), hw = hh * aspectRatio;
      const dx = x + o.x - pointer.fx * hw, dy = y + o.y + pointer.fy * hh;
      const d = Math.hypot(dx, dy) || 0.001, r = R * hh;
      let tx = 0, ty = 0;
      if (d < r) { const k = 1 - d / r; const push = k * k * r * 1.5 + k * 0.5; tx = dx / d * push; ty = dy / d * push; }
      o.pvx = o.x; o.pvy = o.y;
      const a = Math.min(1, dt * rate);
      o.x += (tx - o.x) * a; o.y += (ty - o.y) * a;
      // heading = glide direction + flee velocity, smoothed so turns look natural
      const gl = Math.hypot(vx, vy) || 1;
      const glideSpeed = 0.9; // world units / s, only the ratio matters
      const wx = (vx / gl) * glideSpeed + (o.x - o.pvx) / Math.max(dt, 1e-3) * 0.6;
      const wy = (vy / gl) * glideSpeed + (o.y - o.pvy) / Math.max(dt, 1e-3) * 0.6;
      const wl = Math.hypot(wx, wy) || 1;
      const k2 = Math.min(1, dt * 7);
      f.hx += (wx / wl - f.hx) * k2; f.hy += (wy / wl - f.hy) * k2;
      const hl = Math.hypot(f.hx, f.hy) || 1;
      const hx = f.hx / hl, hy = f.hy / hl;
      if (hx >= 0) tmpQ.setFromAxisAngle(AXZ, Math.atan2(hy, hx));
      else {
        tmpQ.setFromAxisAngle(AXY, Math.PI);
        tmpQ2.setFromAxisAngle(AXZ, Math.atan2(hy, -hx));
        tmpQ.multiply(tmpQ2);
      }
      tmpP.set(x + o.x, y + o.y, z);
    };
    const visibleFish = Math.round(fishList.length * Math.min(1, state.fish));
    for (let i = 0; i < fishList.length; i++) {
      const f = fishList[i];
      f.obj.visible = i < visibleFish;
      if (i >= visibleFish) continue;
      pathStep(f, f.own || f.s, dt, f.big ? 0.55 : 0.45, f.big ? 5 : 9, false);
      f.obj.position.copy(tmpP); f.obj.quaternion.copy(tmpQ);
      f.obj.scale.setScalar(f.size * fishScale * (0.5 + 0.5 * I));
    }
    for (let i = 0; i < rayList.length; i++) {
      const r = rayList[i];
      pathStep(r, r, dt, 0.5, 4, true);
      r.obj.position.copy(tmpP); r.obj.quaternion.copy(tmpQ);
      r.obj.scale.setScalar(r.size * fishScale * (0.5 + 0.5 * I));
    }
    fishTick?.(dt);

    // bubbles ---------------------------------------------------------------
    for (let i = 0; i < BUB; i++) {
      bPos[i * 3 + 1] += dt * bSpd[i] * boost;
      bPos[i * 3] += Math.sin(t * 1.3 + bPh[i]) * dt * 0.15;
      if (bPos[i * 3 + 1] > 5.5) resetBubble(i, false);
    }
    bGeo.attributes.position.needsUpdate = true;
    for (let i = 0; i < SPK; i++) {
      sPos[i * 3] += Math.sin(t * 0.4 + sPh[i]) * dt * 0.08;
      sPos[i * 3 + 1] += (0.05 + sSize[i] * 2) * dt * boost - dt * 0.02;
      if (sPos[i * 3 + 1] > 5.5) sPos[i * 3 + 1] = -5.5;
    }
    sGeo.attributes.position.needsUpdate = true;

    // card text animation (≈20 fps, only when on-screen) --------------------
    textClock += dt;
    if (card.visible && !reduced && textClock > 1 / 20) {
      textClock = 0;
      front.draw(t);
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  front.draw(0);

  return {
    start() { running = true; lastNow = performance.now(); requestAnimationFrame(frame); },
    stop() { running = false; },
    setScrollVelocity(v) { scrollVel = v; },
    hitCard,
    flip() { flipTarget = flipTarget === 0 ? 1 : 0; },
    renderer,
    debug: { get fishList() { return fishList; }, get rayList() { return rayList; }, scene, camera, card, blob, face, fishGroup, bubbles, glow },
  };
}
