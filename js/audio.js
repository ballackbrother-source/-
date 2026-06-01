/* ============================================================
   audio.js : Web Audio synthesised BGM (chiptune) + SFX.
   No audio files. Everything generated procedurally.
   ============================================================ */
(function () {
  "use strict";
  const NL = window.NL;

  const A = (NL.audio = {});
  let ctx = null;
  let master = null, musicGain = null, sfxGain = null;
  let started = false;
  A.muted = false;
  A.musicVol = 0.5;
  A.sfxVol = 0.7;

  A.init = function () {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = A.musicVol; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = A.sfxVol; sfxGain.connect(master);
    // gentle master limiter
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.ratio.value = 12; comp.attack.value = 0.003; comp.release.value = 0.25;
    master.disconnect(); master.connect(comp); comp.connect(ctx.destination);
  };

  A.resume = function () {
    if (!ctx) A.init();
    if (ctx && ctx.state === "suspended") ctx.resume();
    started = true;
  };

  A.setMute = function (m) {
    A.muted = m;
    if (master) master.gain.value = m ? 0 : 0.9;
  };
  A.toggleMute = function () { A.setMute(!A.muted); return A.muted; };

  function now() { return ctx ? ctx.currentTime : 0; }

  // ---- One-shot oscillator voice -----------------------------------------
  function blip(opt) {
    if (!ctx || A.muted) return;
    const t = now();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opt.type || "square";
    o.frequency.setValueAtTime(opt.f0, t);
    if (opt.f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, opt.f1), t + opt.dur);
    const peak = (opt.gain == null ? 0.3 : opt.gain);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (opt.atk || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opt.dur);
    o.connect(g);
    let node = g;
    if (opt.filter) {
      const f = ctx.createBiquadFilter();
      f.type = opt.filter; f.frequency.value = opt.fco || 1200;
      g.connect(f); node = f;
    }
    node.connect(opt.bus || sfxGain);
    o.start(t); o.stop(t + opt.dur + 0.02);
  }

  // ---- Noise burst (explosions, hits) ------------------------------------
  let noiseBuf = null;
  function getNoise() {
    if (noiseBuf) return noiseBuf;
    const n = ctx.sampleRate * 1.0;
    noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function noise(opt) {
    if (!ctx || A.muted) return;
    const t = now();
    const src = ctx.createBufferSource();
    src.buffer = getNoise();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = opt.filter || "lowpass";
    f.frequency.setValueAtTime(opt.fco0 || 1800, t);
    if (opt.fco1 != null) f.frequency.exponentialRampToValueAtTime(Math.max(80, opt.fco1), t + opt.dur);
    const peak = opt.gain == null ? 0.4 : opt.gain;
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opt.dur);
    src.connect(f); f.connect(g); g.connect(opt.bus || sfxGain);
    src.start(t); src.stop(t + opt.dur + 0.02);
  }

  // ---- SFX library --------------------------------------------------------
  A.sfx = {
    shot()    { blip({ type: "square", f0: 880, f1: 360, dur: 0.08, gain: 0.16, filter: "lowpass", fco: 2600 }); },
    double()  { blip({ type: "square", f0: 760, f1: 300, dur: 0.09, gain: 0.14 }); blip({ type: "square", f0: 1100, f1: 480, dur: 0.07, gain: 0.1 }); },
    spread()  { blip({ type: "sawtooth", f0: 620, f1: 260, dur: 0.1, gain: 0.12, filter: "lowpass", fco: 2200 }); },
    laser()   { blip({ type: "sawtooth", f0: 1300, f1: 900, dur: 0.13, gain: 0.12, filter: "bandpass", fco: 1600 }); },
    missile() { noise({ fco0: 900, fco1: 200, dur: 0.22, gain: 0.22 }); blip({ type: "triangle", f0: 320, f1: 90, dur: 0.2, gain: 0.12 }); },
    powerup() { blip({ type: "square", f0: 520, f1: 1040, dur: 0.16, gain: 0.22 }); setTimeout(() => blip({ type: "square", f0: 780, f1: 1560, dur: 0.14, gain: 0.18 }), 70); },
    capsule() { blip({ type: "triangle", f0: 1200, f1: 1700, dur: 0.07, gain: 0.18 }); },
    hit()     { noise({ fco0: 3200, fco1: 1200, dur: 0.05, gain: 0.18, filter: "highpass" }); },
    enemyDie(){ noise({ fco0: 1400, fco1: 200, dur: 0.22, gain: 0.3 }); blip({ type: "square", f0: 240, f1: 60, dur: 0.18, gain: 0.12 }); },
    bigBoom() { noise({ fco0: 1800, fco1: 60, dur: 0.7, gain: 0.5 }); blip({ type: "triangle", f0: 160, f1: 40, dur: 0.6, gain: 0.18 }); },
    bossHit() { blip({ type: "square", f0: 200, f1: 120, dur: 0.06, gain: 0.14 }); noise({ fco0: 2000, fco1: 600, dur: 0.06, gain: 0.14, filter: "bandpass" }); },
    playerHit(){ noise({ fco0: 2400, fco1: 120, dur: 0.5, gain: 0.45 }); blip({ type: "sawtooth", f0: 300, f1: 50, dur: 0.45, gain: 0.2 }); },
    shieldHit(){ blip({ type: "sine", f0: 1400, f1: 600, dur: 0.18, gain: 0.2, filter: "bandpass", fco: 1400 }); },
    warn()    { blip({ type: "square", f0: 660, f1: 660, dur: 0.12, gain: 0.16 }); setTimeout(() => blip({ type: "square", f0: 660, f1: 660, dur: 0.12, gain: 0.16 }), 150); },
    select()  { blip({ type: "square", f0: 900, f1: 900, dur: 0.05, gain: 0.16 }); },
    start()   { blip({ type: "square", f0: 440, f1: 880, dur: 0.18, gain: 0.22 }); setTimeout(() => blip({ type: "square", f0: 880, f1: 1320, dur: 0.2, gain: 0.2 }), 120); },
    gameover(){ const seq = [392, 330, 294, 196]; seq.forEach((f, i) => setTimeout(() => blip({ type: "triangle", f0: f, f1: f * 0.6, dur: 0.4, gain: 0.2 }), i * 220)); },
    clear()   { const seq = [523, 659, 784, 1046]; seq.forEach((f, i) => setTimeout(() => blip({ type: "square", f0: f, f1: f, dur: 0.22, gain: 0.2 }), i * 130)); }
  };

  // ---- Sequenced chiptune BGM --------------------------------------------
  // Each track: tempo + arrays of notes (semitone offsets, 0=rest as null).
  const NOTE = (n) => 440 * Math.pow(2, (n - 9) / 12); // n: MIDI-ish, 60=C4 -> handle below
  function midi(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  const SCALE_MIN = [0, 2, 3, 5, 7, 8, 10]; // natural minor

  const TRACKS = {
    title: { bpm: 96, root: 57, // A3
      lead: [0,7,12,7, 3,10,15,10, 5,12,17,12, 3,10,7,3],
      bass: [-12,-12,-5,-5,-12,-12,-7,-7],
      mood: 0.7 },
    stage1: { bpm: 132, root: 57,
      lead: [0,3,7,10, 7,3,0,-2, 5,8,12,8, 3,7,10,7],
      bass: [-12,-12,0,-12,-7,-7,0,-7],
      mood: 1.0 },
    stage2: { bpm: 124, root: 55, // G3 darker
      lead: [0,5,7,3, 0,-2,-5,-2, 3,7,10,7, 5,3,0,-5],
      bass: [-12,-12,-10,-10,-12,-12,-5,-5],
      mood: 0.85 },
    stage3: { bpm: 144, root: 53, // F3 tense
      lead: [0,3,5,7, 10,7,5,3, 0,-2,0,3, 7,10,12,15],
      bass: [-12,-12,-12,-10,-8,-8,-7,-5],
      mood: 1.1 },
    boss: { bpm: 156, root: 50, // D3 heavy
      lead: [0,3,7,3, 0,3,8,3, 5,8,12,8, 3,0,-2,-5],
      bass: [-12,-12,-12,-12,-10,-10,-13,-13],
      mood: 1.3 }
  };

  let musicTimer = null;
  let curTrack = null;
  let step = 0;

  function scaleNote(root, deg) {
    const oct = Math.floor(deg / 7);
    let idx = deg % 7; if (idx < 0) { idx += 7; }
    return root + 60 - 57 + 0 + oct * 12 + SCALE_MIN[idx]; // map to midi-ish around root
  }

  function playStep(tr) {
    if (!ctx || A.muted) return;
    const beat = 60 / tr.bpm / 2; // 8th notes
    const li = step % tr.lead.length;
    const bi = step % tr.bass.length;
    const ld = tr.lead[li];
    const bd = tr.bass[bi];
    const mood = tr.mood || 1;

    // bass (every step)
    if (bd != null) {
      const m = scaleNote(tr.root, bd) ;
      blip({ type: "triangle", f0: midi(m + 0), dur: beat * 1.6, gain: 0.18 * mood, bus: musicGain, atk: 0.008 });
    }
    // lead (square arpeggio)
    if (ld != null && step % 1 === 0) {
      const m = scaleNote(tr.root, ld);
      blip({ type: "square", f0: midi(m + 12), dur: beat * 0.9, gain: 0.12 * mood, bus: musicGain, filter: "lowpass", fco: 3000 });
      // soft echo
      setTimeout(() => blip({ type: "square", f0: midi(m + 12), dur: beat * 0.5, gain: 0.05 * mood, bus: musicGain }), beat * 1000 * 0.5);
    }
    // hi-hat-ish noise on offbeats
    if (step % 2 === 1) noise({ fco0: 9000, fco1: 6000, dur: 0.03, gain: 0.05 * mood, filter: "highpass", bus: musicGain });
    // kick on downbeats
    if (step % 4 === 0) { blip({ type: "sine", f0: 120, f1: 45, dur: 0.14, gain: 0.3 * mood, bus: musicGain }); }
    step++;
  }

  A.playMusic = function (name) {
    if (!ctx) A.init();
    if (curTrack === name && musicTimer) return;
    A.stopMusic();
    const tr = TRACKS[name];
    if (!tr) return;
    curTrack = name; step = 0;
    const interval = (60 / tr.bpm / 2) * 1000;
    musicTimer = setInterval(() => playStep(tr), interval);
  };
  A.stopMusic = function () {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    curTrack = null;
  };
  A.currentTrack = () => curTrack;

})();
