/**
 * config/keybindings.js
 * @layer config
 * 物理キー → 論理ボタンのマッピング。Inputがこれを参照する。
 */
export const KEY_MAP = Object.freeze({
  // 移動
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  // 決定 / キャンセル / メニュー
  Enter: 'confirm', Space: 'confirm', KeyZ: 'confirm',
  Escape: 'cancel', KeyX: 'cancel', Backspace: 'cancel',
  ShiftLeft: 'menu', ShiftRight: 'menu', KeyC: 'menu',
});

// 論理ボタン一覧（タッチUIでも使用）
export const BUTTONS = Object.freeze([
  'up', 'down', 'left', 'right', 'confirm', 'cancel', 'menu',
]);
