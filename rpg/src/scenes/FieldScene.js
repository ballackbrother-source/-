/**
 * scenes/FieldScene.js
 * @layer presentation(scene)
 * マップ探索の中核。移動・NPC会話・宝箱・イベント・エンカウント・マップ移動を統括。
 * イベント実行コンテキスト(ctx)をEventInterpreterへDIする（会話/選択/戦闘/演出）。
 */
import { Scene } from '../core/Scene.js';
import { VIEW_W, VIEW_H, COLORS, TILE } from '../config/constants.js';
import { TileMap } from '../field/TileMap.js';
import { Camera } from '../field/Camera.js';
import { MapRenderer } from '../field/MapRenderer.js';
import { FieldPlayer } from '../field/FieldPlayer.js';
import { NPC } from '../field/NPC.js';
import { MessageWindow } from '../ui/MessageWindow.js';
import { ChoiceWindow } from '../ui/ChoiceWindow.js';
import { HUD } from '../ui/HUD.js';
import { EventInterpreter } from '../event/EventInterpreter.js';
import { SaveManager } from '../core/SaveManager.js';
import { rng } from '../core/RNG.js';
import { sleep } from '../core/util.js';
import { BattleScene } from './BattleScene.js';
import { MenuScene } from './MenuScene.js';

export class FieldScene extends Scene {
  constructor(game) {
    super(game);
    this.msgWin = new MessageWindow(game.state.settings);
    this.choiceWin = new ChoiceWindow();
    this.hud = new HUD();
    this.eventRunning = false;
    this._waiters = [];      // waitUntil用 [{cond,resolve}]
    this._fade = null;       // {dir,color,dur,t,resolve}
    this.fadeAlpha = 0;
    this.stepsToEncounter = 0;
    this.interp = new EventInterpreter(this.buildCtx());
    this.shakeT = 0; this.shakeP = 0;
  }

  // ---- ライフサイクル ----
  onEnter(params = {}) {
    const loc = this.game.state.location;
    this.loadMap(loc.mapId, loc.x, loc.y, loc.dir);
    if (params.fresh) {
      // 新規開始：マップのautorunイベント（プロローグ等）を起動
      this.runAutoruns();
    }
  }
  onResume() {
    // 戦闘/メニューから戻った時：BGM再開、生存値補正
    this.game.audio.playBgm(this.map.data.bgm || 'field');
    this.game.party.all().forEach((c) => c.ensureVitals());
    // 戦闘で進行したイベントの続き（_resumeBattle）を解決
    if (this._battleResolve) { const r = this._battleResolve; this._battleResolve = null; r(this._battleResult); }
  }

  loadMap(mapId, x, y, dir) {
    this.game.state.location = { mapId, x, y, dir };
    this.map = new TileMap(this.game.db.getMap(mapId));
    this.camera = new Camera(this.map);
    this.renderer = new MapRenderer(this.map, this.game.assets);
    const leader = this.game.party.leader();
    const color = this.game.db.getCharacter(leader.id).color || '#4fb2ff';
    this.player = new FieldPlayer(x, y, dir, color);
    this.npcs = (this.map.data.npcs || []).map((d) => new NPC(d));
    this.camera.follow(this.player.px, this.player.py);
    this.resetEncounter();
    this.hud.showLocation(this.game.db.mapName(mapId));
    this.game.audio.playBgm(this.map.data.bgm || 'field');
  }

  occupants() { return this.npcs.filter((n) => n.visible !== false); }

  resetEncounter() {
    const enc = this.encounterTable();
    this.stepsToEncounter = enc ? rng.int(enc.steps[0], enc.steps[1]) : -1;
  }
  encounterTable() {
    const id = this.map.data.encounter;
    return id ? this.game.db.getEncounter(id) : null;
  }

  // ---- 更新 ----
  update() {
    // フェード・待機・自動移動は常に進める
    this.updateFade();
    this.updateWaiters();
    this.player.update();
    for (const n of this.npcs) n.update(this.map, [this.player, ...this.occupants()]);
    this.hud.update();
    if (this.shakeT > 0) this.shakeT--;

    if (this.eventRunning) {
      // イベント中は会話/選択のみ受け付ける
      this.msgWin.update(this.game.input, this.game.audio);
      this.choiceWin.update(this.game.input, this.game.audio);
      return;
    }

    // メニュー
    if (this.game.input.isPressed('menu') || this.game.input.isPressed('cancel')) {
      this.game.audio.se('confirm');
      this.game.scenes.push(new MenuScene(this.game));
      return;
    }

    // 移動
    if (!this.player.moving) {
      const dir = this.game.input.dir();
      if (dir) {
        const moved = this.player.tryMove(dir, this.map, this.occupants());
        if (moved) this.onStep();
        else this.player.dir = dir; // 壁向き
      }
      // 調べる/話す
      if (this.game.input.isPressed('confirm')) this.tryInteract();
    }
    this.camera.follow(this.player.px, this.player.py);
  }

  /** 1マス歩いた時：触れ判定イベント・ポータル・エンカウント */
  onStep() {
    const { gx, gy } = this.player;
    // タッチイベント（同一タイルに複数ある場合は発火可能な最初の1つ）
    const ev = (this.map.data.events || []).find((e) => e.x === gx && e.y === gy && e.trigger === 'touch' && this.canFire(e));
    if (ev) { this.fireEvent(ev); return; }
    // ポータル（移動）
    const portal = this.map.portalAt(gx, gy);
    if (portal) { this.usePortal(portal); return; }
    // エンカウント
    if (this.stepsToEncounter > 0) {
      this.stepsToEncounter--;
      if (this.stepsToEncounter <= 0) this.startRandomBattle();
    }
  }

  async usePortal(p) {
    await this.fade('out', '#000', 250);
    this.loadMap(p.toMap, p.toX, p.toY, p.dir || this.player.dir);
    await this.fade('in', '#000', 250);
    this.runAutoruns();
  }

  /** 目の前を調べる：NPC・アクションイベント */
  tryInteract() {
    const f = this.player.front();
    const npc = this.npcs.find((n) => n.gx === f.x && n.gy === f.y && n.visible !== false);
    if (npc) {
      npc.facePlayer(this.player);
      const cmds = this.resolveCommands(npc);
      if (cmds) { this.runEvent(cmds); return; }
    }
    const ev = (this.map.data.events || []).find((e) => e.x === f.x && e.y === f.y && e.trigger === 'action' && this.canFire(e));
    if (ev) this.fireEvent(ev);
  }

  // ---- イベント実行 ----
  canFire(ev) {
    if (ev.once && this.game.flags.on(this.onceKey(ev))) return false;
    if (ev.cond && !this.game.flags.test(ev.cond)) return false;
    return true;
  }
  onceKey(ev) { return `_ev_${this.map.data.name}_${ev.x}_${ev.y}`; }

  fireEvent(ev) {
    if (ev.once) this.game.flags.set(this.onceKey(ev));
    const cmds = this.resolveCommands(ev);
    if (cmds) this.runEvent(cmds);
  }

  /** NPC/イベント定義から、条件を満たすページのcommandsを取り出す */
  resolveCommands(source) {
    let def = source;
    if (source.eventId) def = this.game.db.getEvent(source.eventId);
    if (!def) return null;
    if (def.commands) return def.commands;     // 単純コマンド列
    const page = EventInterpreter.resolvePage(def, this.game.flags);
    return page ? page.commands : null;
  }

  runAutoruns() {
    const autos = (this.map.data.events || []).filter((e) => e.trigger === 'autorun' && this.canFire(e));
    if (autos.length) this.fireEvent(autos[0]); // 1つずつ
  }

  async runEvent(commands) {
    if (this.eventRunning) return;
    this.eventRunning = true;
    await this.interp.run(commands);
    this.eventRunning = false;
    this.msgWin.active = false; this.choiceWin.active = false;
    // イベント完了後、（マップ移動等で）新たに条件を満たした自動イベントを拾う。
    // 各autorunは必ずフラグを立てるため、無限ループにはならない。
    this.runAutoruns();
  }

  /** EventInterpreterへ渡す実行コンテキスト（依存を集約） */
  buildCtx() {
    const g = this.game;
    return {
      db: g.db, flags: g.flags, party: g.party, inventory: g.inventory,
      chapter: g.chapter, audio: g.audio,
      message: (text, opts) => this.msgWin.show(text, opts),
      choice: (options, prompt) => this.choiceWin.show(options, prompt),
      wait: (ms) => sleep(ms),
      fade: (dir, color, ms) => this.fade(dir, color, ms),
      shake: (p, ms) => { this.shakeP = p; this.shakeT = Math.ceil(ms / 16); },
      transfer: (mapId, x, y, dir) => { this.loadMap(mapId, x, y, dir); this.runAutoruns(); },
      moveActor: (who, path) => this.moveActor(who, path),
      battle: (troopId, opts) => this.startBattle(troopId, opts),
      autosave: () => this.autosave(),
      gameOver: () => this.gameOver(),
      returnTitle: () => this.returnTitle(),
    };
  }

  // ---- 戦闘 ----
  startRandomBattle() {
    const enc = this.encounterTable();
    this.resetEncounter();
    if (!enc) return;
    const troopId = pickWeighted(enc.troops, () => rng.next());
    this.startBattle(troopId, { canEscape: true });
  }
  /** Promiseで戦闘結果を返す（イベントのbattleコマンド用） */
  startBattle(troopId, opts = {}) {
    return new Promise((resolve) => {
      this._battleResolve = resolve;
      this._battleResult = { outcome: 'escape' };
      this.game.scenes.push(new BattleScene(this.game), {
        troopId, opts,
        onComplete: (result) => { this._battleResult = result; },
      });
    });
  }

  // ---- フェード / 待機 / 自動移動 ----
  fade(dir, color = '#000', dur = 400) {
    return new Promise((resolve) => {
      this._fade = { dir, color, dur, t: 0, resolve };
      this._fadeColor = color;
      if (dir === 'in') this.fadeAlpha = 1; else this.fadeAlpha = 0;
    });
  }
  updateFade() {
    if (!this._fade) return;
    const f = this._fade;
    f.t += 16;
    const k = Math.min(1, f.t / f.dur);
    this.fadeAlpha = f.dir === 'out' ? k : 1 - k;
    if (k >= 1) { const r = f.resolve; this._fade = null; r?.(); }
  }
  waitUntil(cond) { return new Promise((res) => this._waiters.push({ cond, resolve: res })); }
  updateWaiters() {
    if (!this._waiters.length) return;
    this._waiters = this._waiters.filter((w) => { if (w.cond()) { w.resolve(); return false; } return true; });
  }
  async moveActor(who, path) {
    const actor = who === 'player' ? this.player : this.npcs.find((n) => n.def.id === who);
    if (!actor) return;
    for (const d of path) {
      actor.tryMove(d, this.map, [this.player, ...this.occupants()].filter((o) => o !== actor));
      await this.waitUntil(() => !actor.moving);
    }
  }

  // ---- セーブ / ゲームオーバー ----
  /** プレイヤーの現在地をGameStateへ書き戻す（セーブ前に必須） */
  syncLocation() {
    this.game.state.location.x = this.player.gx;
    this.game.state.location.y = this.player.gy;
    this.game.state.location.dir = this.player.dir;
  }
  autosave() {
    this.syncLocation();
    SaveManager.save(0, this.game.state, this.game.db);
  }
  async gameOver() {
    await this.fade('out', '#000', 800);
    this.returnTitle();
  }
  returnTitle() {
    import('./TitleScene.js').then(({ TitleScene }) => {
      this.game.audio.stopBgm();
      this.game.scenes.reset(new TitleScene(this.game));
    });
  }

  // ---- 描画 ----
  render(r) {
    let sx = 0, sy = 0;
    if (this.shakeT > 0) { sx = (Math.random() - 0.5) * this.shakeP; sy = (Math.random() - 0.5) * this.shakeP; }
    r.save(); r.translate(sx, sy);
    this.renderer.draw(r, this.camera.x, this.camera.y, [this.player, ...this.npcs]);
    r.restore();

    // フェード暗幕はマップの上・UIの下（暗転中も会話文は読める）
    if (this.fadeAlpha > 0) {
      r.save(); r.alpha(this.fadeAlpha);
      r.rect(0, 0, VIEW_W, VIEW_H, this._fadeColor || '#000');
      r.restore();
    }

    this.hud.render(r, this.game.party.gold);
    this.msgWin.render(r);
    this.choiceWin.render(r);
  }

  onPause() { this.syncLocation(); }
}

// 重み付き troop 抽選
function pickWeighted(arr, rngFn) {
  const total = arr.reduce((s, e) => s + (e.weight || 1), 0);
  let x = rngFn() * total;
  for (const e of arr) { if ((x -= (e.weight || 1)) < 0) return e.troop; }
  return arr[arr.length - 1].troop;
}
