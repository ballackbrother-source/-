/**
 * ui/HUD.js
 * @layer presentation(ui)
 * 探索中の軽量HUD（所持金・場所名の一時表示）。
 */
import { VIEW_W, COLORS } from '../config/constants.js';

export class HUD {
  constructor() { this.locationTimer = 0; this.locationName = ''; }

  showLocation(name) { this.locationName = name; this.locationTimer = 150; }

  update() { if (this.locationTimer > 0) this.locationTimer--; }

  render(r, gold) {
    // 場所名（マップ進入時に数秒）
    if (this.locationTimer > 0) {
      const a = Math.min(1, this.locationTimer / 30);
      r.save(); r.alpha(a);
      r.window(VIEW_W / 2 - 110, 16, 220, 38);
      r.text(this.locationName, VIEW_W / 2, 26, { size: 18, align: 'center', color: COLORS.selected });
      r.restore();
    }
  }
}
