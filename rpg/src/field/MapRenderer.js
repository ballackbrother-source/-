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

  /** 点光源演出（宝箱のきらめき・玄関ランタン）。ambientの上に加算で重ねる */
  drawLights(r, camX, camY, t = 0) {
    const c = r.ctx;
    const x0 = Math.floor(camX / TILE), y0 = Math.floor(camY / TILE);
    const x1 = Math.ceil((camX + VIEW_W) / TILE), y1 = Math.ceil((camY + VIEW_H) / TILE);
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const o = this.map.objectAt(x, y); if (!o) continue;
        const px = x * TILE - camX + TILE / 2, py = y * TILE - camY + TILE / 2;
        if (o === 'door') {
          const fl = 0.8 + 0.2 * Math.sin(t * 0.18 + x * 1.3 + y); // ゆらぐ灯り
          const g = c.createRadialGradient(px, py - 2, 2, px, py - 2, 28);
          g.addColorStop(0, `rgba(255,196,110,${0.5 * fl})`); g.addColorStop(1, 'rgba(255,150,60,0)');
          c.fillStyle = g; c.beginPath(); c.arc(px, py - 2, 28, 0, 7); c.fill();
        } else if (o === 'chest') {
          const g = c.createRadialGradient(px, py, 1, px, py, 18);
          g.addColorStop(0, 'rgba(255,224,120,0.5)'); g.addColorStop(1, 'rgba(255,210,70,0)');
          c.fillStyle = g; c.beginPath(); c.arc(px, py, 18, 0, 7); c.fill();
          const tw = t * 0.05 + x + y, k = Math.abs(Math.sin(tw)); // 周回するきらめき
          this._spark(c, px + Math.cos(tw * 1.3) * 10, py - 6 + Math.sin(tw * 1.3) * 4, 2 + 2.5 * k, `rgba(255,255,235,${0.35 + 0.6 * k})`);
        }
      }
    }
    c.restore();
  }

  _spark(c, x, y, s, color) {
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(x, y - s); c.lineTo(x + s * 0.3, y - s * 0.3); c.lineTo(x + s, y); c.lineTo(x + s * 0.3, y + s * 0.3);
    c.lineTo(x, y + s); c.lineTo(x - s * 0.3, y + s * 0.3); c.lineTo(x - s, y); c.lineTo(x - s * 0.3, y - s * 0.3);
    c.closePath(); c.fill();
  }
}
