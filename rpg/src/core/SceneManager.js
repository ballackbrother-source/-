/**
 * core/SceneManager.js
 * @layer core
 * シーンスタック管理。push/pop/replace。最前面のみupdate、
 * opaqueに応じて下から描画する（オーバーレイ表現）。
 */
export class SceneManager {
  constructor() { this.stack = []; }

  get current() { return this.stack[this.stack.length - 1]; }

  push(scene, params) {
    this.current?.onPause();
    this.stack.push(scene);
    scene.onEnter(params);
  }
  pop() {
    const s = this.stack.pop();
    s?.onExit();
    this.current?.onResume();
    return s;
  }
  /** 現在のシーンを置き換える（タイトル→フィールド等） */
  replace(scene, params) {
    const old = this.stack.pop();
    old?.onExit();
    this.stack.push(scene);
    scene.onEnter(params);
  }
  /** スタックを空にして1枚だけにする */
  reset(scene, params) {
    while (this.stack.length) this.stack.pop()?.onExit();
    this.push(scene, params);
  }

  update(dt) { this.current?.update(dt); }

  render(r) {
    // opaqueなシーンを下から探し、そこから上を順に描画
    let i = this.stack.length - 1;
    while (i > 0 && !this.stack[i].opaque) i--;
    for (; i < this.stack.length; i++) this.stack[i].render(r);
  }
}
