/**
 * ui/MessageWindow.js
 * @layer presentation(ui)
 * 会話ウィンドウ。タイプライタ表示＋送り待ち。Promiseで完了を通知する。
 * シーンの update(input) / render(r) から駆動される。
 */
import { VIEW_W, VIEW_H, COLORS } from '../config/constants.js';

const SPEED = { slow: 1, normal: 2, fast: 4, instant: 999 };

export class MessageWindow {
  constructor(settings) {
    this.settings = settings;
    this.active = false;
    this.text = ''; this.name = '';
    this.shown = 0; this._resolve = null;
    this.x = 24; this.w = VIEW_W - 48; this.h = 120;
    this.y = VIEW_H - this.h - 16;
    this.blink = 0;
  }

  show(text, opts = {}) {
    // 配列で渡された場合は改行連結（防御的）。1ボックスに複数行表示。
    this.text = Array.isArray(text) ? text.join('\n') : (text || '');
    this.name = opts.name || '';
    this.shown = 0; this.active = true;
    return new Promise((res) => { this._resolve = res; });
  }

  get revealed() { return this.shown >= this.text.length; }

  update(input, audio) {
    if (!this.active) return;
    this.blink = (this.blink + 1) % 60;
    const speed = SPEED[this.settings.textSpeed] ?? 2;
    if (!this.revealed) this.shown = Math.min(this.text.length, this.shown + speed);

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
    if (this.name) {
      r.window(this.x, this.y - 30, 140, 30);
      r.text(this.name, this.x + 14, this.y - 24, { size: 16, color: COLORS.selected });
    }
    // 改行対応の本文（\nで改行）
    const visible = this.text.slice(0, this.shown);
    const lines = visible.split('\n');
    lines.forEach((ln, i) => r.text(ln, this.x + 18, this.y + 16 + i * 26, { size: 18 }));
    // 送り三角（点滅）
    if (this.revealed && this.blink < 30) {
      r.text('▼', this.x + this.w - 28, this.y + this.h - 26, { size: 16, color: COLORS.selected });
    }
  }
}
