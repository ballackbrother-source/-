/**
 * core/Renderer.js
 * @layer core
 * Canvas 2D のラッパ。仮想解像度(VIEW_W×VIEW_H)へ描画し、実画面サイズへ
 * アスペクト比維持のレターボックスで自動スケールする。
 * 文字・矩形・スプライト・ゲージなどの汎用描画APIを提供。
 */
import { VIEW_W, VIEW_H, COLORS } from '../config/constants.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 1; this.offX = 0; this.offY = 0;
    this.ctx.imageSmoothingEnabled = false;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** 実画面に合わせてキャンバスとスケール係数を更新（レスポンシブ対応） */
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const cw = window.innerWidth, ch = window.innerHeight;
    const s = Math.min(cw / VIEW_W, ch / VIEW_H);
    this.scale = s;
    this.canvas.width = Math.floor(VIEW_W * s * dpr);
    this.canvas.height = Math.floor(VIEW_H * s * dpr);
    this.canvas.style.width = `${Math.floor(VIEW_W * s)}px`;
    this.canvas.style.height = `${Math.floor(VIEW_H * s)}px`;
    this.ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0); // 仮想座標で描けるように
    this.ctx.imageSmoothingEnabled = false;
  }

  /** 画面座標(0..VIEW_W) → 実ピクセル。タッチ判定用 */
  toVirtual(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left) / this.scale, y: (clientY - r.top) / this.scale };
  }

  clear(color = '#000') { this.ctx.fillStyle = color; this.ctx.fillRect(0, 0, VIEW_W, VIEW_H); }

  rect(x, y, w, h, color) { this.ctx.fillStyle = color; this.ctx.fillRect(x, y, w, h); }
  strokeRect(x, y, w, h, color, lw = 1) {
    this.ctx.strokeStyle = color; this.ctx.lineWidth = lw;
    this.ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  /** 基準色を白/黒へ寄せる（amt: -1..1） */
  _shade(hex, amt) {
    const n = parseInt(String(hex).replace('#', ''), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const t = amt >= 0 ? 255 : 0, p = Math.min(1, Math.abs(amt));
    const m = (v) => Math.round(v + (t - v) * p);
    return `rgb(${m(r)},${m(g)},${m(b)})`;
  }

  /** 角丸ウィンドウ枠（メッセージ/メニュー共通・イラスト調） */
  window(x, y, w, h) {
    const c = this.ctx;
    // 本体（縦グラデ＋落ち影）
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 8; c.shadowOffsetY = 3;
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#17244f'); g.addColorStop(1, '#0b1230');
    c.fillStyle = g; this.roundPath(x, y, w, h, 8); c.fill();
    c.restore();
    // 内側・上半分のやわらかなハイライト
    c.save(); this.roundPath(x + 2, y + 2, w - 4, h - 4, 6); c.clip();
    const hl = c.createLinearGradient(0, y, 0, y + h * 0.55);
    hl.addColorStop(0, 'rgba(174,224,255,0.16)'); hl.addColorStop(1, 'rgba(174,224,255,0)');
    c.fillStyle = hl; c.fillRect(x, y, w, h * 0.55);
    c.restore();
    // 二重枠
    c.lineWidth = 3; c.strokeStyle = COLORS.windowBorder2; this.roundPath(x, y, w, h, 8); c.stroke();
    c.lineWidth = 1; c.strokeStyle = COLORS.windowBorder;  this.roundPath(x + 2, y + 2, w - 4, h - 4, 6); c.stroke();
    // 四隅の光点
    c.fillStyle = COLORS.windowBorder;
    for (const [px, py] of [[x + 6, y + 6], [x + w - 6, y + 6], [x + 6, y + h - 6], [x + w - 6, y + h - 6]]) {
      c.beginPath(); c.arc(px, py, 1.3, 0, 7); c.fill();
    }
  }
  roundPath(x, y, w, h, r) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  /** 影付きテキスト。align: left|center|right */
  text(str, x, y, { size = 18, color = COLORS.text, align = 'left', shadow = true, font = 'sans-serif' } = {}) {
    const c = this.ctx;
    c.font = `${size}px ${font}`;
    c.textAlign = align; c.textBaseline = 'top';
    if (shadow) { c.fillStyle = COLORS.textShadow; c.fillText(str, x + 2, y + 2); }
    c.fillStyle = color; c.fillText(str, x, y);
  }

  /** ラベル付きゲージ（HP/MP/EXP・角丸＋グラデ＋照り） */
  gauge(x, y, w, h, ratio, color, bg = '#22293f') {
    const c = this.ctx, rr = Math.min(h / 2, 4);
    c.save();
    this.roundPath(x, y, w, h, rr); c.clip();
    c.fillStyle = bg; c.fillRect(x, y, w, h); // くぼんだ地
    const fw = Math.max(0, Math.min(1, ratio)) * w;
    if (fw > 0.5) {
      const g = c.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, this._shade(color, 0.4)); g.addColorStop(0.5, color); g.addColorStop(1, this._shade(color, -0.22));
      c.fillStyle = g; c.fillRect(x, y, fw, h);
      c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(x, y + 1, fw, Math.max(1, h * 0.3)); // 上面の照り
    }
    c.restore();
    this.roundPath(x, y, w, h, rr); c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,0.5)'; c.stroke();
  }

  /** 既に生成済みのスプライト(canvas/img)を描画 */
  sprite(img, dx, dy, dw = img.width, dh = img.height) {
    if (img) this.ctx.drawImage(img, dx, dy, dw, dh);
  }

  save() { this.ctx.save(); }
  restore() { this.ctx.restore(); }
  translate(x, y) { this.ctx.translate(x, y); }
  alpha(a) { this.ctx.globalAlpha = a; }
}
