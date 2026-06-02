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

export class TitleScene extends Scene {
  constructor(game) {
    super(game);
    this.mode = 'main'; // 'main' | 'load'
    this.t = 0;
    this.menu = new CommandWindow([
      { label: 'はじめから', value: 'new' },
      { label: 'つづきから', value: 'load' },
      { label: 'せってい', value: 'settings' },
    ]);
    this.slots = new CommandWindow([], { title: 'ロードする ぼうけんのしょ' });
  }

  onEnter() { this.game.audio.playBgm('theme'); this.refreshSlots(); }
  onResume() { this.game.audio.playBgm('theme'); }

  refreshSlots() {
    const list = SaveManager.list();
    const items = list.map((s) => ({
      value: s.slot,
      disabled: s.empty,
      label: `スロット${s.slot}${s.slot === 0 ? '(オート)' : ''}`,
      sub: s.empty ? '空き' : (s.error ? '破損' : `${s.chapter} Lv${s.level ?? '-'}`),
    }));
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
    r.clear('#070b1a');
    // 星空背景
    for (let i = 0; i < 60; i++) {
      const x = (i * 137) % VIEW_W;
      const y = (i * 211) % (VIEW_H - 120);
      const tw = (Math.sin((this.t + i * 20) / 30) + 1) / 2;
      r.rect(x, y, 2, 2, `rgba(255,255,255,${0.2 + tw * 0.6})`);
    }
    // 第七星（大きく瞬く）
    const bt = (Math.sin(this.t / 50) + 1) / 2;
    r.text('✦', VIEW_W - 90, 60, { size: 40, color: `rgba(174,224,255,${0.5 + bt * 0.5})` });

    r.text('ETERNIA', VIEW_W / 2, 90, { size: 54, align: 'center', color: COLORS.windowBorder });
    r.text('～ 星を継ぐ者 ～', VIEW_W / 2, 150, { size: 22, align: 'center', color: COLORS.textDim });

    if (this.mode === 'main') {
      r.window(VIEW_W / 2 - 110, 250, 220, 130);
      this.menu.render(r, VIEW_W / 2 - 80, 270, 180);
    } else {
      r.window(VIEW_W / 2 - 170, 230, 340, 200);
      this.slots.render(r, VIEW_W / 2 - 140, 248, 300);
    }
    if (this.errorMsg) r.text(this.errorMsg, VIEW_W / 2, VIEW_H - 30, { size: 14, align: 'center', color: '#e06666' });
    r.text('© ETERNIA Project — 設計書 design/ 参照', VIEW_W / 2, VIEW_H - 22, { size: 11, align: 'center', color: '#44506e' });
  }
}
