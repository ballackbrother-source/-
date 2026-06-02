/**
 * core/RNG.js
 * @layer core
 * シード可能な擬似乱数（mulberry32）。戦闘の再現性・デバッグに使う。
 */
export class RNG {
  constructor(seed = (Date.now() >>> 0)) { this.seed = seed >>> 0; }

  /** 0以上1未満 */
  next() {
    this.seed |= 0; this.seed = (this.seed + 0x6D2B79F5) | 0;
    let t = Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** [min, max] の整数 */
  int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }
  /** [min, max) の実数 */
  float(min, max) { return min + this.next() * (max - min); }
  /** 確率 p (0..1) で true */
  chance(p) { return this.next() < p; }
}

// グローバル共有インスタンス（明示的に差し替え可能）
export const rng = new RNG();
