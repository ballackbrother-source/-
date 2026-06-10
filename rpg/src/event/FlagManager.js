/**
 * event/FlagManager.js
 * @layer application
 * フラグ・変数の取得/設定と、宣言的な条件判定（§02, §04-6）。
 * 条件オブジェクト例:
 *   { flag:"FLG_1_07" }                  // フラグが真
 *   { notFlag:"FLG_1_07" }
 *   { chapterAtLeast:"ch1" }
 *   { hasItem:"herb", count:2 }
 *   { varGte:["arena_rank", 3] }
 */
export class FlagManager {
  constructor(state, db, chapters) {
    this.state = state; this.db = db; this.chapterMgr = chapters;
  }

  get(key) { return this.state.flags[key]; }
  set(key, value = true) { this.state.flags[key] = value; }
  on(key) { return !!this.state.flags[key]; }

  getVar(key) { return this.state.variables[key] || 0; }
  setVar(key, value) { this.state.variables[key] = value; }
  addVar(key, delta) { this.state.variables[key] = this.getVar(key) + delta; }

  /** 条件（オブジェクト or 配列=AND）を評価 */
  test(cond) {
    if (!cond) return true;
    if (Array.isArray(cond)) return cond.every((c) => this.test(c));
    if (cond.flag && !this.on(cond.flag)) return false;
    if (cond.notFlag && this.on(cond.notFlag)) return false;
    if (cond.chapterAtLeast && !this.chapterMgr.isAtLeast(cond.chapterAtLeast)) return false;
    if (cond.hasItem) {
      const n = this.state.inventory.items[cond.hasItem] || 0;
      if (n < (cond.count || 1)) return false;
    }
    if (cond.varGte) {
      const [k, v] = cond.varGte;
      if (this.getVar(k) < v) return false;
    }
    if (cond.varEq) {
      const [k, v] = cond.varEq;
      if (this.getVar(k) !== v) return false;
    }
    return true;
  }
}
