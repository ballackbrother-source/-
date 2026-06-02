/**
 * core/AssetLoader.js
 * @layer core
 * 手続き生成アート。外部画像が無くても動く「プレースホルダ生成器」。
 * - bakeTiles(): タイルチップをオフスクリーンcanvasへ事前描画
 * - drawActor(): フィールドの人物（4方向・歩行2フレーム）を直接描画
 * - drawMonster(): 戦闘モンスターを系統色で直接描画
 * 後から assets/ の本素材へ差し替え可能な構造（差し替えはここだけ）。
 */
import { TILE } from '../config/constants.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return c;
}

export class AssetLoader {
  constructor() { this.tiles = {}; }

  /** 起動時に1回。タイルチップを生成 */
  async bake() {
    this.tiles = {
      grass:    this._tile('#3f8f4a', '#357a40', 'dots'),
      grass2:   this._tile('#4a9c55', '#3f8f4a', 'dots'),
      path:     this._tile('#c8a96b', '#b89656', 'grain'),
      floor:    this._tile('#6b6f87', '#5a5e74', 'tile'),
      floor2:   this._tile('#7a7e96', '#6b6f87', 'tile'),
      wall:     this._tile('#4a4e66', '#3a3e54', 'brick'),
      water:    this._tile('#2f6fb0', '#2a63a0', 'wave'),
      tree:     this._tree(),
      roof:     this._tile('#9c4a3f', '#8a3f36', 'brick'),
      roof2:    this._tile('#c79a3f', '#b58a36', 'brick'),
      door:     this._door(),
      chest:    this._chest(false),
      chestOpen:this._chest(true),
      sign:     this._sign(),
      mountain: this._tile('#6b5d4a', '#5a4d3c', 'rock'),
      flower:   this._flower(),
      stairs:   this._stairs(),
      snow:     this._tile('#dfe7f0', '#cdd6e2', 'dots'),
      sand:     this._tile('#d8c483', '#c8b473', 'grain'),
      darkfloor:this._tile('#2a2440', '#221d36', 'tile'),
    };
    return this;
  }

  tile(name) { return this.tiles[name] || this.tiles.grass; }

  _tile(base, shade, pattern) {
    const c = makeCanvas(TILE, TILE); const x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, TILE, TILE);
    x.fillStyle = shade;
    if (pattern === 'dots') {
      for (let i = 0; i < 6; i++) x.fillRect((i * 7 + 3) % TILE, (i * 11 + 5) % TILE, 2, 2);
    } else if (pattern === 'grain') {
      for (let i = 0; i < TILE; i += 4) x.fillRect(0, i, TILE, 1);
    } else if (pattern === 'tile') {
      x.strokeStyle = shade; x.strokeRect(0.5, 0.5, TILE - 1, TILE - 1);
      x.beginPath(); x.moveTo(TILE / 2, 0); x.lineTo(TILE / 2, TILE); x.stroke();
    } else if (pattern === 'brick') {
      x.strokeStyle = shade;
      for (let y = 0; y < TILE; y += 8) {
        x.strokeRect(0, y, TILE, 8);
        x.strokeRect((y % 16 === 0) ? TILE / 2 : 0, y, 1, 8);
      }
    } else if (pattern === 'wave') {
      x.strokeStyle = '#5fa0d8'; x.lineWidth = 1;
      for (let y = 4; y < TILE; y += 8) {
        x.beginPath();
        for (let xx = 0; xx <= TILE; xx += 4) x.lineTo(xx, y + (xx % 8 === 0 ? 0 : 2));
        x.stroke();
      }
    } else if (pattern === 'rock') {
      x.fillStyle = shade;
      x.fillRect(4, 6, 10, 8); x.fillRect(18, 14, 10, 10); x.fillRect(10, 20, 8, 6);
    }
    return c;
  }
  _tree() {
    const c = makeCanvas(TILE, TILE); const x = c.getContext('2d');
    x.fillStyle = '#3f8f4a'; x.fillRect(0, 0, TILE, TILE);
    x.fillStyle = '#6b4a2f'; x.fillRect(TILE / 2 - 2, TILE - 10, 4, 10);
    x.fillStyle = '#2e6b34'; x.beginPath(); x.arc(TILE / 2, TILE / 2 - 2, 11, 0, 7); x.fill();
    x.fillStyle = '#3c8a45'; x.beginPath(); x.arc(TILE / 2 - 3, TILE / 2 - 4, 7, 0, 7); x.fill();
    return c;
  }
  _door() {
    const c = makeCanvas(TILE, TILE); const x = c.getContext('2d');
    x.fillStyle = '#4a4e66'; x.fillRect(0, 0, TILE, TILE);
    x.fillStyle = '#6b4a2f'; x.fillRect(6, 4, TILE - 12, TILE - 4);
    x.fillStyle = '#caa44a'; x.fillRect(TILE - 12, TILE / 2, 3, 3);
    return c;
  }
  _chest(open) {
    const c = makeCanvas(TILE, TILE); const x = c.getContext('2d');
    x.fillStyle = '#3f8f4a'; x.fillRect(0, 0, TILE, TILE);
    x.fillStyle = '#a06a2f'; x.fillRect(6, 12, 20, 14);
    x.fillStyle = '#caa44a';
    if (open) { x.fillRect(6, 8, 20, 5); x.fillStyle = '#1a1a1a'; x.fillRect(8, 13, 16, 6); }
    else { x.fillRect(6, 10, 20, 6); x.fillStyle = '#6b4a1f'; x.fillRect(14, 16, 4, 5); }
    return c;
  }
  _sign() {
    const c = makeCanvas(TILE, TILE); const x = c.getContext('2d');
    x.fillStyle = '#3f8f4a'; x.fillRect(0, 0, TILE, TILE);
    x.fillStyle = '#6b4a2f'; x.fillRect(TILE / 2 - 2, 14, 4, 16);
    x.fillStyle = '#caa46a'; x.fillRect(6, 6, 20, 12);
    x.fillStyle = '#6b4a2f'; x.fillRect(9, 9, 14, 1); x.fillRect(9, 12, 10, 1);
    return c;
  }
  _flower() {
    const c = makeCanvas(TILE, TILE); const x = c.getContext('2d');
    x.fillStyle = '#3f8f4a'; x.fillRect(0, 0, TILE, TILE);
    const cols = ['#ff6b9d', '#ffd23f', '#fff'];
    for (let i = 0; i < 4; i++) {
      x.fillStyle = cols[i % cols.length];
      x.fillRect((i * 9 + 5) % TILE, (i * 7 + 9) % TILE, 3, 3);
    }
    return c;
  }
  _stairs() {
    const c = makeCanvas(TILE, TILE); const x = c.getContext('2d');
    x.fillStyle = '#5a5e74'; x.fillRect(0, 0, TILE, TILE);
    x.fillStyle = '#3a3e54';
    for (let i = 0; i < 4; i++) x.fillRect(0, i * 8, TILE - i * 6, 4);
    return c;
  }

  /** フィールド人物（直接描画）。color=メインカラー, dir, frame(0/1) */
  drawActor(ctx, px, py, color, dir = 'down', frame = 0) {
    const cx = px + TILE / 2;
    const bob = frame === 1 ? -1 : 0;
    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(cx, py + TILE - 3, 9, 4, 0, 0, 7); ctx.fill();
    // 体
    ctx.fillStyle = color;
    ctx.fillRect(cx - 7, py + 12 + bob, 14, 14);
    // 頭
    ctx.fillStyle = '#f2c89a';
    ctx.fillRect(cx - 6, py + 4 + bob, 12, 10);
    // 髪
    ctx.fillStyle = '#5a3a26';
    ctx.fillRect(cx - 7, py + 3 + bob, 14, 4);
    // 顔の向き（目）
    ctx.fillStyle = '#222';
    if (dir === 'down')  { ctx.fillRect(cx - 4, py + 9 + bob, 2, 2); ctx.fillRect(cx + 2, py + 9 + bob, 2, 2); }
    else if (dir === 'left')  ctx.fillRect(cx - 5, py + 9 + bob, 2, 2);
    else if (dir === 'right') ctx.fillRect(cx + 3, py + 9 + bob, 2, 2);
    // up は目なし（後ろ向き）
    // 足
    ctx.fillStyle = '#33405a';
    const lo = frame === 1 ? 1 : 0;
    ctx.fillRect(cx - 6, py + 26, 5, 4 + lo);
    ctx.fillRect(cx + 1, py + 26, 5, 4 - lo);
  }

  /** 戦闘モンスター（直接描画）。サイズ係数sでボス拡大。 */
  drawMonster(ctx, cx, cy, family, color, s = 1) {
    ctx.save();
    ctx.translate(cx, cy);
    const r = 26 * s;
    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, r * 0.9, r * 0.9, r * 0.3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = color;
    switch (family) {
      case 'beast':
        ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.8, 0, 0, 7); ctx.fill();
        ctx.fillRect(-r * 0.8, -r * 1.1, r * 0.4, r * 0.5); // 耳
        ctx.fillRect(r * 0.4, -r * 1.1, r * 0.4, r * 0.5);
        break;
      case 'plant': case 'dragon':
        ctx.beginPath(); ctx.moveTo(0, -r * 1.2); ctx.lineTo(r, r * 0.8); ctx.lineTo(-r, r * 0.8); ctx.closePath(); ctx.fill();
        break;
      case 'undead': case 'demon': case 'boss':
        ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, 0); ctx.fill();
        ctx.fillRect(-r, 0, r * 2, r * 0.9);
        // 角
        ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.8); ctx.lineTo(-r * 0.9, -r * 1.4); ctx.lineTo(-r * 0.3, -r * 0.9); ctx.fill();
        ctx.beginPath(); ctx.moveTo(r * 0.6, -r * 0.8); ctx.lineTo(r * 0.9, -r * 1.4); ctx.lineTo(r * 0.3, -r * 0.9); ctx.fill();
        break;
      case 'machine':
        ctx.fillRect(-r, -r, r * 2, r * 2);
        ctx.fillStyle = '#222'; ctx.fillRect(-r * 0.6, -r * 0.6, r * 1.2, r * 0.5);
        break;
      default: // slime / elemental / aqua / insect / flying
        ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    }
    // 目
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.1, r * 0.18, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.1, r * 0.18, 0, 7); ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.1, r * 0.09, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.1, r * 0.09, 0, 7); ctx.fill();
    ctx.restore();
  }
}
