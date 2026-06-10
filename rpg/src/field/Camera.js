/**
 * field/Camera.js
 * @layer presentation(field)
 * プレイヤー追従カメラ。マップ端ではクランプ。ピクセル単位。
 */
import { TILE, VIEW_W, VIEW_H } from '../config/constants.js';
import { clamp } from '../core/util.js';

export class Camera {
  constructor(map) { this.map = map; this.x = 0; this.y = 0; }

  follow(px, py) {
    const maxX = Math.max(0, this.map.width * TILE - VIEW_W);
    const maxY = Math.max(0, this.map.height * TILE - VIEW_H);
    this.x = clamp(Math.round(px + TILE / 2 - VIEW_W / 2), 0, maxX);
    this.y = clamp(Math.round(py + TILE / 2 - VIEW_H / 2), 0, maxY);
  }
}
