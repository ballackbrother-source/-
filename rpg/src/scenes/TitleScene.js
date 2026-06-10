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
      this._drawLogo(r, VIEW_W / 2, 92);
      const subA = Math.min(1, Math.max(0, (this.t - 24) / 24));
      r.ctx.save(); r.ctx.globalAlpha = subA;
      r.text('～ 星を継ぐ者 ～', VIEW_W / 2, 150, { size: 22, align: 'center', color: COLORS.textDim });
      r.ctx.restore();
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

  /** ロゴ：光沢グラデ＋光のスイープ＋登場アニメ＋粒子 */
  _drawLogo(r, cx, cy) {
    const c = r.ctx;
    const p = Math.min(1, this.t / 36), ease = 1 - Math.pow(1 - p, 3);
    const scale = 0.82 + 0.18 * ease, alpha = ease;
    // 背後の発光（脈動）
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = alpha * (0.22 + 0.08 * Math.sin(this.t * 0.05));
    const gl = c.createRadialGradient(cx, cy, 6, cx, cy, 190);
    gl.addColorStop(0, 'rgba(174,224,255,0.5)'); gl.addColorStop(1, 'rgba(174,224,255,0)');
    c.fillStyle = gl; c.beginPath(); c.arc(cx, cy, 190, 0, 7); c.fill(); c.restore();
    // オフスクリーンにロゴ＋スイープ（文字内だけに光沢）
    if (!this._logoCv) { this._logoCv = document.createElement('canvas'); this._logoCv.width = 480; this._logoCv.height = 120; }
    const lc = this._logoCv, lx = lc.getContext('2d');
    lx.clearRect(0, 0, 480, 120);
    lx.font = 'bold 58px serif'; lx.textAlign = 'center'; lx.textBaseline = 'middle';
    const tx = 240, ty = 62;
    const g = lx.createLinearGradient(0, ty - 32, 0, ty + 32);
    g.addColorStop(0, '#fff6cc'); g.addColorStop(0.46, '#ffd23f'); g.addColorStop(0.54, '#e6a832'); g.addColorStop(1, '#caa24a');
    lx.lineJoin = 'round'; lx.lineWidth = 7; lx.strokeStyle = '#241606'; lx.strokeText('ETERNIA', tx, ty);
    lx.fillStyle = g; lx.fillText('ETERNIA', tx, ty);
    lx.save(); lx.globalCompositeOperation = 'source-atop'; // 文字の上だけに光沢バンド
    const sweep = ((this.t * 4) % 640) - 120;
    const sg = lx.createLinearGradient(sweep - 44, 0, sweep + 44, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.85)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    lx.fillStyle = sg; lx.fillRect(0, 0, 480, 120); lx.restore();
    c.save(); c.globalAlpha = alpha; c.translate(cx, cy); c.scale(scale, scale); c.drawImage(lc, -240, -60); c.restore();
    // 粒子（ロゴ周囲を漂うきらめき）
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 7; k++) {
      const a = this.t * 0.018 + k * 1.3;
      const sx = cx + Math.cos(a * 1.2 + k) * (130 + 24 * Math.sin(a));
      const sy = cy + Math.sin(a * 0.8 + k) * 34;
      const tw = 0.5 + 0.5 * Math.sin(this.t * 0.1 + k * 2);
      c.fillStyle = `rgba(255,240,180,${0.45 * tw * alpha})`;
      this._spark(c, sx, sy, 1.8 + 2.4 * tw);
    }
    c.restore();
  }

  _spark(c, x, y, s) {
    c.beginPath();
    c.moveTo(x, y - s); c.lineTo(x + s * 0.3, y - s * 0.3); c.lineTo(x + s, y); c.lineTo(x + s * 0.3, y + s * 0.3);
    c.lineTo(x, y + s); c.lineTo(x - s * 0.3, y + s * 0.3); c.lineTo(x - s, y); c.lineTo(x - s * 0.3, y - s * 0.3);
    c.closePath(); c.fill();
  }
}
