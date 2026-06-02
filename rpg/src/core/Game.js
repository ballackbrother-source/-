/**
 * core/Game.js
 * @layer core
 * ゲームの中枢。固定タイムステップのメインループを駆動し、横断サービス
 * （Input/Renderer/Audio/EventBus/GameState/Database/SceneManager）を束ねる。
 * Sceneからは `this.game.xxx` で各サービスへアクセスする。
 */
import { STEP_MS } from '../config/constants.js';
import { SceneManager } from './SceneManager.js';
import { Party } from '../domain/entities/Party.js';
import { InventorySystem } from '../domain/systems/InventorySystem.js';
import { FlagManager } from '../event/FlagManager.js';
import { ChapterManager } from '../event/ChapterManager.js';

export class Game {
  constructor({ renderer, input, audio, bus, db, assets }) {
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.bus = bus;
    this.db = db;
    this.assets = assets;
    this.scenes = new SceneManager();
    this.state = null;          // GameState（newGame/loadで設定）
    this._acc = 0;
    this._last = 0;
    this._running = false;
    this._playClock = 0;        // プレイ時間加算用
  }

  /**
   * GameStateを設定し、状態依存サービス（party/inventory/flags/chapter）を束ねる。
   * 新規開始・ロード時に呼ぶ。
   */
  bindState(state) {
    this.state = state;
    this.chapter = new ChapterManager(state, this.db);
    this.party = new Party(state, this.db);
    this.inventory = new InventorySystem(state, this.db);
    this.flags = new FlagManager(state, this.db, this.chapter);
    // 各キャラの生存値を初期化（curHp/curMp=-1 を満タンに）
    this.party.all().forEach((c) => c.ensureVitals());
  }

  start(firstScene, params) {
    this.scenes.reset(firstScene, params);
    this._running = true;
    this._last = performance.now();
    requestAnimationFrame(this._loop);
  }

  _loop = (now) => {
    if (!this._running) return;
    let frame = now - this._last;
    this._last = now;
    if (frame > 250) frame = 250; // スパイク抑制
    this._acc += frame;

    // 固定ステップ更新
    while (this._acc >= STEP_MS) {
      this.input.poll();
      this.scenes.update(STEP_MS);
      this._acc -= STEP_MS;
      // プレイ時間（ゲーム状態がある時のみ）
      if (this.state) {
        this._playClock += STEP_MS;
        if (this._playClock >= 1000) { this.state.meta.playtimeSec += 1; this._playClock -= 1000; }
      }
    }

    // 描画
    this.renderer.clear('#000');
    this.scenes.render(this.renderer);
    requestAnimationFrame(this._loop);
  };
}
