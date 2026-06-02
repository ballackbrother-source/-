/**
 * field/FieldPlayer.js
 * @layer presentation(field)
 * フィールド上のプレイヤー。グリッド移動＋ピクセル補間＋歩行アニメ。
 */
import { TILE, WALK_SPEED, DIR_VEC } from '../config/constants.js';

export class FieldPlayer {
  constructor(gx, gy, dir = 'down', color = '#4fb2ff') {
    this.gx = gx; this.gy = gy;
    this.px = gx * TILE; this.py = gy * TILE;
    this.dir = dir; this.color = color;
    this.moving = false;
    this.tx = this.px; this.ty = this.py; // 目標ピクセル
    this.animTimer = 0; this.frame = 0;
  }

  setPos(gx, gy, dir = this.dir) {
    this.gx = gx; this.gy = gy; this.dir = dir;
    this.px = this.tx = gx * TILE; this.py = this.ty = gy * TILE;
    this.moving = false;
  }

  /** 指定方向への1マス移動を試みる。成功でtrue */
  tryMove(dir, map, occupants) {
    this.dir = dir;
    const v = DIR_VEC[dir];
    const nx = this.gx + v.x, ny = this.gy + v.y;
    if (!map.isPassable(nx, ny, occupants)) return false;
    this.gx = nx; this.gy = ny;
    this.tx = nx * TILE; this.ty = ny * TILE;
    this.moving = true;
    return true;
  }

  /** 目の前のマス座標 */
  front() {
    const v = DIR_VEC[this.dir];
    return { x: this.gx + v.x, y: this.gy + v.y };
  }

  update() {
    if (this.moving) {
      const dx = this.tx - this.px, dy = this.ty - this.py;
      if (Math.abs(dx) <= WALK_SPEED) this.px = this.tx; else this.px += Math.sign(dx) * WALK_SPEED;
      if (Math.abs(dy) <= WALK_SPEED) this.py = this.ty; else this.py += Math.sign(dy) * WALK_SPEED;
      if (this.px === this.tx && this.py === this.ty) this.moving = false;
      // 歩行アニメ
      this.animTimer += 1;
      if (this.animTimer >= 8) { this.animTimer = 0; this.frame ^= 1; }
    } else {
      this.frame = 0;
    }
  }

  draw(r, assets, camX, camY) {
    assets.drawActor(r.ctx, this.px - camX, this.py - camY, this.color, this.dir, this.frame);
  }
}
