/**
 * event/ChapterManager.js
 * @layer application
 * 章の進行管理（§02の章構成）。章は順序を持ち、isAtLeastで到達判定。
 */
export class ChapterManager {
  constructor(state, db) { this.state = state; this.db = db; }

  /** 定義順の配列（world.json chapters のキー順） */
  get order() { return Object.keys(this.db.chapters); }

  get currentId() { return this.state.chapter.id; }
  get currentStep() { return this.state.chapter.step; }
  name(id = this.currentId) { return this.db.chapterName(id); }

  index(id) { return this.order.indexOf(id); }
  isAtLeast(id) { return this.index(this.currentId) >= this.index(id); }

  set(id, step = 0) {
    this.state.chapter = { id, step };
  }
  setStep(step) { this.state.chapter.step = step; }

  /** 次章へ */
  advance() {
    const i = this.index(this.currentId);
    if (i >= 0 && i < this.order.length - 1) this.set(this.order[i + 1], 0);
  }
}
