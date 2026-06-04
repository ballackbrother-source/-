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
  drawActor(ctx, px, py, color, dir = 'down', frame = 0, gear = 'npc') {
    const cx = px + TILE / 2;
    const hero = gear === 'hero';
    const bob = frame === 1 ? -1 : 0;
    const top = py + 3 + bob;
    const skin = '#f1c79a', skinSh = '#d8a574';
    const hair = hero ? '#6a4528' : '#5a3a26';
    const tunic = hero ? '#9a7338' : color; // 勇者は革のチュニック、村人は色そのまま
    ctx.save();
    // 影
    ctx.fillStyle = rgba('#000000', 0.28);
    ctx.beginPath(); ctx.ellipse(cx, py + TILE - 2, 9, 3.5, 0, 0, 7); ctx.fill();

    // 足（交互。勇者は革ブーツ）
    const lo = frame === 1 ? 1 : 0;
    ctx.fillStyle = hero ? '#5a3d24' : '#2c3550';
    ctx.fillRect(cx - 6, py + 25, 5, 5 + lo);
    ctx.fillRect(cx + 1, py + 25, 5, 5 - lo);
    ctx.fillStyle = hero ? '#3a2616' : '#1b2236';
    ctx.fillRect(cx - 6, py + 29 + lo, 5, 1); ctx.fillRect(cx + 1, py + 29 - lo, 5, 1);

    // 勇者：背負った剣（鞘＋鍔＋柄頭が肩越しに見える）
    const sword = () => {
      ctx.strokeStyle = '#5a3d24'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx + 5, top + 7); ctx.lineTo(cx - 1, top + 24); ctx.stroke();
      ctx.strokeStyle = '#c9d2dc'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(cx + 5, top + 7); ctx.lineTo(cx + 6.6, top + 1.5); ctx.stroke();
      ctx.fillStyle = '#caa24a'; ctx.fillRect(cx + 3.4, top + 3.6, 5, 1.8); // 鍔
      ctx.fillStyle = '#e8d27a'; ctx.beginPath(); ctx.arc(cx + 6.9, top + 0.8, 1.5, 0, 7); ctx.fill(); // 柄頭
      ctx.lineCap = 'butt';
    };
    if (hero && dir !== 'up') sword();

    // 胴（チュニック）
    const bg = ctx.createLinearGradient(cx - 7, top + 9, cx + 7, top + 23);
    bg.addColorStop(0, tint(tunic, 0.18)); bg.addColorStop(0.5, tunic); bg.addColorStop(1, tint(tunic, -0.22));
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(cx - 7, top + 23); ctx.lineTo(cx - 6, top + 10);
    ctx.quadraticCurveTo(cx, top + 7, cx + 6, top + 10);
    ctx.lineTo(cx + 7, top + 23); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba(tint(tunic, -0.45), 0.6); ctx.lineWidth = 1; ctx.stroke();

    // 勇者：肩マント（キャラ色のマント＝個性）
    if (hero) {
      const cg = ctx.createLinearGradient(0, top + 8, 0, top + 16);
      cg.addColorStop(0, tint(color, 0.22)); cg.addColorStop(1, tint(color, -0.28));
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.moveTo(cx - 7.5, top + 12);
      ctx.quadraticCurveTo(cx, top + 6.5, cx + 7.5, top + 12);
      ctx.quadraticCurveTo(cx + 5, top + 16, cx, top + 15.5);
      ctx.quadraticCurveTo(cx - 5, top + 16, cx - 7.5, top + 12);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(tint(color, -0.5), 0.5); ctx.stroke();
    }
    if (hero && dir === 'up') sword(); // 後ろ向きは剣を背面に重ねる

    // ベルト＋（勇者）バックル・ポーチ
    ctx.fillStyle = rgba('#3a2a16', 0.85); ctx.fillRect(cx - 6, top + 19, 12, 2);
    if (hero) {
      ctx.fillStyle = '#caa24a'; ctx.fillRect(cx - 1, top + 18.5, 2, 3);
      ctx.fillStyle = '#6a4a2a'; ctx.fillRect(cx - 7.5, top + 18, 3, 4);
    }

    // 頭（肌グラデ）
    const hg = ctx.createLinearGradient(cx - 6, top + 1, cx + 6, top + 11);
    hg.addColorStop(0, tint(skin, 0.12)); hg.addColorStop(1, skinSh);
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.ellipse(cx, top + 6, 6, 6.5, 0, 0, 7); ctx.fill();

    if (hero) {
      // 冒険者の羽根付き帽子
      const cap = '#3f6b3a';
      ctx.fillStyle = cap;
      if (dir === 'up') {
        ctx.beginPath(); ctx.ellipse(cx, top + 3.5, 6.6, 4.5, 0, Math.PI, 0); ctx.fill();
        ctx.fillRect(cx - 6.6, top + 3, 13.2, 2);
      } else {
        ctx.beginPath();
        ctx.moveTo(cx - 6.6, top + 4.5);
        ctx.quadraticCurveTo(cx - 5, top - 3.5, cx + 2, top - 1.5);
        ctx.quadraticCurveTo(cx + 6, top + 1, cx + 6.6, top + 4.5);
        ctx.quadraticCurveTo(cx, top + 2.5, cx - 6.6, top + 4.5);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = tint(cap, 0.2); ctx.fillRect(cx - 6.6, top + 4, 13.2, 1.4);
        ctx.strokeStyle = '#e85a5a'; ctx.lineWidth = 2; ctx.lineCap = 'round'; // 羽根
        ctx.beginPath(); ctx.moveTo(cx + 1.5, top - 1); ctx.quadraticCurveTo(cx + 7, top - 4.5, cx + 9.5, top - 1.5); ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.fillStyle = hair; ctx.fillRect(cx - 5, top + 4.5, 10, 1.8); // 前髪
      }
    } else {
      // 村人：髪
      ctx.fillStyle = hair;
      if (dir === 'up') {
        ctx.beginPath(); ctx.ellipse(cx, top + 6, 6.2, 6.5, 0, 0, 7); ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(cx, top + 5, 6.2, Math.PI, 0);
        ctx.lineTo(cx + 6.2, top + 6); ctx.lineTo(cx + 4, top + 6); ctx.lineTo(cx + 3, top + 3.5);
        ctx.lineTo(cx - 3, top + 3.5); ctx.lineTo(cx - 4, top + 6); ctx.lineTo(cx - 6.2, top + 6);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = rgba('#a87a52', 0.6);
        ctx.beginPath(); ctx.arc(cx - 2, top + 2.5, 2, Math.PI, 0); ctx.fill();
      }
    }

    // 顔（向き別。後ろ向きは描かない）
    if (dir !== 'up') {
      ctx.fillStyle = '#26203a';
      if (dir === 'down') {
        ctx.fillRect(cx - 3.5, top + 6.5, 1.8, 2.2); ctx.fillRect(cx + 1.7, top + 6.5, 1.8, 2.2);
        ctx.fillStyle = rgba('#d77', 0.5); ctx.fillRect(cx - 4, top + 9.5, 1.5, 1); ctx.fillRect(cx + 2.5, top + 9.5, 1.5, 1);
      } else if (dir === 'left') {
        ctx.fillRect(cx - 4, top + 6.5, 1.8, 2.2);
      } else if (dir === 'right') {
        ctx.fillRect(cx + 2.2, top + 6.5, 1.8, 2.2);
      }
    }
    ctx.restore();
  }

  // ── 戦闘モンスター：系統が「見て分かる」シルエット＋陰影＋リムライト ──
  drawMonster(ctx, cx, cy, family, color, s = 1) {
    ctx.save();
    ctx.translate(cx, cy);
    const r = 26 * s;
    // 接地影
    ctx.fillStyle = rgba('#000000', 0.32);
    ctx.beginPath(); ctx.ellipse(0, r * 0.95, r * 0.95, r * 0.28, 0, 0, 7); ctx.fill();

    // ボディ用グラデ（左上から光）
    const grad = ctx.createRadialGradient(-r * 0.32, -r * 0.4, r * 0.15, 0, r * 0.1, r * 1.25);
    grad.addColorStop(0, tint(color, 0.4)); grad.addColorStop(0.55, color); grad.addColorStop(1, tint(color, -0.4));
    const outline = rgba(tint(color, -0.55), 0.85);
    const lw = Math.max(1.5, 2 * s);
    ctx.lineWidth = lw; ctx.strokeStyle = outline;
    const sc = hexToRgb(color);
    const shA = (a) => `rgba(${(sc.r * 0.3) | 0},${(sc.g * 0.3) | 0},${(sc.b * 0.3) | 0},${a})`; // 色付きの陰
    // 本体：塗り＋クリップして スペキュラ／フォームシャドウ／接地オクルージョンを重ね、球状の立体感を出す
    const body = () => {
      ctx.fillStyle = grad; ctx.fill(); ctx.stroke();
      ctx.save(); ctx.clip();
      const hl = ctx.createRadialGradient(-r * 0.4, -r * 0.52, r * 0.04, -r * 0.26, -r * 0.38, r * 1.15);
      hl.addColorStop(0, rgba('#ffffff', 0.36)); hl.addColorStop(0.34, rgba('#ffffff', 0.09)); hl.addColorStop(1, rgba('#ffffff', 0));
      ctx.fillStyle = hl; ctx.fillRect(-r * 2.2, -r * 2.6, r * 4.4, r * 4.8);
      const fs = ctx.createLinearGradient(-r * 0.5, -r * 0.5, r * 0.85, r * 0.95);
      fs.addColorStop(0, shA(0)); fs.addColorStop(0.56, shA(0)); fs.addColorStop(1, shA(0.55));
      ctx.fillStyle = fs; ctx.fillRect(-r * 2.2, -r * 2.2, r * 4.4, r * 4.4);
      const ao = ctx.createLinearGradient(0, r * 0.35, 0, r * 1.25);
      ao.addColorStop(0, rgba('#000000', 0)); ao.addColorStop(1, rgba('#000000', 0.30));
      ctx.fillStyle = ao; ctx.fillRect(-r * 2.2, r * 0.35, r * 4.4, r * 1.4);
      ctx.restore();
      ctx.fillStyle = grad; ctx.strokeStyle = outline; ctx.lineWidth = lw;
    };
    // パーツ（角・翼・耳ひれ等）：左上→右下の方向グラデで筒状のボリュームを出す
    const part = (sh) => {
      if (sh == null) { ctx.fillStyle = grad; ctx.fill(); ctx.stroke(); return; }
      const g = ctx.createLinearGradient(-r, -r, r, r);
      g.addColorStop(0, tint(color, Math.min(0.95, sh + 0.2)));
      g.addColorStop(1, tint(color, sh - 0.24));
      ctx.fillStyle = g; ctx.fill(); ctx.stroke();
    };
    // 落ち影（パーツ→本体の前後関係を出す、柔らかい楕円の陰）
    const castShadow = (x, y, rx, ry, a = 0.3, rot = 0) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(rx, ry);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, rgba('#000000', a)); g.addColorStop(0.55, rgba('#000000', a * 0.5)); g.addColorStop(1, rgba('#000000', 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, 7); ctx.fill(); ctx.restore();
    };

    // 目の既定値（caseごとに上書き可。slit=縦長瞳）
    let eye = { x: r * 0.34, y: -r * 0.06, r: r * 0.2, slit: false, color: '#b3261e' };
    let drawEyes = true, rim = true;

    switch (family) {
      case 'dragon': { // 業火竜：長い口吻・開いた顎と牙・喉の業火・反り角・翼・耳ひれ・煙
        rim = false;
        // 翼（背後・指骨つき、大きく広げる）
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(sx * r * 0.2, -r * 0.28);
          ctx.quadraticCurveTo(sx * r * 1.05, -r * 1.4, sx * r * 1.72, -r * 1.0);
          ctx.quadraticCurveTo(sx * r * 1.32, -r * 0.82, sx * r * 1.5, -r * 0.5);
          ctx.quadraticCurveTo(sx * r * 1.12, -r * 0.46, sx * r * 1.34, -r * 0.12);
          ctx.quadraticCurveTo(sx * r * 0.96, -r * 0.12, sx * r * 1.12, r * 0.22);
          ctx.quadraticCurveTo(sx * r * 0.6, -r * 0.05, sx * r * 0.2, -r * 0.28);
          ctx.closePath(); part(-0.22);
          ctx.strokeStyle = rgba(tint(color, -0.42), 0.5); ctx.lineWidth = lw * 0.7; // 指骨
          ctx.beginPath();
          ctx.moveTo(sx * r * 0.3, -r * 0.22); ctx.lineTo(sx * r * 1.62, -r * 0.92);
          ctx.moveTo(sx * r * 0.3, -r * 0.22); ctx.lineTo(sx * r * 1.28, -r * 0.18);
          ctx.moveTo(sx * r * 0.3, -r * 0.22); ctx.lineTo(sx * r * 1.06, r * 0.18);
          ctx.stroke(); ctx.lineWidth = lw;
        }
        // 耳ひれ（頬の後ろに張る膜）
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(sx * r * 0.68, -r * 0.2);
          ctx.quadraticCurveTo(sx * r * 1.2, -r * 0.42, sx * r * 1.28, r * 0.02);
          ctx.lineTo(sx * r * 1.08, r * 0.06); ctx.lineTo(sx * r * 1.16, r * 0.28);
          ctx.quadraticCurveTo(sx * r * 0.82, r * 0.06, sx * r * 0.68, -r * 0.04);
          ctx.closePath(); part(-0.12);
        }
        // 角（後方へ反る・節つき）
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(sx * r * 0.4, -r * 0.82);
          ctx.quadraticCurveTo(sx * r * 1.18, -r * 1.72, sx * r * 1.28, -r * 1.12);
          ctx.quadraticCurveTo(sx * r * 0.96, -r * 1.3, sx * r * 0.72, -r * 1.04);
          ctx.quadraticCurveTo(sx * r * 0.54, -r * 0.94, sx * r * 0.24, -r * 0.86);
          ctx.closePath(); part(0.08);
          ctx.strokeStyle = rgba(tint(color, -0.4), 0.5); ctx.lineWidth = lw * 0.6;
          ctx.beginPath();
          ctx.moveTo(sx * r * 0.62, -r * 1.0); ctx.lineTo(sx * r * 0.7, -r * 1.12);
          ctx.moveTo(sx * r * 0.88, -r * 1.18); ctx.lineTo(sx * r * 0.96, -r * 1.3); ctx.stroke();
          ctx.lineWidth = lw;
        }
        // 頭（長い口吻が下へ突き出るくさび形）
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.95);
        ctx.quadraticCurveTo(r * 0.78, -r * 0.7, r * 0.86, -r * 0.12);
        ctx.quadraticCurveTo(r * 0.9, r * 0.25, r * 0.5, r * 0.62);
        ctx.quadraticCurveTo(r * 0.34, r * 0.95, r * 0.16, r * 1.12);
        ctx.lineTo(0, r * 1.2); ctx.lineTo(-r * 0.16, r * 1.12);
        ctx.quadraticCurveTo(-r * 0.34, r * 0.95, -r * 0.5, r * 0.62);
        ctx.quadraticCurveTo(-r * 0.9, r * 0.25, -r * 0.86, -r * 0.12);
        ctx.quadraticCurveTo(-r * 0.78, -r * 0.7, 0, -r * 0.95);
        ctx.closePath(); body();
        // 落ち影：角→額、頭→翼の付け根
        castShadow(-r * 0.3, -r * 0.52, r * 0.24, r * 0.15, 0.34, 0.5);
        castShadow(r * 0.3, -r * 0.52, r * 0.24, r * 0.15, 0.34, -0.5);
        castShadow(-r * 0.74, -r * 0.04, r * 0.26, r * 0.42, 0.26, 0.3);
        castShadow(r * 0.74, -r * 0.04, r * 0.26, r * 0.42, 0.26, -0.3);
        // 眉骨の影
        ctx.fillStyle = rgba(tint(color, -0.38), 0.55);
        ctx.beginPath(); ctx.ellipse(0, -r * 0.3, r * 0.64, r * 0.2, 0, Math.PI, 0); ctx.fill();
        // 鱗のうろこ目（頬の短い弧）
        ctx.strokeStyle = rgba(tint(color, 0.22), 0.4); ctx.lineWidth = lw * 0.5;
        for (const yy of [0.0, 0.22]) { ctx.beginPath(); ctx.arc(-r * 0.32, r * yy, r * 0.08, 0, Math.PI); ctx.arc(r * 0.32, r * yy, r * 0.08, 0, Math.PI); ctx.stroke(); }
        ctx.lineWidth = lw;
        // 鼻孔
        ctx.fillStyle = '#2a0f08';
        ctx.beginPath(); ctx.ellipse(-r * 0.17, r * 0.32, r * 0.06, r * 0.04, -0.4, 0, 7); ctx.ellipse(r * 0.17, r * 0.32, r * 0.06, r * 0.04, 0.4, 0, 7); ctx.fill();
        // 開いた口（暗い口内）＋喉の業火
        ctx.fillStyle = '#1a0604';
        ctx.beginPath();
        ctx.moveTo(-r * 0.42, r * 0.5); ctx.quadraticCurveTo(0, r * 0.6, r * 0.42, r * 0.5);
        ctx.quadraticCurveTo(r * 0.3, r * 0.98, 0, r * 1.04);
        ctx.quadraticCurveTo(-r * 0.3, r * 0.98, -r * 0.42, r * 0.5);
        ctx.closePath(); ctx.fill();
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; // 業火
        const fg = ctx.createRadialGradient(0, r * 0.74, 2, 0, r * 0.74, r * 0.4);
        fg.addColorStop(0, rgba('#fff4b0', 0.95)); fg.addColorStop(0.45, rgba('#ff962a', 0.7)); fg.addColorStop(1, rgba('#ff3a10', 0));
        ctx.fillStyle = fg; ctx.beginPath(); ctx.ellipse(0, r * 0.74, r * 0.32, r * 0.3, 0, 0, 7); ctx.fill();
        ctx.restore();
        // 牙（上は下向き・下は上向き）
        ctx.fillStyle = '#fff'; ctx.strokeStyle = outline; ctx.lineWidth = lw * 0.5;
        for (const tx of [-0.3, -0.11, 0.11, 0.3]) { ctx.beginPath(); ctx.moveTo(r * (tx - 0.055), r * 0.46); ctx.lineTo(r * tx, r * 0.64); ctx.lineTo(r * (tx + 0.055), r * 0.46); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        for (const tx of [-0.2, 0.2]) { ctx.beginPath(); ctx.moveTo(r * (tx - 0.07), r * 0.96); ctx.lineTo(r * tx, r * 0.78); ctx.lineTo(r * (tx + 0.07), r * 0.96); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        ctx.lineWidth = lw;
        // 立ちのぼる火の粉
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const [ex, ey, er2] of [[-r * 0.24, r * 0.04, 0.05], [r * 0.26, -r * 0.06, 0.04], [-r * 0.06, -r * 0.26, 0.035]]) {
          ctx.fillStyle = rgba('#ff8a2a', 0.55); ctx.beginPath(); ctx.arc(ex, ey, r * er2, 0, 7); ctx.fill();
        }
        ctx.restore();
        eye = { x: r * 0.42, y: -r * 0.14, r: r * 0.16, slit: true, color: '#ffcf3a' };
        break;
      }
      case 'beast': { // 獣：四足の頭部正面（とがり耳・口吻・牙・前足）
        ctx.beginPath(); ctx.ellipse(-r * 0.5, r * 0.85, r * 0.22, r * 0.16, 0, 0, 7);
        ctx.ellipse(r * 0.5, r * 0.85, r * 0.22, r * 0.16, 0, 0, 7); part(-0.1); // 前足
        for (const sx of [-1, 1]) { // 耳
          ctx.beginPath();
          ctx.moveTo(sx * r * 0.5, -r * 0.55); ctx.lineTo(sx * r * 0.85, -r * 1.2);
          ctx.lineTo(sx * r * 0.1, -r * 0.72); ctx.closePath(); part(0);
          ctx.fillStyle = rgba('#e58aa0', 0.7);
          ctx.beginPath(); ctx.moveTo(sx * r * 0.46, -r * 0.6); ctx.lineTo(sx * r * 0.62, -r * 0.95); ctx.lineTo(sx * r * 0.28, -r * 0.68); ctx.closePath(); ctx.fill();
        }
        ctx.beginPath(); ctx.ellipse(0, r * 0.05, r, r * 0.82, 0, 0, 7); body(); // 顔
        castShadow(-r * 0.34, -r * 0.44, r * 0.22, r * 0.14, 0.32, 0.4); // 耳→額の落ち影
        castShadow(r * 0.34, -r * 0.44, r * 0.22, r * 0.14, 0.32, -0.4);
        // 口吻
        ctx.beginPath(); ctx.ellipse(0, r * 0.42, r * 0.42, r * 0.3, 0, 0, 7); part(0.16);
        ctx.fillStyle = '#241016'; ctx.beginPath(); ctx.ellipse(0, r * 0.3, r * 0.12, r * 0.09, 0, 0, 7); ctx.fill(); // 鼻
        ctx.fillStyle = '#fff'; ctx.strokeStyle = outline; ctx.lineWidth = lw * 0.6;
        for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * r * 0.14, r * 0.62); ctx.lineTo(sx * r * 0.24, r * 0.46); ctx.lineTo(sx * r * 0.04, r * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        ctx.lineWidth = lw;
        eye = { x: r * 0.34, y: -r * 0.12, r: r * 0.17, slit: false, color: '#ffd24a' };
        break;
      }
      case 'flying': { // 飛行：コウモリ（広げた翼・とがり耳・牙）
        rim = false;
        for (const sx of [-1, 1]) { // 翼
          ctx.beginPath();
          ctx.moveTo(sx * r * 0.2, -r * 0.15);
          ctx.quadraticCurveTo(sx * r * 1.0, -r * 0.9, sx * r * 1.5, -r * 0.5);
          ctx.lineTo(sx * r * 1.05, -r * 0.3); ctx.lineTo(sx * r * 1.3, r * 0.05);
          ctx.lineTo(sx * r * 0.85, -r * 0.05); ctx.lineTo(sx * r * 1.0, r * 0.45);
          ctx.quadraticCurveTo(sx * r * 0.5, r * 0.1, sx * r * 0.2, -r * 0.15);
          ctx.closePath(); part(-0.18);
        }
        for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * r * 0.35, -r * 0.35); ctx.lineTo(sx * r * 0.6, -r * 0.95); ctx.lineTo(sx * r * 0.05, -r * 0.5); ctx.closePath(); part(0); }
        ctx.beginPath(); ctx.ellipse(0, r * 0.1, r * 0.55, r * 0.6, 0, 0, 7); body(); // 胴
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(-r * 0.14, r * 0.5); ctx.lineTo(-r * 0.04, r * 0.66); ctx.lineTo(r * 0.02, r * 0.5);
        ctx.lineTo(r * 0.06, r * 0.66); ctx.lineTo(r * 0.16, r * 0.5); ctx.closePath(); ctx.fill(); // 牙
        eye = { x: r * 0.2, y: -r * 0.02, r: r * 0.13, slit: false, color: '#ffd24a' };
        break;
      }
      case 'insect': { // 蟲：触角・羽・節のある胴
        rim = false;
        for (const [yy, rr] of [[-r * 0.2, 0.62], [r * 0.45, 0.46]]) { // 上下の羽
          for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * r * 0.7, yy, r * rr, r * (rr * 0.82), sx * 0.3, 0, 7); part(0.12); }
        }
        ctx.fillStyle = rgba('#000', 0.12);
        for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * r * 0.85, -r * 0.2, r * 0.12, 0, 7); ctx.fill(); } // 羽紋
        // 触角
        ctx.strokeStyle = outline; ctx.lineWidth = lw * 0.8;
        for (const sx of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(sx * r * 0.12, -r * 0.6); ctx.quadraticCurveTo(sx * r * 0.5, -r * 1.2, sx * r * 0.7, -r * 1.15); ctx.stroke();
          ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(sx * r * 0.72, -r * 1.15, r * 0.1, 0, 7); ctx.fill();
        }
        ctx.lineWidth = lw;
        ctx.beginPath(); ctx.ellipse(0, r * 0.1, r * 0.3, r * 0.85, 0, 0, 7); body(); // 胴（縦長）
        ctx.strokeStyle = rgba(tint(color, -0.35), 0.6); ctx.lineWidth = lw * 0.7;
        for (const ty of [0.0, 0.35, 0.7]) { ctx.beginPath(); ctx.moveTo(-r * 0.28, r * ty); ctx.lineTo(r * 0.28, r * ty); ctx.stroke(); }
        ctx.lineWidth = lw;
        eye = { x: r * 0.16, y: -r * 0.45, r: r * 0.14, slit: false, color: '#202028' };
        break;
      }
      case 'undead': { // 不死：頭骨＋ボロ布（眼窩・鼻腔・歯列）
        ctx.beginPath();
        ctx.arc(0, 0, r, Math.PI, 0); ctx.lineTo(r, r * 0.5);
        for (let i = 1; i <= 6; i++) ctx.lineTo(r - i * (r * 2 / 6), r * (i % 2 ? 0.95 : 0.55));
        ctx.lineTo(-r, r * 0.5); ctx.closePath(); body();
        drawEyes = false;
        for (const sx of [-1, 1]) { // 眼窩
          ctx.fillStyle = '#120a14'; ctx.beginPath(); ctx.ellipse(sx * r * 0.34, -r * 0.05, r * 0.2, r * 0.24, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#ff5a4a'; ctx.beginPath(); ctx.arc(sx * r * 0.34, 0, r * 0.08, 0, 7); ctx.fill(); // 怪光
        }
        ctx.fillStyle = '#120a14';
        ctx.beginPath(); ctx.moveTo(0, r * 0.18); ctx.lineTo(-r * 0.1, r * 0.4); ctx.lineTo(r * 0.1, r * 0.4); ctx.closePath(); ctx.fill(); // 鼻腔
        ctx.strokeStyle = rgba('#120a14', 0.7); ctx.lineWidth = lw * 0.7;
        ctx.beginPath(); ctx.moveTo(-r * 0.32, r * 0.6); ctx.lineTo(r * 0.32, r * 0.6); ctx.stroke();
        for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.13, r * 0.5); ctx.lineTo(i * r * 0.13, r * 0.68); ctx.stroke(); } // 歯
        ctx.lineWidth = lw;
        break;
      }
      case 'demon': case 'boss': { // 魔/神格ボス：大きな角＋角張った翼＋光る眼
        rim = false;
        for (const sx of [-1, 1]) { // 角張った翼
          ctx.beginPath();
          ctx.moveTo(sx * r * 0.35, -r * 0.1);
          ctx.lineTo(sx * r * 1.45, -r * 0.85); ctx.lineTo(sx * r * 1.15, -r * 0.35);
          ctx.lineTo(sx * r * 1.5, -r * 0.05); ctx.lineTo(sx * r * 1.1, r * 0.1);
          ctx.lineTo(sx * r * 1.3, r * 0.5); ctx.lineTo(sx * r * 0.5, r * 0.2);
          ctx.closePath(); part(-0.22);
        }
        ctx.beginPath(); // ローブ状の胴
        ctx.arc(0, 0, r, Math.PI, 0); ctx.lineTo(r, r * 0.5);
        for (let i = 1; i <= 6; i++) ctx.lineTo(r - i * (r * 2 / 6), r * (i % 2 ? 0.98 : 0.6));
        ctx.lineTo(-r, r * 0.5); ctx.closePath(); body();
        for (const sx of [-1, 1]) { // 大きく反る角
          ctx.beginPath();
          ctx.moveTo(sx * r * 0.5, -r * 0.78);
          ctx.quadraticCurveTo(sx * r * 1.25, -r * 1.7, sx * r * 1.4, -r * 0.95);
          ctx.quadraticCurveTo(sx * r * 1.0, -r * 1.15, sx * r * 0.3, -r * 0.92);
          ctx.closePath(); part(0.05);
        }
        castShadow(-r * 0.42, -r * 0.55, r * 0.26, r * 0.16, 0.32, 0.55); // 角→額の落ち影
        castShadow(r * 0.42, -r * 0.55, r * 0.26, r * 0.16, 0.32, -0.55);
        drawEyes = false;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const sx of [-1, 1]) {
          ctx.fillStyle = '#fff7c0'; ctx.beginPath(); ctx.ellipse(sx * r * 0.34, -r * 0.05, r * 0.16, r * 0.1, sx * 0.4, 0, 7); ctx.fill();
          ctx.fillStyle = rgba('#ffd23f', 0.5); ctx.beginPath(); ctx.arc(sx * r * 0.34, -r * 0.05, r * 0.3, 0, 7); ctx.fill();
        }
        ctx.restore();
        break;
      }
      case 'machine': { // 機械/ゴーレム：胴体＋頭ブロック＋発光バイザー＋鋲
        const head = -r * 0.55;
        roundRect(ctx, -r * 0.9, head, r * 1.8, r * 0.95, 4 * s); part(0); // 頭
        roundRect(ctx, -r, r * 0.0, r * 2, r * 0.95, 5 * s); body(); // 胴
        castShadow(0, r * 0.44, r * 0.82, r * 0.13, 0.3); // 頭ブロック→胴の落ち影
        roundRect(ctx, -r * 1.15, r * 0.05, r * 0.45, r * 0.7, 3 * s); part(-0.18); // 肩
        roundRect(ctx, r * 0.7, r * 0.05, r * 0.45, r * 0.7, 3 * s); part(-0.18);
        drawEyes = false;
        ctx.fillStyle = '#08111e'; roundRect(ctx, -r * 0.65, head + r * 0.28, r * 1.3, r * 0.34, 3 * s); ctx.fill(); // バイザー溝
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#5ad6ff';
        roundRect(ctx, -r * 0.5, head + r * 0.36, r * 1.0, r * 0.16, 2 * s); ctx.fill();
        ctx.fillStyle = rgba('#5ad6ff', 0.4); ctx.fillRect(-r * 0.6, head + r * 0.3, r * 1.2, r * 0.3); ctx.restore();
        ctx.fillStyle = rgba('#ffffff', 0.5); // 鋲
        for (const [bx, by] of [[-r * 0.75, r * 0.15], [r * 0.75, r * 0.15], [-r * 0.75, r * 0.78], [r * 0.75, r * 0.78]]) { ctx.beginPath(); ctx.arc(bx, by, 2 * s, 0, 7); ctx.fill(); }
        break;
      }
      case 'aqua': { // 水：波の体＋頭頂のしぶき＋飛沫（半透明）
        rim = false;
        ctx.save(); ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(-r, r * 0.6);
        ctx.quadraticCurveTo(-r * 1.0, -r * 0.5, -r * 0.35, -r * 0.85);
        ctx.quadraticCurveTo(-r * 0.05, -r * 1.05, r * 0.15, -r * 0.7); // 頭頂の巻き波
        ctx.quadraticCurveTo(r * 0.45, -r * 1.0, r * 0.7, -r * 0.55);
        ctx.quadraticCurveTo(r * 1.0, -r * 0.1, r, r * 0.6);
        ctx.quadraticCurveTo(r * 0.5, r * 0.95, 0, r * 0.85);
        ctx.quadraticCurveTo(-r * 0.5, r * 0.95, -r, r * 0.6);
        ctx.closePath(); body();
        ctx.strokeStyle = rgba('#eaffff', 0.6); ctx.lineWidth = lw * 0.8; // 波の筋
        ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.3); ctx.quadraticCurveTo(0, r * 0.1, r * 0.6, r * 0.35); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.55); ctx.quadraticCurveTo(0, r * 0.4, r * 0.5, r * 0.6); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = rgba('#eaffff', 0.85); // 飛沫
        for (const [dx, dy, rr] of [[-r * 0.55, -r * 0.95, 0.1], [r * 0.5, -r * 1.0, 0.08], [r * 0.85, -r * 0.4, 0.07]]) { ctx.beginPath(); ctx.arc(dx, dy, r * rr, 0, 7); ctx.fill(); }
        eye = { x: r * 0.3, y: -r * 0.05, r: r * 0.17, slit: false, color: '#1d6fa5' };
        break;
      }
      case 'plant': { // 植物：葉の体＋葉脈＋芽
        rim = false;
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.2);
        ctx.quadraticCurveTo(r * 1.15, -r * 0.1, r * 0.75, r * 0.85);
        ctx.lineTo(-r * 0.75, r * 0.85);
        ctx.quadraticCurveTo(-r * 1.15, -r * 0.1, 0, -r * 1.2);
        ctx.closePath(); body();
        ctx.strokeStyle = rgba(tint(color, -0.3), 0.55); ctx.lineWidth = lw * 0.8;
        ctx.beginPath(); ctx.moveTo(0, -r * 1.05); ctx.lineTo(0, r * 0.7);
        for (const ty of [-0.5, -0.1, 0.3]) { ctx.moveTo(0, r * ty); ctx.lineTo(r * 0.45, r * (ty - 0.2)); ctx.moveTo(0, r * ty); ctx.lineTo(-r * 0.45, r * (ty - 0.2)); }
        ctx.stroke(); ctx.lineWidth = lw;
        for (const sx of [-1, 1]) { // 左右の小葉
          ctx.beginPath(); ctx.ellipse(sx * r * 0.85, r * 0.2, r * 0.32, r * 0.16, sx * -0.6, 0, 7); part(0.1);
        }
        eye = { x: r * 0.28, y: r * 0.0, r: r * 0.18, slit: false, color: '#caa11e' };
        break;
      }
      case 'mage': { // 魔術師：とんがり帽子・ローブ・杖・足元の魔法陣
        rim = false;
        const arc = '#9a7bff'; // 魔力の発光色
        // 足元の魔法陣（回転する二重リング＋ルーン）
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(arc, 0.7); ctx.lineWidth = lw * 0.9;
        ctx.beginPath(); ctx.ellipse(0, r * 0.95, r * 1.05, r * 0.34, 0, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, r * 0.95, r * 0.72, r * 0.23, 0, 0, 7); ctx.stroke();
        ctx.fillStyle = rgba(arc, 0.8);
        for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.88, r * 0.95 + Math.sin(a) * r * 0.28, 1.6 * s, 0, 7); ctx.fill(); }
        ctx.restore();
        // 杖（右手側。柄＋先端の光球）
        ctx.strokeStyle = '#7a5230'; ctx.lineWidth = lw * 1.3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(r * 0.78, r * 0.95); ctx.lineTo(r * 0.62, -r * 0.95); ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba(arc, 0.4); ctx.beginPath(); ctx.arc(r * 0.6, -r * 1.05, r * 0.28, 0, 7); ctx.fill(); ctx.restore();
        ctx.fillStyle = arc; ctx.strokeStyle = outline; ctx.lineWidth = lw * 0.7;
        ctx.beginPath(); ctx.arc(r * 0.6, -r * 1.05, r * 0.14, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = rgba('#ffffff', 0.9); ctx.beginPath(); ctx.arc(r * 0.55, -r * 1.1, r * 0.05, 0, 7); ctx.fill();
        ctx.lineWidth = lw;
        // ローブ（広がる裾＋袖）
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.55);
        ctx.quadraticCurveTo(r * 0.7, -r * 0.4, r * 0.95, r * 0.95);
        ctx.quadraticCurveTo(r * 0.45, r * 0.7, 0, r * 0.95);
        ctx.quadraticCurveTo(-r * 0.45, r * 0.7, -r * 0.95, r * 0.95);
        ctx.quadraticCurveTo(-r * 0.7, -r * 0.4, 0, -r * 0.55);
        ctx.closePath(); body();
        castShadow(0, -r * 0.16, r * 0.66, r * 0.16, 0.28); // 帽子のつば→ローブの落ち影
        // 前合わせ＋裾の縁取り
        ctx.strokeStyle = rgba(arc, 0.6); ctx.lineWidth = lw * 0.8;
        ctx.beginPath(); ctx.moveTo(0, -r * 0.4); ctx.lineTo(0, r * 0.85); ctx.stroke();
        ctx.lineWidth = lw;
        // 顔（帽子の影に沈む。光る眼）
        ctx.fillStyle = '#120a1e';
        ctx.beginPath(); ctx.ellipse(0, -r * 0.42, r * 0.42, r * 0.34, 0, 0, 7); ctx.fill();
        // とんがり帽子（つば＋折れた先端）
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.ellipse(0, -r * 0.5, r * 0.72, r * 0.2, 0, 0, 7); ctx.fill(); ctx.stroke(); // つば
        ctx.beginPath();
        ctx.moveTo(-r * 0.5, -r * 0.5);
        ctx.quadraticCurveTo(-r * 0.2, -r * 1.5, r * 0.55, -r * 1.7); // 折れて垂れる先端
        ctx.quadraticCurveTo(r * 0.2, -r * 1.1, r * 0.5, -r * 0.5);
        ctx.closePath(); body();
        ctx.fillStyle = arc; ctx.beginPath(); ctx.arc(r * 0.55, -r * 1.7, r * 0.1, 0, 7); ctx.fill(); // 先端の飾り玉
        ctx.fillStyle = rgba(arc, 0.7); ctx.fillRect(-r * 0.7, -r * 0.58, r * 1.4, r * 0.1); // 帽子の帯
        // 光る眼
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (const sx of [-1, 1]) { ctx.fillStyle = '#d9c4ff'; ctx.beginPath(); ctx.ellipse(sx * r * 0.16, -r * 0.4, r * 0.07, r * 0.05, 0, 0, 7); ctx.fill();
          ctx.fillStyle = rgba(arc, 0.6); ctx.beginPath(); ctx.arc(sx * r * 0.16, -r * 0.4, r * 0.16, 0, 7); ctx.fill(); }
        ctx.restore();
        drawEyes = false;
        break;
      }
      case 'spirit': { // 精霊/妖精：発光する核＋透ける羽＋きらめき
        rim = false;
        ctx.save(); ctx.globalAlpha = 0.55;
        for (const sx of [-1, 1]) { // 透明な羽
          ctx.beginPath(); ctx.ellipse(sx * r * 0.7, -r * 0.15, r * 0.55, r * 0.78, sx * 0.4, 0, 7);
          ctx.fillStyle = tint(color, 0.45); ctx.fill(); ctx.strokeStyle = rgba('#ffffff', 0.6); ctx.lineWidth = lw * 0.6; ctx.stroke();
        }
        ctx.restore();
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; // 発光ハロー
        ctx.fillStyle = rgba(tint(color, 0.5), 0.5); ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, 7); ctx.fill(); ctx.restore();
        ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, 7); body(); // 核
        ctx.lineWidth = lw;
        ctx.fillStyle = rgba('#ffffff', 0.9); // きらめき
        for (const [dx, dy, rr] of [[-r * 0.95, -r * 0.6, 0.12], [r * 0.9, r * 0.2, 0.1], [r * 0.2, -r * 1.0, 0.09]]) {
          ctx.beginPath(); ctx.moveTo(dx, dy - r * rr); ctx.lineTo(dx + r * rr * 0.4, dy); ctx.lineTo(dx, dy + r * rr);
          ctx.lineTo(dx - r * rr * 0.4, dy); ctx.closePath(); ctx.fill();
        }
        eye = { x: r * 0.18, y: -r * 0.02, r: r * 0.12, slit: false, color: '#ffffff' };
        break;
      }
      default: { // slime ほか：ぷるんとした塊
        ctx.beginPath();
        ctx.moveTo(-r, r * 0.7);
        ctx.quadraticCurveTo(-r * 1.05, -r * 0.9, 0, -r);
        ctx.quadraticCurveTo(r * 1.05, -r * 0.9, r, r * 0.7);
        ctx.quadraticCurveTo(r * 0.5, r * 0.95, 0, r * 0.85);
        ctx.quadraticCurveTo(-r * 0.5, r * 0.95, -r, r * 0.7);
        ctx.closePath(); body();
        ctx.fillStyle = rgba('#ffffff', 0.55);
        ctx.beginPath(); ctx.ellipse(-r * 0.32, -r * 0.42, r * 0.22, r * 0.12, -0.5, 0, 7); ctx.fill();
        eye = { x: r * 0.3, y: r * 0.0, r: r * 0.18, slit: false, color: '#1a0a08' };
        break;
      }
    }

    // リムライト（丸みのある体のみ。翼つきは省略）
    if (rim) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#ffffff', 0.18); ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.92, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.restore();
    }

    // 目（白目＋虹彩＋瞳＋ハイライト。slitで縦長瞳）
    if (drawEyes) {
      for (const sx of [-1, 1]) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(sx * eye.x, eye.y, eye.r, eye.r * (eye.slit ? 1.15 : 1), 0, 0, 7); ctx.fill();
        ctx.fillStyle = eye.color;
        ctx.beginPath(); ctx.arc(sx * eye.x, eye.y, eye.r * 0.6, 0, 7); ctx.fill();
        ctx.fillStyle = '#1a0a08';
        if (eye.slit) { ctx.beginPath(); ctx.ellipse(sx * eye.x, eye.y, eye.r * 0.18, eye.r * 0.78, 0, 0, 7); ctx.fill(); }
        else { ctx.beginPath(); ctx.arc(sx * eye.x, eye.y, eye.r * 0.28, 0, 7); ctx.fill(); }
        ctx.fillStyle = rgba('#ffffff', 0.9);
        ctx.beginPath(); ctx.arc(sx * eye.x - eye.r * 0.3, eye.y - eye.r * 0.3, eye.r * 0.18, 0, 7); ctx.fill();
      }
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
