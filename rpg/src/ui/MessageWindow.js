/**
 * ui/MessageWindow.js
 * @layer presentation(ui)
 * 会話ウィンドウ。タイプライタ表示＋送り待ち。Promiseで完了を通知する。
 * シーンの update(input) / render(r) から駆動される。
 */
import { VIEW_W, VIEW_H, COLORS } from '../config/constants.js';

const SPEED = { slow: 1, normal: 2, fast: 4, instant: 999 };

export class MessageWindow {
  constructor(settings, assets = null, db = null) {
    this.settings = settings;
    this.assets = assets; this.db = db;
    this.active = false;
    this.text = ''; this.name = ''; this.faceData = null;
    this.shown = 0; this._resolve = null;
    this.x = 24; this.w = VIEW_W - 48; this.h = 120;
    this.y = VIEW_H - this.h - 16;
    this.blink = 0;
  }

  show(text, opts = {}) {
    // 配列で渡された場合は改行連結（防御的）。横幅に合わせて自動折り返し。
    const raw = Array.isArray(text) ? text.join('\n') : (text || '');
    this.name = opts.name || '';
    this.faceData = this._resolveFace(opts.face, this.name);
    this.text = this._wrap(raw);
    this.shown = 0; this.active = true;
    return new Promise((res) => { this._resolve = res; });
  }

  /** face指定 or 名前から 顔データ（色/髪/装い）を決める */
  _resolveFace(face, name) {
    const db = this.db; if (!db) return null;
    let def = (face && db.getCharacter(face)) || null;
    if (!def && name) {
      for (const id of Object.keys(db.characters || {})) {
        if (db.getCharacter(id).name === name) { def = db.getCharacter(id); break; }
      }
    }
    if (def) return { color: def.color || '#4fb2ff', hair: def.hair || '#5a3a26' };
    if (!name) return null;
    let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return { color: `hsl(${h % 360},42%,54%)`, hair: '#4a3424' };
  }

  /** ウィンドウ幅に合わせて改行を挿入（全角想定） */
  _wrap(text) {
    const pad = this.faceData ? 110 : 40;
    const maxC = Math.max(8, Math.floor((this.w - pad) / 17));
    const out = [];
    for (const para of String(text).split('\n')) {
      if (para.length <= maxC) { out.push(para); continue; }
      for (let i = 0; i < para.length; i += maxC) out.push(para.slice(i, i + maxC));
    }
    return out.join('\n');
  }

  get revealed() { return this.shown >= this.text.length; }

  update(input, audio) {
    if (!this.active) return;
    this.blink = (this.blink + 1) % 60;
    const speed = SPEED[this.settings.textSpeed] ?? 2;
    if (!this.revealed) {
      const before = this.shown;
      this.shown = Math.min(this.text.length, this.shown + speed);
      // タイプ音（ごく小・送り出した文字に空白/改行が無いときだけ、少し間引いて）
      const ch = this.text[this.shown - 1];
      if (speed < 999 && this.shown > before && ch && ch !== ' ' && ch !== '\n' && (this.shown & 1) === 0) audio?.se('text');
    }

    if (input.isPressed('confirm') || input.isPressed('cancel')) {
      if (!this.revealed) { this.shown = this.text.length; }
      else {
        audio?.se('cursor');
        this.active = false;
        const r = this._resolve; this._resolve = null; r?.();
      }
    }
  }

  render(r) {
    if (!this.active) return;
    r.window(this.x, this.y, this.w, this.h);
    const hasFace = this.faceData && this.assets;
    // 顔（左側のポートレート）
    if (hasFace) {
      const fx = this.x + 46, fy = this.y + this.h / 2;
      const c = r.ctx;
      c.save(); c.fillStyle = 'rgba(8,12,28,0.5)'; c.beginPath(); c.arc(fx, fy, 34, 0, 7); c.fill();
      c.lineWidth = 2; c.strokeStyle = '#3a6ea5'; c.beginPath(); c.arc(fx, fy, 34, 0, 7); c.stroke(); c.restore();
      this.assets.drawFace(r.ctx, fx, fy - 4, 22, this.faceData);
    }
    if (this.name) {
      const nx = hasFace ? this.x + 78 : this.x;
      r.window(nx, this.y - 30, 140, 30);
      r.text(this.name, nx + 14, this.y - 24, { size: 16, color: COLORS.selected });
    }
    // 改行対応の本文（\nで改行）。顔があるぶん字下げ
    const textX = this.x + (hasFace ? 92 : 18);
    const visible = this.text.slice(0, this.shown);
    const lines = visible.split('\n');
    lines.forEach((ln, i) => r.text(ln, textX, this.y + 16 + i * 26, { size: 18 }));
    // 送り三角（点滅＋上下に小さく動く）
    if (this.revealed) {
      const bob = Math.sin(this.blink * 0.2) * 2;
      const a = 0.55 + 0.45 * Math.sin(this.blink * 0.18);
      r.save(); r.alpha(a);
      r.text('▼', this.x + this.w - 28, this.y + this.h - 26 + bob, { size: 16, color: COLORS.selected });
      r.restore();
    }
  }
}
