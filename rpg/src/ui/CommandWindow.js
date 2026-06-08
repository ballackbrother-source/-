/**
 * ui/CommandWindow.js
 * @layer presentation(ui)
 * 再利用可能な縦型コマンドリスト（カーソル選択）。Promiseを使わず、
 * シーンのupdateループから同期的に駆動する（タイトル/戦闘/メニュー用）。
 */
import { COLORS } from '../config/constants.js';

export class CommandWindow {
  constructor(items = [], opts = {}) {
    this.items = items;          // [{label, value, disabled?, sub?}]
    this.index = 0;
    this.cols = opts.cols || 1;
    this.lineH = opts.lineH || 30;
    this.title = opts.title || '';
  }

  setItems(items) { this.items = items; if (this.index >= items.length) this.index = Math.max(0, items.length - 1); }
  get current() { return this.items[this.index]; }

  /** @returns {'confirm'|'cancel'|null} 確定/キャンセルの結果 */
  update(input, audio) {
    const n = this.items.length;
    if (n === 0) return input.isPressed('cancel') ? 'cancel' : null;
    const rows = Math.ceil(n / this.cols);
    let moved = false;
    if (input.isPressed('up'))    { this.index = (this.index - this.cols + n) % n; moved = true; }
    if (input.isPressed('down'))  { this.index = (this.index + this.cols) % n; moved = true; }
    if (this.cols > 1) {
      if (input.isPressed('left'))  { this.index = (this.index - 1 + n) % n; moved = true; }
      if (input.isPressed('right')) { this.index = (this.index + 1) % n; moved = true; }
    }
    if (moved) audio?.se('cursor');
    if (input.isPressed('confirm')) {
      if (this.current?.disabled) { audio?.se('cancel'); return null; }
      audio?.se('confirm'); return 'confirm';
    }
    if (input.isPressed('cancel')) { audio?.se('cancel'); return 'cancel'; }
    return null;
  }

  render(r, x, y, w, assets) {
    let oy = y;
    if (this.title) { r.text(this.title, x, oy, { size: 16, color: COLORS.textDim }); oy += 26; }
    const colW = w / this.cols;
    this.items.forEach((it, i) => {
      const col = i % this.cols, row = Math.floor(i / this.cols);
      const ix = x + col * colW, iy = oy + row * this.lineH;
      const sel = i === this.index;
      const color = it.disabled ? '#6b7390' : (sel ? COLORS.selected : COLORS.text);
      if (sel) {
        const c = r.ctx, now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const pulse = 0.12 + 0.06 * (0.5 + 0.5 * Math.sin(now / 200)); // 選択ハイライト（脈動）
        c.save(); c.globalAlpha = pulse; c.fillStyle = COLORS.selected;
        r.roundPath(ix - 3, iy - 3, colW - 6, this.lineH - 4, 5); c.fill(); c.restore();
        const cb = 2 + Math.sin(now / 150) * 2; // カーソルが軽く前後に動く
        r.text('▶', ix + cb, iy, { size: 18, color: COLORS.selected });
      }
      const hasIcon = it.icon && assets;
      if (hasIcon) assets.drawIcon(r.ctx, ix + 26, iy + 9, 7.5, it.icon);
      r.text(it.label, ix + (hasIcon ? 42 : 22), iy, { size: 18, color });
      if (it.sub != null) r.text(it.sub, ix + colW - 70, iy, { size: 16, color, align: 'left' });
    });
  }
}
