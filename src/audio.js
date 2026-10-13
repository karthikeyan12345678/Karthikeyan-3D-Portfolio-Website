/**
 * Procedural underwater sound design (Web Audio, no audio files to host).
 * Starts only after a user gesture, off until the visitor opts in.
 */
export function createAudio() {
  let ctx = null;
  let master = null;
  let whooshGain = null;
  let whooshFilter = null;
  let noiseBuf = null;
  let on = false;
  let bubbleTimer = null;
  let lastHover = 0;

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // 3 s of brown noise, looped
    const len = ctx.sampleRate * 3;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.5;
    }
    const noiseSrc = () => {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf;
      s.loop = true;
      s.start();
      return s;
    };

    // deep water bed: noise -> lowpass with slow LFO
    const bed = noiseSrc();
    const bedFilter = ctx.createBiquadFilter();
    bedFilter.type = 'lowpass';
    bedFilter.frequency.value = 420;
    const bedGain = ctx.createGain();
    bedGain.gain.value = 0.55;
    bed.connect(bedFilter).connect(bedGain).connect(master);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 170;
    lfo.connect(lfoAmt).connect(bedFilter.frequency);
    lfo.start();

    // soft pad: open fifth with slight detune
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 700;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.05;
    padFilter.connect(padGain).connect(master);
    [110, 164.81, 220.6, 329.6].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'sine' : 'triangle';
      o.frequency.value = f;
      o.detune.value = (i - 1.5) * 4;
      const g = ctx.createGain();
      g.gain.value = i > 1 ? 0.35 : 1;
      o.connect(g).connect(padFilter);
      o.start();
    });
    const padLfo = ctx.createOscillator();
    padLfo.frequency.value = 0.05;
    const padLfoAmt = ctx.createGain();
    padLfoAmt.gain.value = 0.025;
    padLfo.connect(padLfoAmt).connect(padGain.gain);
    padLfo.start();

    // scroll whoosh: band-passed noise whose level follows scroll speed
    const wn = noiseSrc();
    whooshFilter = ctx.createBiquadFilter();
    whooshFilter.type = 'bandpass';
    whooshFilter.Q.value = 0.9;
    whooshFilter.frequency.value = 400;
    whooshGain = ctx.createGain();
    whooshGain.gain.value = 0;
    wn.connect(whooshFilter).connect(whooshGain).connect(master);
  }

  function env(g, t0, attack, peak, decay) {
    g.gain.cancelScheduledValues(t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  function bubble(strength = 1) {
    if (!on || !ctx) return;
    const t0 = ctx.currentTime;
    const f = 280 + Math.random() * 420;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t0);
    o.frequency.exponentialRampToValueAtTime(f * 2.4, t0 + 0.09);
    const g = ctx.createGain();
    env(g, t0, 0.008, 0.16 * strength, 0.1);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + 0.2);
  }

  function chime() {
    if (!on || !ctx) return;
    const t0 = ctx.currentTime;
    [523.25, 783.99, 1174.66].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      env(g, t0 + i * 0.06, 0.02, 0.07 / (i + 1), 1.4);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3000;
      o.connect(g).connect(lp).connect(master);
      o.start(t0 + i * 0.06);
      o.stop(t0 + 1.8);
    });
  }

  function splash() {
    if (!on || !ctx) return;
    const t0 = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(300, t0);
    bp.frequency.exponentialRampToValueAtTime(2400, t0 + 0.28);
    const g = ctx.createGain();
    env(g, t0, 0.03, 0.5, 0.35);
    s.connect(bp).connect(g).connect(master);
    s.start(t0, Math.random() * 1.5);
    s.stop(t0 + 0.5);
    bubble(1.2);
    setTimeout(() => bubble(0.8), 90);
  }

  function hover() {
    const now = performance.now();
    if (now - lastHover < 140) return;
    lastHover = now;
    bubble(0.55);
  }

  function scheduleAmbientBubbles() {
    clearTimeout(bubbleTimer);
    if (!on) return;
    bubbleTimer = setTimeout(() => {
      if (document.visibilityState === 'visible') {
        bubble(0.35);
        if (Math.random() < 0.5) setTimeout(() => bubble(0.25), 120 + Math.random() * 160);
      }
      scheduleAmbientBubbles();
    }, 2500 + Math.random() * 4500);
  }

  async function enable() {
    init();
    if (!ctx) return false;
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) {} }
    if (ctx.state !== 'running') return false; // browser still blocking; caller retries on next gesture
    if (on) return true;
    on = true;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.6);
    scheduleAmbientBubbles();
    setTimeout(() => chime(), 200);
    return true;
  }

  function disable() {
    on = false;
    clearTimeout(bubbleTimer);
    if (ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
  }

  return {
    enable,
    disable,
    toggle() { return on ? (disable(), false) : enable(); },
    isOn: () => on,
    bubble, chime, splash, hover,
    /** feed the current scroll velocity (px/s) */
    whoosh(v) {
      if (!ctx || !on || !whooshGain) return;
      const a = Math.min(Math.abs(v) / 2600, 1);
      whooshGain.gain.setTargetAtTime(a * 0.28, ctx.currentTime, 0.08);
      whooshFilter.frequency.setTargetAtTime(260 + a * 1500, ctx.currentTime, 0.1);
    },
  };
}
