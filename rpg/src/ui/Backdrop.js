/**
 * ui/Backdrop.js
 * @layer presentation(ui)
 * 雰囲気のある背景の手続き描画（戦闘／タイトル）。外部画像なし。
 * グラデの空・きらめく星・月・地平の光・遠景シルエットで奥行きを出す。
 * 公開: drawBattleBg(ctx, opt) / drawTitleBg(ctx, t)
 */
import { VIEW_W, VIEW_H } from '../config/constants.js';

function rgba(hex, a) {
  hex = String(hex).replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// 決定論的にちりばめる星（tickでまたたく）
function starfield(ctx, count, w, hMax, tick, color) {
  for (let i = 0; i < count; i++) {
    const x = (i * 137.5) % w;
    const y = (i * 211.3) % hMax;
    const big = i % 11 === 0;
    const tw = (Math.sin(tick * 0.05 + i * 1.3) + 1) / 2;
    ctx.fillStyle = rgba(color, 0.18 + tw * 0.62);
    if (big) {
      const rr = 1.4 + tw * 1.1;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill();
      ctx.fillStyle = rgba(color, 0.12 + tw * 0.18); // ほのかな光暈
      ctx.beginPath(); ctx.arc(x, y, rr * 2.4, 0, 7); ctx.fill();
    } else {
      ctx.fillRect(x, y, 2, 2);
    }
  }
}

// 月（光暈つき）
function moon(ctx, x, y, r, col) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba(col, 0.25);
  ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, 7); ctx.fill();
  ctx.restore();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, col); g.addColorStop(1, rgba(col, 0.6));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.fillStyle = rgba('#000000', 0.08); // クレーター
  for (const [dx, dy, rr] of [[-0.3, 0.2, 0.18], [0.25, -0.1, 0.12], [0.1, 0.4, 0.1]]) {
    ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, rr * r, 0, 7); ctx.fill();
  }
}

// 連なる山並みのシルエット
function ridge(ctx, baseY, amp, step, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(0, VIEW_H);
  ctx.lineTo(0, baseY);
  let peak = 0;
  for (let x = 0; x <= VIEW_W; x += step) {
    const h = baseY - (Math.sin(x * 0.6) * 0.5 + Math.sin(x * 0.21 + 1) * 0.5 + 1) * amp * 0.5;
    ctx.lineTo(x, h); peak ^= 1;
  }
  ctx.lineTo(VIEW_W, VIEW_H); ctx.closePath(); ctx.fill();
}

/** 戦闘背景。opt = { boss, special, tick } */
// ロケーション(mood)ごとの戦闘背景パレット（通常戦のみ反映）
const BATTLE_ENV = {
  default: { s0: '#091230', s1: '#163a64', glow: '#4f93c4', g0: '#13243f', g1: '#070f1e', star: '#ffffff', moon: '#cfe6ff' },
  town:    { s0: '#0a1230', s1: '#163a64', glow: '#4f93c4', g0: '#13243f', g1: '#070f1e', star: '#ffffff', moon: '#cfe6ff' },
  forest:  { s0: '#0a1a14', s1: '#16402e', glow: '#4fae74', g0: '#12281c', g1: '#06120c', star: '#dfffe6', moon: '#cfe6cf' },
  cave:    { s0: '#0a0a16', s1: '#1a1626', glow: '#7a5a3a', g0: '#1c1622', g1: '#070510', star: '#caa', moon: '#9a8a7a' },
  snow:    { s0: '#16243f', s1: '#3a5f86', glow: '#bfe4ff', g0: '#24364f', g1: '#0e1a2e', star: '#ffffff', moon: '#eaf4ff' },
  shrine:  { s0: '#0a1430', s1: '#243a6a', glow: '#7fb0ff', g0: '#161f3f', g1: '#080a1a', star: '#cfe0ff', moon: '#bfe8ff' },
  ruin:    { s0: '#1a0e16', s1: '#3a2030', glow: '#c87a4a', g0: '#241420', g1: '#100610', star: '#ffd9c0', moon: '#ffc69a' },
  indoor:  { s0: '#140e08', s1: '#2e2012', glow: '#caa24a', g0: '#241a10', g1: '#0e0804', star: '#ffe0a0', moon: '#ffd9a0' },
};

export function drawBattleBg(ctx, { boss = false, special = false, tick = 0, env = 'default' } = {}) {
  const HZ = 212; // 地平線
  const P = special
    ? { s0: '#160a2e', s1: '#2c1450', glow: '#8a52d6', g0: '#1d1142', g1: '#090720', star: '#e7d8ff', moon: '#d9c6ff' }
    : boss
      ? { s0: '#190a13', s1: '#341021', glow: '#c24356', g0: '#2a0e1c', g1: '#100510', star: '#ffd9d9', moon: '#ff9f8e' }
      : (BATTLE_ENV[env] || BATTLE_ENV.default);

  // 空
  const sky = ctx.createLinearGradient(0, 0, 0, HZ);
  sky.addColorStop(0, P.s0); sky.addColorStop(1, P.s1);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, VIEW_W, HZ);

  // 地平のグロー
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const gl = ctx.createRadialGradient(VIEW_W / 2, HZ, 10, VIEW_W / 2, HZ, VIEW_W * 0.6);
  gl.addColorStop(0, rgba(P.glow, 0.55)); gl.addColorStop(1, rgba(P.glow, 0));
  ctx.fillStyle = gl; ctx.fillRect(0, 40, VIEW_W, HZ);
  if (special) { // 星雲
    for (const [cx, cy, rr, col, a] of [[150, 90, 150, '#b558ff', 0.18], [500, 70, 170, '#48b0ff', 0.16]]) {
      const n = ctx.createRadialGradient(cx, cy, 10, cx, cy, rr);
      n.addColorStop(0, rgba(col, a)); n.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = n; ctx.fillRect(0, 0, VIEW_W, HZ);
    }
  }
  ctx.restore();

  starfield(ctx, 80, VIEW_W, HZ - 6, tick, P.star);
  moon(ctx, boss ? 96 : VIEW_W - 96, 70, special ? 30 : 26, P.moon);

  // 遠景の山並み（2層）
  ridge(ctx, HZ - 2, 46, 26, rgba(P.s0, 0.85));
  ridge(ctx, HZ + 4, 30, 34, rgba('#000000', 0.45));

  // 地平線の光の筋
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba(P.glow, 0.5); ctx.fillRect(0, HZ - 1, VIEW_W, 2);
  ctx.restore();

  // 地面
  const grd = ctx.createLinearGradient(0, HZ, 0, VIEW_H);
  grd.addColorStop(0, P.g0); grd.addColorStop(1, P.g1);
  ctx.fillStyle = grd; ctx.fillRect(0, HZ, VIEW_W, VIEW_H - HZ);

  // 床のパース線（中央へ収束）＋接地もや
  ctx.save();
  ctx.strokeStyle = rgba(P.glow, 0.10); ctx.lineWidth = 1;
  for (let k = -7; k <= 7; k++) {
    ctx.beginPath(); ctx.moveTo(VIEW_W / 2 + k * 6, HZ); ctx.lineTo(VIEW_W / 2 + k * 60, VIEW_H); ctx.stroke();
  }
  const fog = ctx.createLinearGradient(0, HZ, 0, HZ + 60);
  fog.addColorStop(0, rgba(P.glow, 0.18)); fog.addColorStop(1, rgba(P.glow, 0));
  ctx.fillStyle = fog; ctx.fillRect(0, HZ, VIEW_W, 60);
  ctx.restore();
}

// 場所/時間帯ごとの空気感プリセット
const MOODS = {
  day:    { top: '#fff4d8', topA: 0.07, vig: 0.30, vigCol: '#000814' },
  town:   { top: '#fff0c8', topA: 0.09, vig: 0.26, vigCol: '#1a0e06' },
  forest: { tint: '#103a1c', tintA: 0.16, top: '#dfffe0', topA: 0.06, vig: 0.34, vigCol: '#02160a' },
  cave:   { tint: '#0a1024', tintA: 0.5, top: '#3a5fa0', topA: 0, vig: 0.55, vigCol: '#000208', torch: true },
  snow:   { tint: '#cfe6ff', tintA: 0.13, top: '#ffffff', topA: 0.1, vig: 0.22, vigCol: '#0a1a30' },
  shrine: { tint: '#16264a', tintA: 0.2, top: '#bfe8ff', topA: 0.09, vig: 0.36, vigCol: '#020814' },
  ruin:   { tint: '#3a1e2a', tintA: 0.2, top: '#ffc69a', topA: 0.07, vig: 0.4, vigCol: '#120406' },
  indoor: { tint: '#2a1c10', tintA: 0.22, top: '#ffd9a0', topA: 0.08, vig: 0.34, vigCol: '#0e0804' },
};

/** フィールドの空気感：場所/時間帯ごとの色温度＋光＋ビネット（質感統一） */
export function drawFieldAmbient(ctx, mood = 'day') {
  const M = MOODS[mood] || MOODS.day;
  // 全体の色被せ（色温度）
  if (M.tintA) { ctx.fillStyle = rgba(M.tint, M.tintA); ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
  // 上からの光
  if (M.topA) {
    const top = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    top.addColorStop(0, rgba(M.top, M.topA)); top.addColorStop(0.4, rgba(M.top, 0));
    ctx.fillStyle = top; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  // 洞窟の松明グロー（画面中央＝プレイヤー付近）
  if (M.torch) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 20, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.7);
    g.addColorStop(0, rgba('#ffb24a', 0.24)); g.addColorStop(0.5, rgba('#ff8a3a', 0.08)); g.addColorStop(1, rgba('#ff8a3a', 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H); ctx.restore();
  }
  // ビネット
  const vg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.34, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.82);
  vg.addColorStop(0, rgba(M.vigCol, 0)); vg.addColorStop(1, rgba(M.vigCol, M.vig));
  ctx.fillStyle = vg; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

/** マップID → 空気感プリセット */
export function fieldMood(mapId) {
  return ({
    hafen: 'town', lumina: 'day', lumina_forest: 'forest', lumina_house: 'indoor',
    cavern: 'cave', frost: 'snow', shrine: 'shrine', ruin: 'ruin', vale: 'forest',
  })[mapId] || 'day';
}

/** マップID → 天候（none/snow/rain）。屋内は無し */
export function fieldWeather(mapId) {
  return ({ frost: 'snow', ruin: 'rain' })[mapId] || 'none';
}

/** タイトル背景。t = フレームカウンタ */
export function drawTitleBg(ctx, t = 0) {
  // 空
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, '#05070f'); sky.addColorStop(0.55, '#0b1430'); sky.addColorStop(1, '#142a52');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // ゆっくり流れる雲（星の背後）
  ctx.save();
  for (const [cy0, scale, spd, alpha] of [[70, 1.0, 0.18, 0.10], [132, 1.4, 0.10, 0.08], [44, 0.7, 0.26, 0.07]]) {
    const cx = ((t * spd) % (VIEW_W + 240)) - 120;
    ctx.fillStyle = rgba('#9fb8e0', alpha);
    for (const [dx, dy, rx, ry] of [[0, 0, 60, 16], [42, -6, 44, 13], [-44, 4, 40, 12], [84, 4, 34, 11]]) {
      ctx.beginPath(); ctx.ellipse(cx + dx * scale, cy0 + dy, rx * scale, ry * scale, 0, 0, 7); ctx.fill();
    }
  }
  ctx.restore();

  // オーロラ／星雲
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const [cx, cy, rr, col, a] of [[180, 150, 230, '#2f6fd0', 0.16], [470, 120, 210, '#7a3fc0', 0.15], [VIEW_W / 2, 110, 180, '#3fb0c0', 0.12]]) {
    const n = ctx.createRadialGradient(cx, cy, 10, cx, cy, rr);
    n.addColorStop(0, rgba(col, a)); n.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = n; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  ctx.restore();

  starfield(ctx, 110, VIEW_W, VIEW_H - 110, t, '#ffffff');
  moon(ctx, 110, 96, 30, '#cfe0ff');

  // 流れ星（ときどき上空を横切る）
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 2; k++) {
    const period = 300 + k * 170, ph = ((t + k * 150) % period) / period;
    if (ph < 0.16) {
      const p = ph / 0.16, sx = 60 + p * VIEW_W * 0.72 + k * 110, sy = 36 + p * 84 + k * 26, len = 28;
      const g = ctx.createLinearGradient(sx, sy, sx - len, sy - len * 0.55);
      g.addColorStop(0, rgba('#ffffff', 0.9 * (1 - p))); g.addColorStop(1, rgba('#aee0ff', 0));
      ctx.strokeStyle = g; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - len, sy - len * 0.55); ctx.stroke();
      ctx.fillStyle = rgba('#ffffff', 0.9 * (1 - p)); ctx.beginPath(); ctx.arc(sx, sy, 1.6, 0, 7); ctx.fill();
    }
  }
  ctx.restore();

  // タイトル裏のやわらかな光暈
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(VIEW_W / 2, 118, 10, VIEW_W / 2, 118, 220);
  halo.addColorStop(0, rgba('#aee0ff', 0.16)); halo.addColorStop(1, rgba('#aee0ff', 0));
  ctx.fillStyle = halo; ctx.fillRect(0, 0, VIEW_W, 320);
  ctx.restore();

  // 遠景：丘のシルエット＋城／尖塔
  ridge(ctx, VIEW_H - 70, 40, 30, '#0c1226');
  ctx.fillStyle = '#070b18';
  ctx.beginPath(); ctx.moveTo(0, VIEW_H); ctx.lineTo(0, VIEW_H - 46);
  for (let x = 0; x <= VIEW_W; x += 40) ctx.lineTo(x, VIEW_H - 46 - (Math.sin(x * 0.13) * 0.5 + 0.5) * 22);
  ctx.lineTo(VIEW_W, VIEW_H); ctx.closePath(); ctx.fill();
  castle(ctx, VIEW_W - 150, VIEW_H - 60);

  // ふもとの灯り
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const x = (i * 89 + 30) % VIEW_W, y = VIEW_H - 30 - (i % 3) * 6;
    const tw = (Math.sin(t * 0.06 + i) + 1) / 2;
    ctx.fillStyle = rgba('#ffcf7a', 0.3 + tw * 0.4);
    ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill();
  }
  ctx.restore();
}

// 城／尖塔のシルエット
function castle(ctx, x, baseY) {
  ctx.fillStyle = '#05080f';
  const wall = (wx, w, h) => ctx.fillRect(wx, baseY - h, w, h);
  wall(x, 70, 50);
  // 銃眼
  for (let i = 0; i < 5; i++) ctx.fillRect(x + i * 15, baseY - 56, 8, 8);
  // 中央の塔
  wall(x + 24, 24, 84);
  ctx.beginPath(); ctx.moveTo(x + 20, baseY - 84); ctx.lineTo(x + 36, baseY - 104); ctx.lineTo(x + 52, baseY - 84); ctx.closePath(); ctx.fill();
  // 脇の塔
  wall(x - 10, 16, 64); wall(x + 64, 16, 64);
  ctx.beginPath(); ctx.moveTo(x - 12, baseY - 64); ctx.lineTo(x - 2, baseY - 80); ctx.lineTo(x + 8, baseY - 64); ctx.closePath();
  ctx.moveTo(x + 62, baseY - 64); ctx.lineTo(x + 72, baseY - 80); ctx.lineTo(x + 82, baseY - 64); ctx.closePath(); ctx.fill();
  // 窓灯り
  ctx.fillStyle = 'rgba(255,207,122,0.7)';
  ctx.fillRect(x + 32, baseY - 70, 4, 6); ctx.fillRect(x - 5, baseY - 50, 3, 5); ctx.fillRect(x + 69, baseY - 50, 3, 5);
}
