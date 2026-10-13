import * as THREE from 'three';

function star(ctx, cx, cy, r, color, lw) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.beginPath();
  // four-point sparkle, same motif as the reference card
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx, cy, cx + r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + r);
  ctx.quadraticCurveTo(cx, cy, cx - r, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - r);
  ctx.stroke();
  ctx.restore();
}

function spaced(ctx, text, x, y, spacing) {
  ctx.letterSpacing = spacing + 'px';
  ctx.fillText(text, x, y);
  ctx.letterSpacing = '0px';
}

/** Front face: dark tint for legibility, logo, animated name, designation, stats row. */
export function createFrontFace(aspect, width = 1280) {
  const W = width;
  const H = Math.round(W / aspect);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const px = (v) => (v * W) / 1280; // design in a 1280 space

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(time) {
    ctx.clearRect(0, 0, W, H);

    // dark violet tint so every line stays readable over the bright chrome behind the glass
    const tint = ctx.createLinearGradient(0, 0, W, H);
    tint.addColorStop(0, 'rgba(3,14,52,0.8)');
    tint.addColorStop(0.6, 'rgba(6,30,88,0.62)');
    tint.addColorStop(1, 'rgba(10,46,118,0.5)');
    ctx.fillStyle = tint;
    roundRect(px(4), px(4), W - px(8), H - px(8), px(46));
    ctx.fill();

    ctx.shadowColor = 'rgba(8,2,30,0.7)';
    ctx.shadowBlur = px(14);
    ctx.shadowOffsetY = px(3);

    // --- name wordmark with a travelling wave + sheen ---------------------
    const name = 'KARTHIKEYAN.V';
    ctx.font = `700 ${px(70)}px Manrope, system-ui, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.letterSpacing = px(5) + 'px';
    let x = px(84);
    const baseY = px(158);
    const sheen = ((time * 0.35) % 2.2) - 0.6;
    for (let i = 0; i < name.length; i++) {
      const ch = name[i];
      const wave = Math.sin(time * 2.2 + i * 0.55) * px(5);
      const u = i / (name.length - 1);
      const s = Math.max(0, 1 - Math.abs(u - sheen) * 5);
      const light = 236 + s * 19;
      ctx.fillStyle = `rgba(${light},${light + 4},255,${0.92 + s * 0.08})`;
      ctx.fillText(ch, x, baseY + wave);
      x += ctx.measureText(ch).width;
    }
    ctx.letterSpacing = '0px';

    // --- sparkle -----------------------------------------------------------
    const pulse = 1 + Math.sin(time * 1.6) * 0.08;
    star(ctx, px(1130), px(138), px(46) * pulse, 'rgba(229,250,255,0.85)', px(5));

    // --- designation (both roles, always visible) --------------------------
    ctx.font = `400 ${px(70)}px Marcellus, Georgia, serif`;
    const roleY = H * 0.47;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Technical Program Manager', px(84), roleY);
    ctx.fillStyle = '#94e6fb';
    ctx.fillText('& Product Manager', px(84), roleY + px(88));
    const g = ctx.createLinearGradient(px(84), 0, px(640), 0);
    g.addColorStop(0, 'rgba(148,230,251,0.95)');
    g.addColorStop(1, 'rgba(148,230,251,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px(84), roleY + px(122), px(556), px(4));

    // --- stats row ---------------------------------------------------------
    ctx.font = `700 ${px(38)}px Manrope, system-ui, sans-serif`;
    ctx.fillStyle = '#ffffff';
    spaced(ctx, '5+ YRS  10+ PROGRAMS  95% ON-TIME', px(84), H - px(118), px(5));
    ctx.font = `600 ${px(30)}px Manrope, system-ui, sans-serif`;
    ctx.fillStyle = '#94e6fb';
    spaced(ctx, 'CHENNAI · OPEN TO RELOCATE', px(84), H - px(64), px(5));

    ctx.shadowColor = 'transparent';
    texture.needsUpdate = true;
  }

  return { texture, draw };
}

/** Back face: magnetic stripe, signature panel, contact lines. */
export function createBackFace(aspect, width = 1280) {
  const W = width;
  const H = Math.round(W / aspect);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const px = (v) => (v * W) / 1280;

  // tinted-glass plate (same as the front) for contrast
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, px(50));
  ctx.clip();
  const plate = ctx.createLinearGradient(0, 0, W, H);
  plate.addColorStop(0, 'rgba(3,14,52,0.8)');
  plate.addColorStop(1, 'rgba(10,46,118,0.5)');
  ctx.fillStyle = plate;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // magnetic stripe
  const ms = ctx.createLinearGradient(0, 0, 0, px(150));
  ms.addColorStop(0, '#030c2e');
  ms.addColorStop(1, '#0a2160');
  ctx.fillStyle = ms;
  ctx.fillRect(0, H * 0.14, W, px(150));

  // signature panel
  ctx.fillStyle = 'rgba(244,238,255,0.86)';
  ctx.fillRect(px(84), H * 0.14 + px(210), px(700), px(110));
  ctx.fillStyle = '#0a2160';
  ctx.font = `400 ${px(70)}px Marcellus, Georgia, serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText('Karthikeyan V', px(120), H * 0.14 + px(266));
  ctx.fillStyle = 'rgba(148,230,251,0.9)';
  ctx.font = `600 ${px(26)}px Manrope, system-ui, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  spaced(ctx, 'AUTHORIZED SIGNATURE', px(84), H * 0.14 + px(356), px(5));

  ctx.fillStyle = 'rgba(247,243,255,0.92)';
  ctx.font = `600 ${px(38)}px Manrope, system-ui, sans-serif`;
  const lines = [
    'vkarthikeyan14@gmail.com',
    'linkedin.com/in/karthikeyan-v-8a203a195',
    'github.com/karthikeyan12345678',
    '+91 94866 15293 · +91 63810 62620',
  ];
  lines.forEach((l, i) => ctx.fillText(l, px(84), H - px(226) + i * px(56)));

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Soft radial glow sprite texture. */
export function glowTexture(inner = 'rgba(255,255,255,0.9)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner);
  g.addColorStop(0.45, 'rgba(120,190,255,0.25)');
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Bubble sprite: transparent centre, bright rim, small highlight. */
export function bubbleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 20, 64, 64, 60);
  g.addColorStop(0, 'rgba(148,230,251,0.02)');
  g.addColorStop(0.8, 'rgba(180,235,255,0.25)');
  g.addColorStop(0.94, 'rgba(229,250,255,0.9)');
  g.addColorStop(1, 'rgba(229,250,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(44, 42, 9, 5, -0.7, 0, Math.PI * 2);
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
