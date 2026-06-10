/**
 * core/EventBus.js
 * @layer core
 * 疎結合な pub/sub。横断的通知（レベルアップ/BGM変更等）専用。
 * 主要データフローはGameState直参照で行い、ここを乱用しない方針。
 */
export class EventBus {
  constructor() { this._map = new Map(); }

  on(type, fn) {
    if (!this._map.has(type)) this._map.set(type, new Set());
    this._map.get(type).add(fn);
    return () => this.off(type, fn); // 解除関数を返す
  }
  off(type, fn) { this._map.get(type)?.delete(fn); }
  emit(type, payload) {
    this._map.get(type)?.forEach((fn) => fn(payload));
  }
}
