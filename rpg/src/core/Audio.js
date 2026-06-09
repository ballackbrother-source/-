/**
 * core/Audio.js
 * @layer core
 * WebAudio による簡易チップチューンBGM＋SE。音声ファイル不要（手続き生成）。
 * AudioContextはユーザー操作後に開始（ブラウザのautoplay制約）。無音でも動作。
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.bgmGain = null; this.seGain = null;
    this.bgmVol = 0.6; this.seVol = 0.8;
    this._bgmTimer = null; this._currentBgm = null;
  }

  /** 最初のユーザー操作で呼ぶ */
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.bgmGain = this.ctx.createGain(); this.bgmGain.gain.value = this.bgmVol;
      this.seGain = this.ctx.createGain();  this.seGain.gain.value = this.seVol;
      this.bgmGain.connect(this.ctx.destination);
      this.seGain.connect(this.ctx.destination);
    } catch (e) { console.warn('[Audio] 初期化不可（無音で継続）', e); }
  }

  setVolumes({ bgmVol, seVol }) {
    if (bgmVol != null) { this.bgmVol = bgmVol; if (this.bgmGain) this.bgmGain.gain.value = bgmVol; }
    if (seVol != null)  { this.seVol = seVol;  if (this.seGain)  this.seGain.gain.value = seVol; }
  }

  _tone(freq, dur, { type = 'square', gain = 0.2, dest = null } = {}) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || this.seGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // --- SE ---
  se(name) {
    if (!this.ctx) return;
    const map = {
      cursor:  () => this._tone(660, 0.06, { type: 'square', gain: 0.12 }),
      text:    () => this._tone(720, 0.016, { type: 'square', gain: 0.045 }), // タイプ音（ごく小）
      confirm: () => { this._tone(880, 0.07); this._tone(1320, 0.09); },
      cancel:  () => this._tone(330, 0.08, { gain: 0.12 }),
      hit:     () => this._tone(180, 0.1, { type: 'sawtooth', gain: 0.18 }),
      heal:    () => { this._tone(880, 0.12, { type: 'sine' }); this._tone(1100, 0.14, { type: 'sine' }); },
      magic:   () => { this._tone(520, 0.1, { type: 'triangle' }); this._tone(780, 0.14, { type: 'triangle' }); },
      levelup: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._tone(f, 0.16, { type: 'triangle' }), i * 90)); },
      open:    () => this._tone(440, 0.1, { type: 'sine' }),
      damage:  () => this._tone(140, 0.12, { type: 'square', gain: 0.16 }),
      crit:    () => { this._tone(220, 0.08, { type: 'sawtooth', gain: 0.2 }); this._tone(1568, 0.12, { type: 'square', gain: 0.14 }); },
      steal:   () => { this._tone(1046, 0.06, { type: 'square', gain: 0.12 }); this._tone(1318, 0.08, { type: 'square', gain: 0.12 }); },
    };
    (map[name] || map.cursor)();
  }

  /** 一発もの（ループしない）。seq=[[freq,durMs], ...]、freq=0で休符 */
  jingle(seq, { gain = 0.12, type = 'triangle' } = {}) {
    if (!this.ctx) return;
    let t = 0;
    for (const [freq, dur] of seq) {
      if (freq) setTimeout(() => this._tone(freq, (dur / 1000) * 0.9, { type, gain, dest: this.bgmGain }), t);
      t += dur;
    }
  }
  /** 勝利ファンファーレ（BGMを止めて一発再生） */
  victory() {
    this.stopBgm();
    this.jingle([[523, 110], [523, 110], [523, 110], [659, 340], [0, 60], [587, 120], [659, 130], [784, 520]]);
  }
  /** 全滅ジングル */
  defeat() {
    this.stopBgm();
    this.jingle([[392, 300], [349, 300], [330, 320], [294, 640]], { gain: 0.1 });
  }

  // --- BGM（簡易ループ。melody=[freq or null, ...]） ---
  playBgm(id) {
    if (this._currentBgm === id) return;
    this.stopBgm();
    this._currentBgm = id;
    if (!this.ctx) return;
    const tracks = BGM[id];
    if (!tracks) return;
    let step = 0;
    const tempo = tracks.tempo || 220;
    const play = () => {
      const note = tracks.melody[step % tracks.melody.length];
      if (note) this._tone(note, tempo / 1000 * 0.9, { type: tracks.type || 'triangle', gain: 0.08, dest: this.bgmGain });
      step++;
    };
    this._bgmTimer = setInterval(play, tempo);
  }
  stopBgm() {
    if (this._bgmTimer) { clearInterval(this._bgmTimer); this._bgmTimer = null; }
    this._currentBgm = null;
  }
}

// 超簡易のメインテーマ等（プレースホルダ。§ロードマップで本実装予定）
const N = { C4: 261, D4: 293, E4: 329, F4: 349, G4: 392, A4: 440, B4: 493, C5: 523, D5: 587, E5: 659, G5: 784 };
const BGM = {
  // メインテーマ（OP/ED兼用の旋律のたたき台）
  theme:  { tempo: 300, type: 'triangle', melody: [N.E4, N.G4, N.A4, N.B4, N.C5, N.B4, N.A4, N.G4, N.E4, null, N.D4, N.E4, N.G4, null] },
  field:  { tempo: 240, type: 'triangle', melody: [N.C4, N.E4, N.G4, N.E4, N.F4, N.A4, N.G4, N.E4, N.D4, N.F4, N.E4, N.C4] },
  battle: { tempo: 180, type: 'square',   melody: [N.A4, N.A4, N.C5, N.A4, N.G4, N.A4, N.E4, null, N.A4, N.B4, N.C5, N.D5] },
  boss:   { tempo: 160, type: 'sawtooth', melody: [N.C4, N.C4, N.D4, N.E4, N.C4, N.E4, N.D4, N.C4, N.B4, N.C5, N.G4, null] },
  town:   { tempo: 280, type: 'triangle', melody: [N.G4, N.A4, N.B4, N.C5, N.B4, N.A4, N.G4, N.E4, N.G4, N.A4, N.G4, null] },
};
