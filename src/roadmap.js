/**
 * Wavy "journey" roadmaps, in the style of the vertical path on the reference ocean site:
 * a thin wavering line, nodes for each stop, a bright progress trail and an arrow marker.
 */
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (name, attrs = {}) => {
  const el = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
};

export const wave = (y, cx, amp, len) => cx + amp * Math.sin(y / len);
const pathFor = (H, cx, amp, len) => {
  let d = `M ${wave(0, cx, amp, len).toFixed(1)} 0`;
  for (let y = 6; y <= H; y += 6) d += ` L ${wave(y, cx, amp, len).toFixed(1)} ${y}`;
  return d;
};
const heading = (y, cx, amp, len) => {
  const dx = wave(y + 2, cx, amp, len) - wave(y - 2, cx, amp, len);
  return (Math.atan2(dx / 4, -1) * 180) / Math.PI; // arrow tip points along the travel direction (down)
};

function build(container, H, { width = 44, cx = 22, amp = 9, len = 46, id }) {
  container.querySelector('svg')?.remove();
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${H}`, width, height: H, 'aria-hidden': 'true', class: 'wr' });
  const clip = svgEl('clipPath', { id });
  const clipRect = svgEl('rect', { x: 0, y: 0, width, height: 0 });
  clip.appendChild(clipRect);
  const d = pathFor(H, cx, amp, len);
  const base = svgEl('path', { d, class: 'wr__base' });
  const fill = svgEl('path', { d, class: 'wr__fill', 'clip-path': `url(#${id})` });
  const arrow = svgEl('g', { class: 'wr__arrow' });
  arrow.appendChild(svgEl('path', { d: 'M0 -11 L7 7 L0 3 L-7 7 Z' }));
  svg.append(clip, base, fill, arrow);
  container.prepend(svg);
  return {
    svg,
    nodes: [],
    set(p) {
      const y = Math.max(0, Math.min(1, p)) * H;
      clipRect.setAttribute('height', y);
      arrow.setAttribute('transform', `translate(${wave(y, cx, amp, len)} ${y}) rotate(${heading(y, cx, amp, len)})`);
      return y;
    },
    addNode(y, cls = 'wr__node') {
      const c = svgEl('circle', { cx: wave(y, cx, amp, len), cy: y, r: 5, class: cls });
      svg.insertBefore(c, arrow);
      this.nodes.push({ y, el: c });
      return c;
    },
  };
}

/** Fixed, page-level roadmap: one node per section, jump on click. */
export function createPageRoadmap({ sections, labels, onJump }) {
  const root = document.createElement('nav');
  root.className = 'road';
  root.setAttribute('aria-label', 'Journey roadmap');
  document.body.appendChild(root);
  const list = document.createElement('ol');
  root.appendChild(list);
  let road = null;
  let H = 0;
  let nodeP = [];
  let progress = 0;

  function layout() {
    H = Math.round(Math.min(window.innerHeight * 0.58, 540));
    root.style.height = H + 'px';
    road = build(root, H, { id: 'roadClip' });
    const max = document.documentElement.scrollHeight - window.innerHeight;
    nodeP = sections.map((s) => Math.min(1, Math.max(0, (s.offsetTop - 1) / max)));
    // keep nodes from stacking when two sections share a start
    list.innerHTML = '';
    nodeP.forEach((p, i) => {
      const y = Math.min(H - 6, Math.max(6, p * H));
      road.addNode(y);
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'road__btn';
      b.style.top = y + 'px';
      b.style.left = wave(y, 22, 9, 46) + 'px';
      b.setAttribute('aria-label', `Go to ${labels[i]}`);
      b.innerHTML = `<span>${labels[i]}</span>`;
      b.addEventListener('click', () => onJump(sections[i]));
      li.appendChild(b);
      list.appendChild(li);
    });
    update(progress);
  }

  function update(p) {
    progress = p;
    if (!road) return;
    const y = road.set(p);
    let current = 0;
    road.nodes.forEach((n, i) => {
      const passed = nodeP[i] <= p + 0.002;
      n.el.classList.toggle('is-passed', passed);
      if (passed) current = i;
    });
    list.querySelectorAll('.road__btn').forEach((b, i) => {
      b.classList.toggle('is-current', i === current);
      b.toggleAttribute('aria-current', i === current);
    });
    return current;
  }

  layout();
  window.addEventListener('resize', layout);
  return { update, layout };
}

/** In-section roadmap beside the experience timeline: the trail draws as you read. */
export function createTimelineRoad(ol) {
  let road = null;
  let items = [];
  let H = 0;
  function layout() {
    H = ol.offsetHeight;
    items = [...ol.children];
    road = build(ol, H, { width: 44, cx: 22, amp: 8, len: 52, id: 'tlClip' });
    road.svg.classList.add('wr--tl');
    items.forEach((li) => road.addNode(li.offsetTop + 14, 'wr__node wr__node--big'));
    set(0);
  }
  function set(p) {
    if (!road) return;
    const y = road.set(p);
    road.nodes.forEach((n, i) => {
      const on = n.y <= y + 2;
      n.el.classList.toggle('is-passed', on);
      items[i]?.classList.toggle('is-passed', on);
    });
  }
  layout();
  return { set, layout };
}
