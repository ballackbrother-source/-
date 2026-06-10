/**
 * ui/ChoiceWindow.js
 * @layer presentation(ui)
 * 選択肢ウィンドウ。show(options)→Promise<選択index>。
 */
import { VIEW_W, COLORS } from '../config/constants.js';

export class ChoiceWindow {
  constructor() {
    this.active = false; this.options = []; this.index = 0;
    this._resolve = null; this.prompt = '';
  }

  show(options, prompt = '') {
    this.options = options; this.index = 0; this.prompt = prompt; this.active = true;
    return new Promise((res) => { this._resolve = res; });
  }

  update(input, audio) {
    if (!this.active) return;
    if (input.isPressed('up'))   { this.index = (this.index - 1 + this.options.length) % this.options.length; audio?.se('cursor'); }
    if (input.isPressed('down')) { this.index = (this.index + 1) % this.options.length; audio?.se('cursor'); }
    if (input.isPressed('confirm')) {
      audio?.se('confirm');
      this.active = false;
      const r = this._resolve; this._resolve = null; r?.(this.index);
    }
  }

  render(r) {
    if (!this.active) return;
    const w = 240;
    const h = this.options.length * 30 + 20 + (this.prompt ? 28 : 0);
    const x = VIEW_W - w - 28, y = 120;
    r.window(x, y, w, h);
    let oy = y + 12;
    if (this.prompt) { r.text(this.prompt, x + 16, oy, { size: 16, color: COLORS.textDim }); oy += 28; }
    this.options.forEach((opt, i) => {
      const sel = i === this.index;
      if (sel) r.text('▶', x + 12, oy + i * 30, { size: 18, color: COLORS.selected });
      r.text(opt, x + 34, oy + i * 30, { size: 18, color: sel ? COLORS.selected : COLORS.text });
    });
  }
}
