/**
 * ui/HUD.js
 * @layer presentation(ui)
 * 探索中の軽量HUD（場所名・オートセーブ表示の一時バッジ）。
 */
import { VIEW_W, COLORS } from '../config/constants.js';

export class HUD {
  constructor() { this.locationTimer = 0; this.locationName = ''; this.saveTimer = 0; }

  showLocation(name) { this.locationName = name; this.locationTimer = 150; }
  showSave() { this.saveTimer = 120; }

  update() {
    if (this.locationTimer > 0) this.locationTimer--;
    if (this.saveTimer > 0) this.saveTimer--;
  }

  render(r, gold) {
    // 場所名（マップ進入時に数秒）
    if (this.locationTimer > 0) {
      const a = Math.min(1, this.locationTimer / 30);
      r.save(); r.alpha(a);
      r.window(VIEW_W / 2 - 110, 16, 220, 38);
      r.text(this.locationName, VIEW_W / 2, 26, { size: 18, align: 'center', color: COLORS.selected });
      r.restore();
    }
    // オートセーブ表示（右上に一瞬）
    if (this.saveTimer > 0) {
      const aIn = Math.min(1, (120 - this.saveTimer) / 10);
      const aOut = Math.min(1, this.saveTimer / 30);
      r.save(); r.alpha(Math.min(aIn, aOut));
      const w = 162, x = VIEW_W - w - 14, y = 14;
      r.window(x, y, w, 30);
      this._floppy(r.ctx, x + 19, y + 15, this.saveTimer);
      r.text('セーブしました', x + 36, y + 8, { size: 13, color: COLORS.selected });
      r.restore();
    }
  }

  _floppy(c, cx, cy, t) {
    c.save(); c.translate(cx, cy);
    c.fillStyle = '#9fc4e8'; c.beginPath(); c.rect(-6, -6, 12, 12); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 1; c.strokeRect(-6, -6, 12, 12);
    c.fillStyle = '#2a3550'; c.fillRect(-3, -6, 6, 4);      // 上のシャッター
    c.fillStyle = '#eef3ff'; c.fillRect(-4, 1, 8, 5);       // ラベル
    // 書き込み中の点滅ランプ
    c.fillStyle = `rgba(124,240,138,${0.4 + 0.6 * Math.abs(Math.sin(t * 0.2))})`;
    c.beginPath(); c.arc(3.5, -3.5, 1.3, 0, 7); c.fill();
    c.restore();
  }
}
