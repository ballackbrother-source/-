/**
 * main.js
 * @layer bootstrap
 * 起動処理：横断サービスを生成してGameを起動。タッチUIを配線。
 * 依存の向き：ここ(最外)だけが全レイヤを知ってよい。
 */
import { Renderer } from './core/Renderer.js';
import { Input } from './core/Input.js';
import { AudioManager } from './core/Audio.js';
import { EventBus } from './core/EventBus.js';
import { AssetLoader } from './core/AssetLoader.js';
import { Database } from './data/Database.js';
import { Game } from './core/Game.js';
import { BootScene } from './scenes/BootScene.js';

function boot() {
  const canvas = document.getElementById('game');
  const renderer = new Renderer(canvas);
  const input = new Input();
  input.attach(window);
  const audio = new AudioManager();
  const bus = new EventBus();
  const db = new Database();
  const assets = new AssetLoader();

  const game = new Game({ renderer, input, audio, bus, db, assets });
  setupTouchControls(input, audio);
  game.start(new BootScene(game));

  // デバッグ用フック
  window.__ETERNIA = { game };
}

/** 画面下の仮想パッド/ボタンを論理入力へ配線（スマホ対応） */
function setupTouchControls(input, audio) {
  const bind = (id, btn) => {
    const el = document.getElementById(id);
    if (!el) return;
    const down = (e) => { e.preventDefault(); audio.init(); input.setVirtual(btn, true); el.classList.add('pressed'); };
    const up = (e) => { e.preventDefault(); input.setVirtual(btn, false); el.classList.remove('pressed'); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('pointercancel', up);
  };
  bind('btn-up', 'up'); bind('btn-down', 'down'); bind('btn-left', 'left'); bind('btn-right', 'right');
  bind('btn-confirm', 'confirm'); bind('btn-cancel', 'cancel'); bind('btn-menu', 'menu');

  // タッチ配置（左右利き）切替
  const apply = (layout) => document.body.classList.toggle('left-handed', layout === 'left');
  window.addEventListener('eternia-touch-layout', (e) => apply(e.detail));

  // 最初のタップで音声有効化
  window.addEventListener('pointerdown', () => audio.init(), { once: true });
  // タッチデバイスのみコントローラ表示
  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
