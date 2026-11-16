// ===================================================================
// AUDIO: synthesized SFX + generative ambient score (Web Audio, no files)
// ===================================================================

const Sound = (() => {
  let ac = null, master, sfxBus, musicBus, noiseBuf, echo;
  const settings = { sfx: true, music: true };
  const last = {};
  let voices = 0;

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ac = new AC(); } catch (e) { ac = null; return; }
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    comp.connect(ac.destination);
    master = ac.createGain(); master.gain.value = 0.85; master.connect(comp);
    sfxBus = ac.createGain(); sfxBus.gain.value = settings.sfx ? 0.9 : 0; sfxBus.connect(master);
    musicBus = ac.createGain(); musicBus.gain.value = settings.music ? 0.3 : 0; musicBus.connect(master);
    // A soft echo gives the music its cavernous night air.
    echo = ac.createDelay(1.5); echo.delayTime.value = 0.43;
    const fb = ac.createGain(); fb.gain.value = 0.32;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    echo.connect(lp); lp.connect(fb); fb.connect(echo); lp.connect(musicBus);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    Music.start();
  }

  function env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function track(node) { voices++; node.onended = () => { voices--; }; }

  function tone(o) {
    const { f = 440, f2 = 0, type = 'sine', dur = 0.15, vol = 0.1, at = 0, a = 0.005, bus = sfxBus, send = 0 } = o;
    const t = ac.currentTime + at;
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (f2) osc.frequency.exponentialRampToValueAtTime(f2, t + dur);
    env(g, t, a, vol, dur);
    osc.connect(g); g.connect(bus);
    if (send) { const s = ac.createGain(); s.gain.value = send; g.connect(s); s.connect(echo); }
    osc.start(t); osc.stop(t + dur + 0.05);
    track(osc);
  }
  function noise(o) {
    const { dur = 0.2, vol = 0.1, f = 1000, f2 = 0, type = 'lowpass', q = 1, at = 0, a = 0.003, bus = sfxBus } = o;
    const t = ac.currentTime + at;
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ac.createGain();
    env(g, t, a, vol, dur);
    src.connect(fl); fl.connect(g); g.connect(bus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
    track(src);
  }

  // [min ms between plays, synth]
  const defs = {
    arrow:   [45, () => { noise({ dur: 0.07, vol: 0.09, f: 3800, type: 'highpass' }); tone({ f: rand(820, 980), f2: 420, type: 'triangle', dur: 0.06, vol: 0.03 }); }],
    snipe:   [80, () => { noise({ dur: 0.12, vol: 0.16, f: 2400, f2: 600, type: 'bandpass', q: 2 }); tone({ f: 1400, f2: 300, type: 'triangle', dur: 0.1, vol: 0.05 }); }],
    bolt:    [55, () => { tone({ f: rand(560, 640), f2: 1300, type: 'sine', dur: 0.14, vol: 0.06 }); tone({ f: 980, f2: 1960, type: 'triangle', dur: 0.1, vol: 0.025, at: 0.02 }); }],
    void:    [90, () => { tone({ f: 160, f2: 60, type: 'sawtooth', dur: 0.35, vol: 0.06 }); tone({ f: 640, f2: 320, type: 'sine', dur: 0.3, vol: 0.05 }); }],
    zap:     [70, () => { noise({ dur: 0.16, vol: 0.12, f: 3000, type: 'bandpass', q: 3 }); tone({ f: 180, f2: 90, type: 'square', dur: 0.12, vol: 0.035 }); }],
    cannon:  [70, () => { noise({ dur: 0.22, vol: 0.18, f: 600, f2: 120 }); tone({ f: 140, f2: 50, type: 'sine', dur: 0.25, vol: 0.18 }); }],
    boom:    [60, () => { noise({ dur: 0.45, vol: 0.22, f: 1200, f2: 90 }); tone({ f: 90, f2: 32, type: 'sine', dur: 0.45, vol: 0.22 }); }],
    frost:   [120, () => { tone({ f: 1760, type: 'triangle', dur: 0.35, vol: 0.025, send: 0.4 }); tone({ f: 2637, type: 'sine', dur: 0.3, vol: 0.018, at: 0.03 }); noise({ dur: 0.2, vol: 0.03, f: 6000, type: 'highpass' }); }],
    freeze:  [120, () => { tone({ f: 2093, f2: 3136, type: 'triangle', dur: 0.25, vol: 0.04 }); noise({ dur: 0.18, vol: 0.06, f: 5000, type: 'highpass' }); }],
    flame:   [110, () => { noise({ dur: 0.2, vol: 0.06, f: 900, f2: 500, type: 'bandpass', q: 0.7 }); }],
    coin:    [50, () => { tone({ f: 1318, type: 'square', dur: 0.05, vol: 0.022 }); tone({ f: 1975, type: 'square', dur: 0.08, vol: 0.022, at: 0.05 }); }],
    pop:     [35, () => { tone({ f: rand(260, 360), f2: 70, type: 'square', dur: 0.1, vol: 0.035 }); noise({ dur: 0.08, vol: 0.05, f: 1800 }); }],
    split:   [80, () => { tone({ f: 300, f2: 120, type: 'sine', dur: 0.18, vol: 0.08 }); noise({ dur: 0.15, vol: 0.06, f: 700 }); }],
    leak:    [150, () => { tone({ f: 110, f2: 46, type: 'sawtooth', dur: 0.5, vol: 0.12 }); noise({ dur: 0.35, vol: 0.12, f: 500 }); }],
    build:   [60, () => { [523, 659, 784].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.14, vol: 0.06, at: i * 0.05 })); noise({ dur: 0.1, vol: 0.06, f: 1200 }); }],
    upgrade: [60, () => { [523, 659, 784, 1047].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.2, vol: 0.06, at: i * 0.06, send: 0.3 })); }],
    sell:    [60, () => { [784, 587, 440].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.12, vol: 0.05, at: i * 0.05 })); this_coin(); }],
    deny:    [120, () => { tone({ f: 180, type: 'square', dur: 0.08, vol: 0.04 }); tone({ f: 150, type: 'square', dur: 0.1, vol: 0.04, at: 0.09 }); }],
    click:   [30, () => { tone({ f: 1100, type: 'triangle', dur: 0.04, vol: 0.03 }); }],
    horn:    [400, () => { [196, 294].forEach(f => { tone({ f, type: 'sawtooth', dur: 0.9, vol: 0.05, a: 0.08, send: 0.3 }); tone({ f: f * 1.005, type: 'sawtooth', dur: 0.9, vol: 0.04, a: 0.1 }); }); }],
    boss:    [800, () => { tone({ f: 55, f2: 41, type: 'sawtooth', dur: 1.6, vol: 0.14, a: 0.2 }); tone({ f: 82, f2: 61, type: 'sawtooth', dur: 1.6, vol: 0.08, a: 0.25 }); noise({ dur: 1.2, vol: 0.06, f: 300, a: 0.3 }); }],
    stomp:   [300, () => { tone({ f: 70, f2: 28, type: 'sine', dur: 0.6, vol: 0.3 }); noise({ dur: 0.5, vol: 0.18, f: 400, f2: 60 }); }],
    summon:  [300, () => { tone({ f: 220, f2: 110, type: 'triangle', dur: 0.6, vol: 0.06, send: 0.5 }); tone({ f: 233, f2: 116, type: 'triangle', dur: 0.6, vol: 0.05 }); }],
    heal:    [250, () => { tone({ f: 660, f2: 990, type: 'sine', dur: 0.3, vol: 0.03, send: 0.4 }); }],
    phase:   [250, () => { tone({ f: 900, f2: 300, type: 'sine', dur: 0.3, vol: 0.025, send: 0.5 }); }],
    meteor:  [200, () => { noise({ dur: 0.6, vol: 0.12, f: 6000, f2: 300, type: 'bandpass', q: 1.5 }); }],
    impact:  [100, () => { noise({ dur: 0.8, vol: 0.3, f: 1600, f2: 60 }); tone({ f: 70, f2: 25, type: 'sine', dur: 0.8, vol: 0.3 }); }],
    snare:   [200, () => { [392, 494, 587, 740].forEach((f, i) => tone({ f, type: 'sine', dur: 0.5, vol: 0.04, at: i * 0.04, send: 0.5 })); }],
    bossdie: [500, () => { noise({ dur: 1.4, vol: 0.3, f: 2000, f2: 50 }); tone({ f: 120, f2: 20, type: 'sawtooth', dur: 1.4, vol: 0.15 }); }],
    wave:    [300, () => { [440, 554, 659].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.3, vol: 0.05, at: i * 0.08, send: 0.4 })); }],
    victory: [1000, () => { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.4, vol: 0.07, at: i * 0.12, send: 0.4 })); }],
    defeat:  [1000, () => { [392, 349, 311, 262].forEach((f, i) => tone({ f, type: 'sawtooth', dur: 0.6, vol: 0.05, at: i * 0.25, send: 0.4 })); }],
  };
  function this_coin() { defs.coin[1](); }

  function play(name) {
    if (!ac || !settings.sfx || ac.state !== 'running') return;
    const d = defs[name];
    if (!d) return;
    const now = performance.now();
    if (now - (last[name] || 0) < d[0] || voices > 48) return;
    last[name] = now;
    d[1]();
  }

  function setSfx(on) { settings.sfx = on; if (sfxBus) sfxBus.gain.setTargetAtTime(on ? 0.9 : 0, ac.currentTime, 0.05); }
  function setMusic(on) { settings.music = on; if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.3 : 0, ac.currentTime, 0.3); }

  // ---------- Generative score: D minor, i-VI-III-VII, slow and wide ----------
  const Music = {
    on: false, step: 0, next: 0, timer: 0, intensity: 0,
    chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]],
    start() {
      if (this.on || !ac) return;
      this.on = true; this.next = ac.currentTime + 0.2; this.step = 0;
      this.timer = setInterval(() => this.tick(), 120);
    },
    tick() {
      if (!ac || ac.state !== 'running') return;
      while (this.next < ac.currentTime + 0.4) { this.note(this.step, this.next); this.next += 0.36; this.step++; }
    },
    hz: m => 440 * Math.pow(2, (m - 69) / 12),
    note(step, t) {
      if (!settings.music) return;
      const at = t - ac.currentTime;
      const bar = Math.floor(step / 8), chord = this.chords[bar % 4], s = step % 8;
      if (s === 0) {
        for (const m of chord) {
          for (const det of [-6, 6]) {
            const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
            o.type = 'sawtooth'; o.frequency.value = this.hz(m); o.detune.value = det;
            f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 0.5;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.018, t + 1.0);
            g.gain.linearRampToValueAtTime(0.0001, t + 3.0);
            o.connect(f); f.connect(g); g.connect(musicBus);
            o.start(t); o.stop(t + 3.1); track(o);
          }
        }
        tone({ f: this.hz(chord[0] - 12), type: 'triangle', dur: 2.6, vol: 0.07, at, a: 0.05, bus: musicBus });
      }
      const arp = [0, 1, 2, 1, 2, 0, 1, 2][s];
      if (Math.random() < 0.82) {
        const m = chord[arp] + 12 + (s === 7 && Math.random() < 0.3 ? 12 : 0);
        tone({ f: this.hz(m), type: 'triangle', dur: 0.5, vol: 0.03, at, a: 0.01, bus: musicBus, send: 0.55 });
      }
      if (this.intensity > 0.5) {
        if (s % 4 === 0) tone({ f: 110, f2: 42, type: 'sine', dur: 0.3, vol: 0.12, at, bus: musicBus });
        if (s % 2 === 1) noise({ dur: 0.05, vol: 0.02, f: 7000, type: 'highpass', at, bus: musicBus });
        if (s === 6) noise({ dur: 0.15, vol: 0.04, f: 1500, type: 'bandpass', at, bus: musicBus });
      }
    },
  };

  return {
    init, play, setSfx, setMusic, settings,
    get ready() { return !!ac; },
    set intensity(v) { Music.intensity = v; },
  };
})();
