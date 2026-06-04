/**
 * core/AssetLoader.js
 * @layer core
 * 手続き生成アート（イラスト調）。外部画像なしで動く描画器。
 * グラデーション・陰影・リムライト・質感で、フラットな図形ではなく立体的に描く。
 * - bakeTiles(): タイルチップをオフスクリーンcanvasへ事前描画（陰影・AO付き）
 * - drawActor(): フィールドの人物（4方向・歩行2フレーム）を陰影付きで直接描画
 * - drawMonster(): 戦闘モンスターを系統別シルエット＋グラデ＋リムライトで描画
 * 公開API（tile/drawActor/drawMonster）は据え置き。差し替えはこのファイルだけ。
 */
import { TILE } from '../config/constants.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return c;
}

// ── 配色ユーティリティ（基準色から陰影・ハイライトを導く） ──
function hexToRgb(h) {
  h = String(h).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
// amt: -1(黒へ)〜+1(白へ)。色を暗く/明るく寄せる
function tint(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  const t = amt >= 0 ? 255 : 0, p = Math.min(1, Math.abs(amt));
  return `rgb(${Math.round(r + (t - r) * p)},${Math.round(g + (t - g) * p)},${Math.round(b + (t - b) * p)})`;
}
function rgba(hex, a) { const { r, g, b } = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }

export class AssetLoader {
  constructor() { this.tiles = {}; }

  /** 起動時に1回。タイルチップを生成 */
  async bake() {
    this.tiles = {
      grass:    this._tile('#3f8f4a', 'turf'),
      grass2:   this._tile('#4aa258', 'turf'),
      path:     this._tile('#c8a96b', 'grain'),
      floor:    this._tile('#6b6f87', 'stone'),
      floor2:   this._tile('#7a7e96', 'stone'),
      wall:     this._tile('#4a4e66', 'brick'),
      water:    this._tile('#2f6fb0', 'wave'),
      tree:     this._tree(),
      roof:     this._tile('#9c4a3f', 'shingle'),
      roof2:    this._tile('#c79a3f', 'shingle'),
      door:     this._door(),
      chest:    this._chest(false),
      chestOpen:this._chest(true),
      sign:     this._sign(),
      mountain: this._tile('#6b5d4a', 'rock'),
      flower:   this._flower(),
      stairs:   this._stairs(),
      snow:     this._tile('#dfe7f0', 'snow'),
      sand:     this._tile('#d8c483', 'grain'),
      darkfloor:this._tile('#2a2440', 'stone'),
    };
    return this;
  }

  tile(name) { return this.tiles[name] || this.tiles.grass; }

  // ── タイル：縦グラデの下地＋パターン質感＋縁の陰影(AO)で立体感 ──
  _tile(base, pattern) {
    const c = makeCanvas(TILE, TILE), x = c.getContext('2d');
    // 下地グラデ（上が明るく、下が暗い＝面の傾き）
    const g = x.createLinearGradient(0, 0, 0, TILE);
    g.addColorStop(0, tint(base, 0.14));
    g.addColorStop(1, tint(base, -0.12));
    x.fillStyle = g; x.fillRect(0, 0, TILE, TILE);

    if (pattern === 'turf' || pattern === 'snow') {
      // 芝/雪：濃淡の小片を散らし、明るい草先をのせる
      for (let i = 0; i < 26; i++) {
        const px = (i * 13 + 5) % TILE, py = (i * 7 + 3) % TILE;
        x.fillStyle = (i % 3 === 0) ? rgba('#ffffff', 0.10) : rgba('#000000', 0.10);
        x.fillRect(px, py, 2, 2);
      }
      x.strokeStyle = rgba(tint(base, 0.3), 0.5); x.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const px = (i * 11 + 4) % TILE, py = (i * 9 + 14) % TILE;
        x.beginPath(); x.moveTo(px, py + 4); x.lineTo(px + 1, py); x.stroke();
      }
    } else if (pattern === 'grain') {
      // 土/砂：横方向の縞と粒
      for (let yy = 2; yy < TILE; yy += 4) {
        x.fillStyle = rgba('#000000', 0.06); x.fillRect(0, yy, TILE, 1);
        x.fillStyle = rgba('#ffffff', 0.05); x.fillRect(0, yy + 1, TILE, 1);
      }
      for (let i = 0; i < 14; i++) {
        x.fillStyle = (i % 2) ? rgba('#000000', 0.12) : rgba('#ffffff', 0.10);
        x.fillRect((i * 17 + 3) % TILE, (i * 11 + 6) % TILE, 2, 2);
      }
    } else if (pattern === 'stone') {
      // 石床：ベベル付きの目地
      x.strokeStyle = rgba('#000000', 0.35); x.lineWidth = 1;
      x.strokeRect(0.5, 0.5, TILE - 1, TILE - 1);
      x.beginPath(); x.moveTo(TILE / 2, 1); x.lineTo(TILE / 2, TILE - 1);
      x.moveTo(1, TILE / 2); x.lineTo(TILE - 1, TILE / 2); x.stroke();
      x.strokeStyle = rgba('#ffffff', 0.12);
      x.beginPath(); x.moveTo(1, 1.5); x.lineTo(TILE - 1, 1.5); x.stroke();
    } else if (pattern === 'brick' || pattern === 'shingle') {
      // レンガ/瓦：段ごとにオフセット、目地は影＋上辺ハイライト
      const bh = pattern === 'shingle' ? 7 : 8;
      for (let row = 0, yy = 0; yy < TILE; row++, yy += bh) {
        const off = (row % 2) ? -TILE / 4 : 0;
        for (let xx = off; xx < TILE; xx += TILE / 2) {
          x.fillStyle = rgba('#ffffff', 0.10); x.fillRect(xx + 1, yy + 1, TILE / 2 - 2, 1);
          x.fillStyle = rgba('#000000', 0.30); x.fillRect(xx, yy + bh - 1, TILE / 2, 1);
          x.fillStyle = rgba('#000000', 0.22); x.fillRect(xx, yy, 1, bh);
        }
      }
    } else if (pattern === 'wave') {
      // 水：青グラデ＋うねり＋きらめき
      for (let yy = 5; yy < TILE; yy += 7) {
        x.strokeStyle = rgba('#bfe4ff', 0.45); x.lineWidth = 1;
        x.beginPath();
        for (let xx = 0; xx <= TILE; xx += 2) x.lineTo(xx, yy + Math.sin(xx / 3) * 1.6);
        x.stroke();
      }
      x.fillStyle = rgba('#ffffff', 0.5);
      x.fillRect(7, 8, 2, 1); x.fillRect(20, 18, 2, 1); x.fillRect(13, 26, 2, 1);
    } else if (pattern === 'rock') {
      // 岩：塊にハイライト/陰
      const chunks = [[3, 5, 12, 10], [16, 12, 12, 11], [8, 20, 10, 8]];
      for (const [bx, by, bw, bh] of chunks) {
        const gg = x.createLinearGradient(bx, by, bx, by + bh);
        gg.addColorStop(0, tint(base, 0.22)); gg.addColorStop(1, tint(base, -0.22));
        x.fillStyle = gg; x.fillRect(bx, by, bw, bh);
        x.strokeStyle = rgba('#000000', 0.3); x.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      }
    }
    // 縁のアンビエントオクルージョン（接地・段差感）
    const ao = x.createLinearGradient(0, 0, 0, TILE);
    ao.addColorStop(0, rgba('#000000', 0.0));
    ao.addColorStop(0.85, rgba('#000000', 0.0));
    ao.addColorStop(1, rgba('#000000', 0.18));
    x.fillStyle = ao; x.fillRect(0, 0, TILE, TILE);
    return c;
  }

  _tree() {
    const c = makeCanvas(TILE, TILE), x = c.getContext('2d');
    x.drawImage(this._tile('#3f8f4a', 'turf'), 0, 0);
    // 幹
    const tg = x.createLinearGradient(TILE / 2 - 3, 0, TILE / 2 + 3, 0);
    tg.addColorStop(0, '#7a5436'); tg.addColorStop(1, '#5a3a22');
    x.fillStyle = tg; x.fillRect(TILE / 2 - 2, TILE - 11, 4, 11);
    // 影
    x.fillStyle = rgba('#000000', 0.2);
    x.beginPath(); x.ellipse(TILE / 2, TILE - 2, 9, 3, 0, 0, 7); x.fill();
    // 葉（重なる円＋ハイライト）
    const lg = x.createRadialGradient(TILE / 2 - 4, TILE / 2 - 8, 3, TILE / 2, TILE / 2 - 3, 14);
    lg.addColorStop(0, '#5fbf63'); lg.addColorStop(0.6, '#2e8b3a'); lg.addColorStop(1, '#1f6b2c');
    x.fillStyle = lg;
    for (const [dx, dy, r] of [[0, -2, 11], [-6, 2, 7], [6, 1, 7], [0, 6, 8]]) {
      x.beginPath(); x.arc(TILE / 2 + dx, TILE / 2 + dy, r, 0, 7); x.fill();
    }
    x.fillStyle = rgba('#caffce', 0.5);
    x.beginPath(); x.arc(TILE / 2 - 4, TILE / 2 - 7, 3, 0, 7); x.fill();
    return c;
  }
  _door() {
    const c = makeCanvas(TILE, TILE), x = c.getContext('2d');
    x.drawImage(this._tile('#4a4e66', 'brick'), 0, 0);
    const dg = x.createLinearGradient(6, 0, TILE - 6, 0);
    dg.addColorStop(0, '#8a5e38'); dg.addColorStop(0.5, '#6b4a2a'); dg.addColorStop(1, '#4e3520');
    x.fillStyle = dg; x.fillRect(6, 4, TILE - 12, TILE - 4);
    x.strokeStyle = rgba('#000000', 0.4); x.strokeRect(6.5, 4.5, TILE - 13, TILE - 5);
    x.strokeStyle = rgba('#ffffff', 0.12); x.strokeRect(8.5, 6.5, TILE - 17, TILE - 9);
    x.fillStyle = '#ffd98a'; x.beginPath(); x.arc(TILE - 11, TILE / 2 + 2, 1.6, 0, 7); x.fill();
    return c;
  }
  _chest(open) {
    const c = makeCanvas(TILE, TILE), x = c.getContext('2d');
    x.drawImage(this._tile('#3f8f4a', 'turf'), 0, 0);
    x.fillStyle = rgba('#000000', 0.22);
    x.beginPath(); x.ellipse(TILE / 2, 27, 11, 3, 0, 0, 7); x.fill();
    // 箱本体（木目グラデ）
    const bg = x.createLinearGradient(0, 12, 0, 26);
    bg.addColorStop(0, '#b9803c'); bg.addColorStop(1, '#7a5224');
    x.fillStyle = bg; x.fillRect(6, 13, 20, 13);
    x.strokeStyle = rgba('#000000', 0.35); x.strokeRect(6.5, 13.5, 19, 12);
    // 金具
    x.fillStyle = '#e8c45a';
    if (open) {
      x.save(); x.translate(16, 12); x.rotate(-0.5);
      x.fillRect(-10, -5, 20, 5); x.restore();
      x.fillStyle = '#1a140c'; x.fillRect(8, 15, 16, 8); // 中の影
    } else {
      const lg = x.createLinearGradient(0, 9, 0, 16);
      lg.addColorStop(0, '#f0d066'); lg.addColorStop(1, '#c79a3a');
      x.fillStyle = lg; x.fillRect(6, 9, 20, 6);
      x.fillStyle = '#5a3e1a'; x.fillRect(14, 11, 4, 6);
      x.fillStyle = '#ffe9a0'; x.fillRect(15, 12, 1, 4);
    }
    return c;
  }
  _sign() {
    const c = makeCanvas(TILE, TILE), x = c.getContext('2d');
    x.drawImage(this._tile('#3f8f4a', 'turf'), 0, 0);
    x.fillStyle = '#5a3a22'; x.fillRect(TILE / 2 - 2, 14, 4, 16);
    const bg = x.createLinearGradient(0, 5, 0, 18);
    bg.addColorStop(0, '#d6ad72'); bg.addColorStop(1, '#a87e48');
    x.fillStyle = bg; x.fillRect(6, 5, 20, 13);
    x.strokeStyle = rgba('#000000', 0.35); x.strokeRect(6.5, 5.5, 19, 12);
    x.fillStyle = rgba('#3a2613', 0.8); x.fillRect(9, 9, 14, 1.5); x.fillRect(9, 12, 10, 1.5);
    return c;
  }
  _flower() {
    const c = makeCanvas(TILE, TILE), x = c.getContext('2d');
    x.drawImage(this._tile('#3f8f4a', 'turf'), 0, 0);
    const cols = ['#ff6b9d', '#ffd23f', '#ffffff', '#b98cff'];
    for (let i = 0; i < 4; i++) {
      const px = (i * 9 + 6) % TILE, py = (i * 7 + 10) % TILE, col = cols[i % cols.length];
      x.fillStyle = col;
      for (let p = 0; p < 5; p++) {
        const a = p / 5 * Math.PI * 2;
        x.beginPath(); x.arc(px + Math.cos(a) * 2.2, py + Math.sin(a) * 2.2, 1.6, 0, 7); x.fill();
      }
      x.fillStyle = '#ffe66a'; x.beginPath(); x.arc(px, py, 1.4, 0, 7); x.fill();
    }
    return c;
  }
  _stairs() {
    const c = makeCanvas(TILE, TILE), x = c.getContext('2d');
    x.drawImage(this._tile('#6b6f87', 'stone'), 0, 0);
    for (let i = 0; i < 4; i++) {
      x.fillStyle = rgba('#ffffff', 0.14); x.fillRect(0, i * 8, TILE - i * 6, 2);
      x.fillStyle = rgba('#000000', 0.30); x.fillRect(0, i * 8 + 6, TILE - i * 6, 2);
    }
    return c;
  }

  // ── フィールド人物：陰影付きのデフォルメ人物（4方向・歩行2フレーム） ──
  drawActor(ctx, px, py, color, dir = 'down', frame = 0) {
    const cx = px + TILE / 2;
    const bob = frame === 1 ? -1 : 0;
    const top = py + 3 + bob;
    const skin = '#f1c79a', skinSh = '#d8a574', hair = '#5a3a26';
    ctx.save();
    // 影
    ctx.fillStyle = rgba('#000000', 0.28);
    ctx.beginPath(); ctx.ellipse(cx, py + TILE - 2, 9, 3.5, 0, 0, 7); ctx.fill();

    // 足（交互）
    const lo = frame === 1 ? 1 : 0;
    ctx.fillStyle = '#2c3550';
    ctx.fillRect(cx - 6, py + 25, 5, 5 + lo);
    ctx.fillRect(cx + 1, py + 25, 5, 5 - lo);
    ctx.fillStyle = '#1b2236';
    ctx.fillRect(cx - 6, py + 29 + lo, 5, 1); ctx.fillRect(cx + 1, py + 29 - lo, 5, 1);

    // 胴（マント/服のグラデ＋肩ハイライト）
    const bg = ctx.createLinearGradient(cx - 7, top + 9, cx + 7, top + 23);
    bg.addColorStop(0, tint(color, 0.18));
    bg.addColorStop(0.5, color);
    bg.addColorStop(1, tint(color, -0.22));
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(cx - 7, top + 23); ctx.lineTo(cx - 6, top + 10);
    ctx.quadraticCurveTo(cx, top + 7, cx + 6, top + 10);
    ctx.lineTo(cx + 7, top + 23); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba(tint(color, -0.45), 0.6); ctx.lineWidth = 1; ctx.stroke();
    // ベルト
    ctx.fillStyle = rgba('#3a2a16', 0.8); ctx.fillRect(cx - 6, top + 19, 12, 2);

    // 頭（肌グラデ）
    const hg = ctx.createLinearGradient(cx - 6, top + 1, cx + 6, top + 11);
    hg.addColorStop(0, tint(skin, 0.12)); hg.addColorStop(1, skinSh);
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.ellipse(cx, top + 6, 6, 6.5, 0, 0, 7); ctx.fill();

    // 髪
    ctx.fillStyle = hair;
    if (dir === 'up') {
      ctx.beginPath(); ctx.ellipse(cx, top + 6, 6.2, 6.5, 0, 0, 7); ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(cx, top + 5, 6.2, Math.PI, 0); // 前髪
      ctx.lineTo(cx + 6.2, top + 6);
      ctx.lineTo(cx + 4, top + 6); ctx.lineTo(cx + 3, top + 3.5);
      ctx.lineTo(cx - 3, top + 3.5); ctx.lineTo(cx - 4, top + 6);
      ctx.lineTo(cx - 6.2, top + 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = rgba('#a87a52', 0.6);
      ctx.beginPath(); ctx.arc(cx - 2, top + 2.5, 2, Math.PI, 0); ctx.fill(); // 毛先ハイライト
    }

    // 顔（向き別）
    ctx.fillStyle = '#26203a';
    if (dir === 'down') {
      ctx.fillRect(cx - 3.5, top + 6.5, 1.8, 2.2); ctx.fillRect(cx + 1.7, top + 6.5, 1.8, 2.2);
      ctx.fillStyle = rgba('#d77', 0.5); ctx.fillRect(cx - 4, top + 9.5, 1.5, 1); ctx.fillRect(cx + 2.5, top + 9.5, 1.5, 1);
    } else if (dir === 'left') {
      ctx.fillRect(cx - 4, top + 6.5, 1.8, 2.2);
    } else if (dir === 'right') {
      ctx.fillRect(cx + 2.2, top + 6.5, 1.8, 2.2);
    }
    ctx.restore();
  }

  // ── 戦闘モンスター：系統別シルエット＋ボリュームグラデ＋リムライト ──
  drawMonster(ctx, cx, cy, family, color, s = 1) {
    ctx.save();
    ctx.translate(cx, cy);
    const r = 26 * s;
    // 接地影
    ctx.fillStyle = rgba('#000000', 0.32);
    ctx.beginPath(); ctx.ellipse(0, r * 0.95, r * 0.95, r * 0.28, 0, 0, 7); ctx.fill();

    // ボディ用グラデ（左上から光）
    const grad = ctx.createRadialGradient(-r * 0.32, -r * 0.4, r * 0.15, 0, r * 0.1, r * 1.25);
    grad.addColorStop(0, tint(color, 0.4));
    grad.addColorStop(0.55, color);
    grad.addColorStop(1, tint(color, -0.4));
    const outline = rgba(tint(color, -0.55), 0.85);
    ctx.lineWidth = Math.max(1.5, 2 * s); ctx.strokeStyle = outline;

    const body = () => { ctx.fillStyle = grad; ctx.fill(); ctx.stroke(); };

    switch (family) {
      case 'beast': {
        ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.82, 0, 0, 7); body();
        // 耳
        ctx.fillStyle = grad;
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(sx * r * 0.55, -r * 0.55);
          ctx.lineTo(sx * r * 0.78, -r * 1.25);
          ctx.lineTo(sx * r * 0.18, -r * 0.78);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        // 牙
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(-3 * s, r * 0.35); ctx.lineTo(-6 * s, r * 0.6); ctx.lineTo(0, r * 0.45); ctx.fill();
        ctx.beginPath(); ctx.moveTo(3 * s, r * 0.35); ctx.lineTo(6 * s, r * 0.6); ctx.lineTo(0, r * 0.45); ctx.fill();
        break;
      }
      case 'plant': case 'dragon': {
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.2);
        ctx.quadraticCurveTo(r * 1.15, -r * 0.1, r * 0.75, r * 0.85);
        ctx.lineTo(-r * 0.75, r * 0.85);
        ctx.quadraticCurveTo(-r * 1.15, -r * 0.1, 0, -r * 1.2);
        ctx.closePath(); body();
        if (family === 'dragon') { // 翼の縁
          ctx.strokeStyle = rgba(tint(color, 0.3), 0.6);
          ctx.beginPath(); ctx.moveTo(0, -r * 0.4); ctx.lineTo(0, r * 0.7); ctx.stroke();
          ctx.strokeStyle = outline;
        } else { // 葉脈
          ctx.strokeStyle = rgba(tint(color, -0.3), 0.5);
          ctx.beginPath(); ctx.moveTo(0, -r * 0.9); ctx.lineTo(0, r * 0.6);
          ctx.moveTo(0, -r * 0.3); ctx.lineTo(r * 0.4, 0); ctx.moveTo(0, -r * 0.3); ctx.lineTo(-r * 0.4, 0); ctx.stroke();
          ctx.strokeStyle = outline;
        }
        break;
      }
      case 'undead': case 'demon': case 'boss': {
        ctx.beginPath();
        ctx.arc(0, 0, r, Math.PI, 0);
        ctx.lineTo(r, r * 0.55);
        for (let i = 1; i <= 6; i++) { // 裾のギザギザ（ローブ/亡霊）
          ctx.lineTo(r - i * (r * 2 / 6), r * (i % 2 ? 0.95 : 0.6));
        }
        ctx.lineTo(-r, r * 0.55); ctx.closePath(); body();
        // 角
        ctx.fillStyle = grad;
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(sx * r * 0.55, -r * 0.78);
          ctx.quadraticCurveTo(sx * r * 1.0, -r * 1.5, sx * r * 0.35, -r * 0.95);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        break;
      }
      case 'machine': {
        const rr = r * 0.55;
        roundRect(ctx, -r, -r, r * 2, r * 2, rr * 0.4); body();
        // パネル
        ctx.fillStyle = rgba('#0b0f1a', 0.85);
        roundRect(ctx, -r * 0.62, -r * 0.6, r * 1.24, r * 0.7, 3); ctx.fill();
        // ボルト
        ctx.fillStyle = rgba('#ffffff', 0.5);
        for (const [bx, by] of [[-r * 0.8, -r * 0.8], [r * 0.8, -r * 0.8], [-r * 0.8, r * 0.8], [r * 0.8, r * 0.8]]) {
          ctx.beginPath(); ctx.arc(bx, by, 2 * s, 0, 7); ctx.fill();
        }
        break;
      }
      case 'slime': case 'aqua': {
        ctx.beginPath();
        ctx.moveTo(-r, r * 0.7);
        ctx.quadraticCurveTo(-r * 1.05, -r * 0.9, 0, -r);
        ctx.quadraticCurveTo(r * 1.05, -r * 0.9, r, r * 0.7);
        ctx.quadraticCurveTo(r * 0.5, r * 0.95, 0, r * 0.85);
        ctx.quadraticCurveTo(-r * 0.5, r * 0.95, -r, r * 0.7);
        ctx.closePath(); body();
        // 照り
        ctx.fillStyle = rgba('#ffffff', 0.55);
        ctx.beginPath(); ctx.ellipse(-r * 0.32, -r * 0.42, r * 0.22, r * 0.12, -0.5, 0, 7); ctx.fill();
        break;
      }
      default: { // insect / flying / elemental など
        ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); body();
      }
    }

    // リムライト（上部の光の縁）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba('#ffffff', 0.18); ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.92, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.restore();

    // 目（白目＋虹彩＋ハイライト）
    const ex = r * 0.34, ey = -r * 0.08, er = r * 0.2;
    for (const sx of [-1, 1]) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(sx * ex, ey, er, 0, 7); ctx.fill();
      ctx.fillStyle = '#b3261e';
      ctx.beginPath(); ctx.arc(sx * ex, ey, er * 0.55, 0, 7); ctx.fill();
      ctx.fillStyle = '#1a0a08';
      ctx.beginPath(); ctx.arc(sx * ex, ey, er * 0.26, 0, 7); ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.9);
      ctx.beginPath(); ctx.arc(sx * ex - er * 0.3, ey - er * 0.3, er * 0.18, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
}

// 角丸矩形パス（fill/strokeは呼び出し側、ここではパスのみ）
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
