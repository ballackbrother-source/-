/**
 * field/MapRenderer.js
 * @layer presentation(field)
 * タイルマップ＋アクターをCanvasへ描画。カメラ範囲のタイルのみ描く。
 */
import { TILE, VIEW_W, VIEW_H } from '../config/constants.js';

export class MapRenderer {
  constructor(map, assets) { this.map = map; this.assets = assets; }

  draw(r, camX, camY, actors) {
    const x0 = Math.floor(camX / TILE), y0 = Math.floor(camY / TILE);
    const x1 = Math.ceil((camX + VIEW_W) / TILE), y1 = Math.ceil((camY + VIEW_H) / TILE);

    // 地面レイヤ
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!this.map.inBounds(x, y)) { r.rect(x * TILE - camX, y * TILE - camY, TILE, TILE, '#05070f'); continue; }
        r.sprite(this.assets.tile(this.map.groundAt(x, y)), x * TILE - camX, y * TILE - camY);
      }
    }
    // オブジェクトレイヤ
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const o = this.map.objectAt(x, y);
        if (o) r.sprite(this.assets.tile(o), x * TILE - camX, y * TILE - camY);
      }
    }
    // アクター（Y座標でソートして奥行き表現）
    const sorted = [...actors].filter((a) => a.visible !== false).sort((a, b) => a.py - b.py);
    for (const a of sorted) a.draw(r, this.assets, camX, camY);
  }
}
