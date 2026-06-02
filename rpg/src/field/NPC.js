/**
 * field/NPC.js
 * @layer presentation(field)
 * マップNPC。話しかけ対象。簡易な徘徊（randomウォーク）に対応。
 * イベントは pages（条件分岐ページ）を持つ（§4-3）。
 */
import { TILE, WALK_SPEED, DIR_VEC } from '../config/constants.js';

export class NPC {
  constructor(def) {
    this.def = def;
    this.gx = def.x; this.gy = def.y;
    this.px = this.gx * TILE; this.py = this.gy * TILE;
    this.dir = def.dir || 'down';
    this.color = def.color || '#e3c36b';
    this.moving = false; this.tx = this.px; this.ty = this.py;
    this.frame = 0; this.animTimer = 0;
    this.wander = def.wander || false;
    this._wanderCd = 60 + Math.floor(Math.random() * 120);
    this.pages = def.pages || null;   // インラインpages
    this.eventId = def.eventId || null; // 外部eventファイル参照
    this.visible = def.visible !== false;
  }

  facePlayer(player) {
    const dx = player.gx - this.gx, dy = player.gy - this.gy;
    if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left';
    else this.dir = dy > 0 ? 'down' : 'up';
  }

  update(map, occupants) {
    if (this.moving) {
      const dx = this.tx - this.px, dy = this.ty - this.py;
      if (Math.abs(dx) <= WALK_SPEED) this.px = this.tx; else this.px += Math.sign(dx) * WALK_SPEED;
      if (Math.abs(dy) <= WALK_SPEED) this.py = this.ty; else this.py += Math.sign(dy) * WALK_SPEED;
      if (this.px === this.tx && this.py === this.ty) this.moving = false;
      this.animTimer++; if (this.animTimer >= 10) { this.animTimer = 0; this.frame ^= 1; }
      return;
    }
    if (this.wander && --this._wanderCd <= 0) {
      this._wanderCd = 90 + Math.floor(Math.random() * 150);
      const dirs = ['up', 'down', 'left', 'right'];
      const d = dirs[Math.floor(Math.random() * 4)];
      const v = DIR_VEC[d]; const nx = this.gx + v.x, ny = this.gy + v.y;
      this.dir = d;
      if (map.isPassable(nx, ny, occupants.filter((o) => o !== this))) {
        this.gx = nx; this.gy = ny; this.tx = nx * TILE; this.ty = ny * TILE; this.moving = true;
      }
    }
  }

  draw(r, assets, camX, camY) {
    if (!this.visible) return;
    assets.drawActor(r.ctx, this.px - camX, this.py - camY, this.color, this.dir, this.frame);
  }
}
