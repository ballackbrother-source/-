/**
 * config/constants.js
 * @layer config
 * ゲーム全体で共有する定数・列挙。マジックナンバーをここに集約する。
 */

// 仮想解像度（内部描画サイズ）。実画面へはレターボックスで自動スケール。
export const VIEW_W = 640;
export const VIEW_H = 480;

// タイル
export const TILE = 32;
export const SCREEN_COLS = VIEW_W / TILE; // 20
export const SCREEN_ROWS = VIEW_H / TILE; // 15

// ループ（固定タイムステップ）
export const FPS = 60;
export const STEP_MS = 1000 / FPS;

// 移動
export const WALK_SPEED = 4; // 1フレームあたりのピクセル移動量（TILEの約数推奨）

// 方向
export const DIR = Object.freeze({ DOWN: 'down', LEFT: 'left', RIGHT: 'right', UP: 'up' });
export const DIR_VEC = Object.freeze({
  down:  { x: 0, y: 1 },
  left:  { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up:    { x: 0, y: -1 },
});

// 属性（§05-2）
export const ELEMENTS = Object.freeze(['fire', 'ice', 'thunder', 'wind', 'earth', 'light', 'dark']);
export const ELEMENT_LABEL = Object.freeze({
  none: '無', fire: '炎', ice: '氷', thunder: '雷', wind: '風',
  earth: '土', light: '光', dark: '闇',
});

// 属性倍率（§05-2）
export const ELEM_MULT = Object.freeze({ WEAK: 1.5, NORMAL: 1.0, HALF: 0.5, NULL: 0.0, ABSORB: -1.0 });

// 状態異常ID（§05-3）
export const STATUS = Object.freeze({
  POISON: 'poison', SLEEP: 'sleep', PARALYZE: 'paralyze', SILENCE: 'silence',
  CONFUSE: 'confuse', BLIND: 'blind',
});

// 装備スロット（§04-5）
export const EQUIP_SLOTS = Object.freeze(['weapon', 'shield', 'head', 'body', 'acc1', 'acc2']);

// 銘（武器の特殊効果。改造屋でレア素材＋ゴールドで付与）
export const MEI = Object.freeze({
  vampire: { name: '吸血', desc: '物理ダメージの 25%を 吸収' },
  crit:    { name: '会心', desc: '会心率 +15%' },
  double:  { name: '連撃', desc: '通常こうげきが 35%で 2回' },
});

// 配色（プレースホルダ・手続き生成アート用パレット）
export const COLORS = Object.freeze({
  window: '#10183a', windowBorder: '#aee0ff', windowBorder2: '#3a6ea5',
  text: '#ffffff', textShadow: '#000a1f', textDim: '#9fb6d6',
  hp: '#52d273', mp: '#4fb2ff', exp: '#ffd23f', selected: '#ffd23f',
});

// セーブ
export const SAVE_PREFIX = 'eternia';
export const SAVE_VERSION = 1;
export const SAVE_SLOTS = 4; // slot0=オート, 1..3=手動
