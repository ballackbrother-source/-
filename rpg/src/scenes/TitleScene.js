/**
 * scenes/TitleScene.js
 * @layer presentation(scene)
 * タイトル画面：はじめから / つづきから / 設定。
 */
import { Scene } from '../core/Scene.js';
import { VIEW_W, VIEW_H, COLORS } from '../config/constants.js';
import { CommandWindow } from '../ui/CommandWindow.js';
import { SaveManager } from '../core/SaveManager.js';
import { GameState } from '../core/GameState.js';
import { FieldScene } from './FieldScene.js';
import { SettingsScene } from './SettingsScene.js';
import { TrialScene } from './TrialScene.js';
import { drawTitleBg } from '../ui/Backdrop.js';
import { MenuUI } from '../ui/MenuUI.js';

export class TitleScene extends Scene {
  constructor(game) {
    super(game);
    this.mode = 'main'; // 'main' | 'load'
    this.t = 0;
    const items = [
      { label: 'はじめから', value: 'new' },
      { label: 'つづきから', value: 'load' },
      { label: 'せってい', value: 'settings' },
      { label: '★最終決戦 体験版', value: 'trial' },
    ];
    // TRUEエンド達成で 裏ボス挑戦を解放
    if (SaveManager.getClears().true) items.push({ label: '★裏ボス アステリオン', value: 'superboss' });
    this.menu = new CommandWindow(items);
    this.slots = new CommandWindow([], { title: 'ロードする ぼうけんのしょ' });
  }

  onEnter() { this.game.audio.playBgm('theme'); this.refreshSlots(); }
  onResume() { this.game.audio.playBgm('theme'); }

  refreshSlots() {
    const list = SaveManager.list();
    this.slotList = list;
    const items = list.map((s) => ({ value: s.slot, disabled: s.empty }));
    items.push({ label: '← もどる', value: 'back' });
    this.slots.setItems(items);
    this.hasAnySave = list.some((s) => !s.empty && !s.error);
  }

  update() {
    this.t++;
    this.game.audio.init(); // 何かしらの操作後に音声有効化を試みる
    const a = this.game.audio;
    if (this.mode === 'main') {
      // つづきから の活性制御
      this.menu.items[1].disabled = !this.hasAnySave;
      const res = this.menu.update(this.game.input, a);
      if (res === 'confirm') this.onMain(this.menu.current.value);
    } else if (this.mode === 'load') {
      const res = this.slots.update(this.game.input, a);
      if (res === 'cancel') { this.mode = 'main'; }
      else if (res === 'confirm') {
        const v = this.slots.current.value;
        if (v === 'back') { this.mode = 'main'; }
        else this.loadSlot(v);
      }
    }
  }

  onMain(value) {
    if (value === 'new') this.startNewGame();
    else if (value === 'load') { this.refreshSlots(); this.mode = 'load'; }
    else if (value === 'settings') this.game.scenes.push(new SettingsScene(this.game));
    else if (value === 'trial') this.game.scenes.replace(new TrialScene(this.game), { mode: 'aldia' });
    else if (value === 'superboss') this.game.scenes.replace(new TrialScene(this.game), { mode: 'asterion' });
  }

  startNewGame() {
    const state = GameState.newGame(this.game.db);
    this.game.bindState(state);
    this.game.scenes.replace(new FieldScene(this.game), { fresh: true });
  }

  loadSlot(slot) {
    try {
      const state = SaveManager.load(slot);
      if (!state) return;
      this.game.bindState(state);
      this.game.scenes.replace(new FieldScene(this.game), { fresh: false });
    } catch (e) {
      console.error(e);
      this.errorMsg = 'よみこみに しっぱいしました';
    }
  }

  render(r) {
    // 雰囲気のある夜空＋遠景の城（手続き背景）
    drawTitleBg(r.ctx, this.t);
    // 第七星（大きく瞬く）
    const bt = (Math.sin(this.t / 50) + 1) / 2;
    r.text('✦', VIEW_W - 90, 60, { size: 40, color: `rgba(174,224,255,${0.5 + bt * 0.5})` });

    if (this.mode === 'main') {
      r.text('ETERNIA', VIEW_W / 2, 90, { size: 54, align: 'center', color: COLORS.windowBorder });
      r.text('～ 星を継ぐ者 ～', VIEW_W / 2, 150, { size: 22, align: 'center', color: COLORS.textDim });
      // クリア記録バッジ
      const clears = SaveManager.getClears();
      const badges = [['true', 'TRUE', '#ffd23f'], ['normal', 'NORMAL', '#aee0ff'], ['bad', 'BAD', '#e06666']];
      const got = badges.filter(([k]) => clears[k]);
      if (got.length) {
        r.text('CLEAR:', VIEW_W / 2 - 130, 190, { size: 13, color: COLORS.textDim });
        got.forEach(([, label, col], i) => r.text(label, VIEW_W / 2 - 70 + i * 90, 190, { size: 14, color: col }));
      }
      r.window(VIEW_W / 2 - 130, 248, 260, 156);
      this.menu.render(r, VIEW_W / 2 - 100, 264, 220, this.game.assets);
    } else {
      // つづきから：スロットカード
      r.text('つづきから', VIEW_W / 2, 36, { size: 22, align: 'center', color: COLORS.windowBorder });
      const lw = 440, lx = VIEW_W / 2 - lw / 2, ly = 70;
      MenuUI.saveSlots(r, lx, ly, lw, this.slotList, this.slots.index, this.game.assets);
      const backSel = this.slots.index === this.slotList.length;
      const byy = ly + this.slotList.length * (84 + 8);
      r.window(lx, byy, lw, 32);
      if (backSel) r.strokeRect(lx, byy, lw, 32, COLORS.selected, 2);
      r.text('← もどる', lx + 16, byy + 7, { size: 15, color: backSel ? COLORS.selected : COLORS.text });
    }
    if (this.errorMsg) r.text(this.errorMsg, VIEW_W / 2, VIEW_H - 30, { size: 14, align: 'center', color: '#e06666' });
    r.text('© ETERNIA Project — 設計書 design/ 参照', VIEW_W / 2, VIEW_H - 22, { size: 11, align: 'center', color: '#44506e' });
  }
}
