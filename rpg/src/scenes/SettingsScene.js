/**
 * scenes/SettingsScene.js
 * @layer presentation(scene)
 * 設定：BGM/SE音量・文字速度・難易度。設定は独立保存（SaveManager.saveConfig）。
 */
import { Scene } from '../core/Scene.js';
import { VIEW_W, VIEW_H, COLORS } from '../config/constants.js';
import { CommandWindow } from '../ui/CommandWindow.js';
import { SaveManager } from '../core/SaveManager.js';

const SPEEDS = ['slow', 'normal', 'fast', 'instant'];
const SPEED_LABEL = { slow: 'おそい', normal: 'ふつう', fast: 'はやい', instant: 'いっしゅん' };
const DIFFS = ['easy', 'normal', 'hard'];
const DIFF_LABEL = { easy: 'やさしい', normal: 'ふつう', hard: 'むずかしい' };

export class SettingsScene extends Scene {
  constructor(game) {
    super(game);
    this.opaque = false; // タイトル/フィールドの上にオーバーレイ
    this.menu = new CommandWindow([], { title: 'せってい' });
  }

  // 設定の保存先：ゲーム中ならstate.settings、未開始ならローカルの一時設定
  get settings() {
    return this.game.state ? this.game.state.settings : (this._tmp ||= this._defaultTmp());
  }
  _defaultTmp() {
    return SaveManager.loadConfig() || { bgmVol: 0.6, seVol: 0.8, textSpeed: 'normal', difficulty: 'normal', touchLayout: 'right' };
  }

  onEnter() { this.rebuild(); }

  rebuild() {
    const s = this.settings;
    this.menu.setItems([
      { value: 'bgm', label: 'BGM音量', sub: `${Math.round(s.bgmVol * 100)}%` },
      { value: 'se',  label: 'SE音量',  sub: `${Math.round(s.seVol * 100)}%` },
      { value: 'speed', label: '文字速度', sub: SPEED_LABEL[s.textSpeed] },
      { value: 'diff',  label: '難易度',  sub: DIFF_LABEL[s.difficulty] },
      { value: 'touch', label: 'タッチ配置', sub: s.touchLayout === 'left' ? '左手' : '右手' },
      { value: 'back', label: '← もどる' },
    ]);
  }

  update() {
    const s = this.settings;
    const input = this.game.input, audio = this.game.audio;
    // 左右で値変更
    if (input.isPressed('left') || input.isPressed('right')) {
      const dir = input.isPressed('right') ? 1 : -1;
      const v = this.menu.current.value;
      if (v === 'bgm') s.bgmVol = clamp01(s.bgmVol + dir * 0.1);
      else if (v === 'se') s.seVol = clamp01(s.seVol + dir * 0.1);
      else if (v === 'speed') s.textSpeed = cycle(SPEEDS, s.textSpeed, dir);
      else if (v === 'diff') s.difficulty = cycle(DIFFS, s.difficulty, dir);
      else if (v === 'touch') s.touchLayout = s.touchLayout === 'left' ? 'right' : 'left';
      audio.setVolumes(s); audio.se('cursor'); this.apply(); this.rebuild();
      return;
    }
    const res = this.menu.update(input, audio);
    if (res === 'cancel' || (res === 'confirm' && this.menu.current.value === 'back')) {
      this.apply(); this.game.scenes.pop();
    }
  }

  apply() {
    this.game.audio.setVolumes(this.settings);
    SaveManager.saveConfig(this.settings);
    window.dispatchEvent(new CustomEvent('eternia-touch-layout', { detail: this.settings.touchLayout }));
  }

  render(r) {
    r.rect(0, 0, VIEW_W, VIEW_H, 'rgba(0,0,0,0.6)');
    r.window(VIEW_W / 2 - 180, 120, 360, 250);
    this.menu.render(r, VIEW_W / 2 - 150, 140, 320);
    r.text('← → で 変更 / 決定・キャンセルで もどる', VIEW_W / 2, 340, { size: 13, align: 'center', color: COLORS.textDim });
  }
}

const clamp01 = (v) => Math.max(0, Math.min(1, Math.round(v * 10) / 10));
const cycle = (arr, cur, dir) => arr[(arr.indexOf(cur) + dir + arr.length) % arr.length];
