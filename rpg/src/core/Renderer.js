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

  /** 角丸ウィンドウ枠（メッセージ/メニュー共通） */
  window(x, y, w, h) {
    const c = this.ctx;
    c.fillStyle = COLORS.window; this.roundPath(x, y, w, h, 8); c.fill();
    c.lineWidth = 3; c.strokeStyle = COLORS.windowBorder2; this.roundPath(x, y, w, h, 8); c.stroke();
    c.lineWidth = 1; c.strokeStyle = COLORS.windowBorder;  this.roundPath(x + 2, y + 2, w - 4, h - 4, 6); c.stroke();
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

  /** ラベル付きゲージ（HP/MP/EXP） */
  gauge(x, y, w, h, ratio, color, bg = '#22293f') {
    this.rect(x, y, w, h, bg);
    this.rect(x, y, Math.max(0, Math.min(1, ratio)) * w, h, color);
    this.strokeRect(x, y, w, h, '#00000080');
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
