/**
 * core/Input.js
 * @layer core
 * キーボード/タッチ入力を論理ボタンへ変換する。
 * 押下「瞬間」は keydown イベントでバッファに積む（poll間で押して離した
 * 超高速入力も取りこぼさない）。auto-repeatは初回のみ pressed 扱い。
 * - isDown:    押されている
 * - isPressed: このフレームに押された瞬間
 * - isReleased:このフレームに離された瞬間
 */
import { KEY_MAP, BUTTONS } from '../config/keybindings.js';

export class Input {
  constructor() {
    this._down = new Set();      // 物理的に押下中
    this._virtual = new Set();   // タッチUI由来の押下
    this._pressBuf = new Set();  // 次pollまでに発生した「押した瞬間」
    this._pressed = new Set();
    this._released = new Set();
    this._prev = new Set();      // 前フレームのdown|virtual
  }

  attach(target = window) {
    target.addEventListener('keydown', (e) => {
      const btn = KEY_MAP[e.code];
      if (!btn) return;
      e.preventDefault();
      if (!this._down.has(btn)) this._pressBuf.add(btn); // 初回のみ（リピート無視）
      this._down.add(btn);
    });
    target.addEventListener('keyup', (e) => {
      const btn = KEY_MAP[e.code];
      if (!btn) return;
      e.preventDefault();
      this._down.delete(btn);
    });
    window.addEventListener('blur', () => this._down.clear());
  }

  /** タッチUI用：押下/解放 */
  setVirtual(btn, isDown) {
    if (!BUTTONS.includes(btn)) return;
    if (isDown) { if (!this._virtual.has(btn)) this._pressBuf.add(btn); this._virtual.add(btn); }
    else this._virtual.delete(btn);
  }

  /** Game.update の先頭で毎フレーム呼ぶ */
  poll() {
    const now = new Set([...this._down, ...this._virtual]);
    this._pressed = new Set(this._pressBuf);
    this._pressBuf.clear();
    this._released = new Set([...this._prev].filter((b) => !now.has(b)));
    this._prev = now;
  }

  isDown(btn)     { return this._prev.has(btn); }
  isPressed(btn)  { return this._pressed.has(btn); }
  isReleased(btn) { return this._released.has(btn); }

  dir() {
    if (this.isDown('up')) return 'up';
    if (this.isDown('down')) return 'down';
    if (this.isDown('left')) return 'left';
    if (this.isDown('right')) return 'right';
    return null;
  }
}
