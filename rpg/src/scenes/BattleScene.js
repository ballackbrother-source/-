/**
 * scenes/BattleScene.js
 * @layer presentation(scene)
 * 戦闘画面。コマンド入力→ラウンド解決→結果（EXP/Lv/ドロップ）の状態機械。
 * ルール計算は domain/BattleSystem に委譲し、本シーンは入力・演出・進行を担う。
 */
import { Scene } from '../core/Scene.js';
import { VIEW_W, VIEW_H, COLORS } from '../config/constants.js';
import { CommandWindow } from '../ui/CommandWindow.js';
import { BattleUI } from '../ui/BattleUI.js';
import { BattleSystem } from '../domain/systems/BattleSystem.js';
import { Enemy } from '../domain/entities/Enemy.js';
import { LevelSystem } from '../domain/systems/LevelSystem.js';
import { rng } from '../core/RNG.js';

const ENEMY_LABELS = ['Ａ', 'Ｂ', 'Ｃ', 'Ｄ', 'Ｅ'];

export class BattleScene extends Scene {
  constructor(game) { super(game); this.ui = new BattleUI(game.assets); }

  onEnter(params) {
    this.params = params;
    this.onComplete = params.onComplete;
    const troop = this.game.db.getTroop(params.troopId);

    // 敵生成（同種は A/B/C ラベル付与）
    const counts = {};
    this.enemies = troop.members.map((id) => {
      counts[id] = (counts[id] || 0) + 1;
      return { id };
    });
    const total = {};
    troop.members.forEach((id) => (total[id] = (total[id] || 0) + 1));
    const seen = {};
    this.enemies = troop.members.map((id) => {
      let label = '';
      if (total[id] > 1) { label = ENEMY_LABELS[seen[id] || 0]; seen[id] = (seen[id] || 0) + 1; }
      return new Enemy(id, this.game.db, label);
    });

    this.players = this.game.party.frontline();
    this.isBoss = params.opts?.isBoss || this.enemies.some((e) => e.isBoss);
    this.bossEnemy = this.enemies.find((e) => e.isBoss) || null;
    this.special = this.enemies.some((e) => e.def.regenUntilBroken); // 神（不死）戦
    this.system = new BattleSystem(this.players, this.enemies, this.game.db, rng, {
      canEscape: params.opts?.canEscape !== false, isBoss: this.isBoss,
    });

    this.game.audio.playBgm(this.isBoss ? 'boss' : 'battle');
    this.markSeen();

    this.phase = 'intro';
    this.introT = 60;
    this.log = `${this.enemyNames()} が あらわれた！`;
    this.commands = new Map();
    this.flash = null; this.tick = 0;
    this._buildCmdMenu();
  }

  markSeen() {
    const b = this.game.state.bestiary;
    for (const e of this.enemies) if (!b.seen.includes(e.id)) b.seen.push(e.id);
  }
  enemyNames() {
    const names = {};
    for (const e of this.enemies) names[e.def.name] = (names[e.def.name] || 0) + 1;
    return Object.entries(names).map(([n, c]) => (c > 1 ? `${n}×${c}` : n)).join('と');
  }

  _buildCmdMenu() {
    this.cmdMenu = new CommandWindow([
      { label: 'たたかう', value: 'attack' },
      { label: 'じゅもん', value: 'skill' },
      { label: 'どうぐ', value: 'item' },
      { label: 'ぼうぎょ', value: 'defend' },
      { label: 'にげる', value: 'escape', disabled: this.isBoss },
    ], { cols: 1, lineH: 28 });
  }

  // =================== UPDATE ===================
  update() {
    this.tick++;
    const a = this.game.audio;
    switch (this.phase) {
      case 'intro':
        if (--this.introT <= 0 || this.game.input.isPressed('confirm')) this.startInput();
        break;
      case 'cmd':   this.updateCmd(a); break;
      case 'skill': this.updateSkill(a); break;
      case 'item':  this.updateItem(a); break;
      case 'target':this.updateTarget(a); break;
      case 'exec':  this.updateExec(a); break;
      case 'message': this.updateMessage(a); break;
      case 'result':  this.updateResult(a); break;
    }
  }

  startInput() {
    this.commands.clear();
    this.inputOrder = this.players.filter((p) => !p.isDead);
    this.curIdx = 0;
    if (this.inputOrder.length === 0) return this.finish('lose');
    this.enterCmdFor(this.inputOrder[0]);
  }
  get curPlayer() { return this.inputOrder[this.curIdx]; }

  enterCmdFor(_player) { this.phase = 'cmd'; this.cmdMenu.index = 0; this.log = `${this.curPlayer.name} の こうどう`; }

  advancePlayer() {
    this.curIdx++;
    if (this.curIdx >= this.inputOrder.length) this.beginExec();
    else this.enterCmdFor(this.curPlayer);
  }
  backPlayer() {
    if (this.curIdx === 0) return;
    this.curIdx--;
    this.commands.delete(this.curPlayer);
    this.enterCmdFor(this.curPlayer);
  }

  updateCmd(a) {
    const res = this.cmdMenu.update(this.game.input, a);
    if (res === 'cancel') { this.backPlayer(); return; }
    if (res !== 'confirm') return;
    const v = this.cmdMenu.current.value;
    if (v === 'attack') { this.pending = { type: 'attack', skillId: 'attack' }; this.startTarget('enemy'); }
    else if (v === 'defend') { this.commands.set(this.curPlayer, { type: 'defend' }); this.advancePlayer(); }
    else if (v === 'escape') { this.commands.set(this.curPlayer, { type: 'escape' }); this.advancePlayer(); }
    else if (v === 'skill') this.openSkill();
    else if (v === 'item') this.openItem();
  }

  openSkill() {
    const usable = this.curPlayer.skills
      .map((id) => ({ id, sk: this.game.db.getSkill(id) }))
      .filter((s) => s.sk && s.id !== 'attack');
    if (usable.length === 0) { this.game.audio.se('cancel'); return; }
    this.skillMenu = new CommandWindow(
      usable.map((s) => ({
        value: s.id, label: s.sk.name, sub: `MP${s.sk.mp || 0}`,
        disabled: (s.sk.mp || 0) > this.curPlayer.curMp,
      })), { lineH: 26 });
    this.phase = 'skill';
  }
  updateSkill(a) {
    const res = this.skillMenu.update(this.game.input, a);
    if (res === 'cancel') { this.phase = 'cmd'; return; }
    if (res !== 'confirm') return;
    const skId = this.skillMenu.current.value;
    const sk = this.game.db.getSkill(skId);
    this.pending = { type: 'skill', skillId: skId };
    this.commitOrTarget(sk);
  }

  openItem() {
    const items = this.game.inventory.list().filter((e) => e.item.usableInBattle);
    if (items.length === 0) { this.game.audio.se('cancel'); return; }
    this.itemMenu = new CommandWindow(
      items.map((e) => ({ value: e.id, label: e.item.name, sub: `×${e.count}` })), { lineH: 26 });
    this.phase = 'item';
  }
  updateItem(a) {
    const res = this.itemMenu.update(this.game.input, a);
    if (res === 'cancel') { this.phase = 'cmd'; return; }
    if (res !== 'confirm') return;
    const itemId = this.itemMenu.current.value;
    const it = this.game.db.getItem(itemId);
    this.pending = { type: 'item', itemId };
    // 回復系は味方、それ以外は敵対象（簡易）
    const ef = it.effect || {};
    if (ef.hp || ef.mp || ef.cure || ef.revive) this.startTarget('ally', !!ef.revive);
    else this.startTarget('enemy');
  }

  /** スキルのターゲット要否を見て、対象選択 or 即確定 */
  commitOrTarget(sk) {
    if (sk.target === 'self') { this.commit({ target: this.curPlayer }); return; }
    if (sk.target === 'allEnemies' || sk.target === 'allAllies') { this.commit({}); return; }
    if (sk.type === 'heal' || sk.target === 'oneAlly') this.startTarget('ally');
    else if (sk.type === 'revive' || sk.target === 'deadAlly') this.startTarget('ally', true);
    else this.startTarget('enemy');
  }

  startTarget(kind, deadOnly = false) {
    this.targetKind = kind;
    const pool = kind === 'enemy'
      ? this.enemies.filter((e) => !e.isDead)
      : this.players.filter((p) => (deadOnly ? p.isDead : !p.isDead));
    this.targets = pool;
    this.targetIdx = 0;
    if (this.targets.length === 0) { this.phase = 'cmd'; return; }
    this.phase = 'target';
  }
  updateTarget(a) {
    if (this.game.input.isPressed('left') || this.game.input.isPressed('up'))
      { this.targetIdx = (this.targetIdx - 1 + this.targets.length) % this.targets.length; a.se('cursor'); }
    if (this.game.input.isPressed('right') || this.game.input.isPressed('down'))
      { this.targetIdx = (this.targetIdx + 1) % this.targets.length; a.se('cursor'); }
    if (this.game.input.isPressed('cancel')) { a.se('cancel'); this.phase = (this.pending.type === 'skill') ? 'skill' : (this.pending.type === 'item' ? 'item' : 'cmd'); return; }
    if (this.game.input.isPressed('confirm')) { a.se('confirm'); this.commit({ target: this.targets[this.targetIdx] }); }
  }

  commit(extra) {
    this.commands.set(this.curPlayer, { ...this.pending, ...extra });
    this.pending = null;
    this.advancePlayer();
  }

  // =================== EXECUTE ===================
  beginExec() {
    this.gen = this.system.resolveRound(this.commands, this.game.inventory);
    this.phase = 'exec';
    this.msgTimer = 0; this.flash = null;
    this.nextMessage();
  }
  nextMessage() {
    const n = this.gen.next();
    if (n.done) { this.afterRound(); return; }
    const m = n.value;
    this.log = m.text || this.log;
    this.flash = m.flash || null; this.flashT = 12;
    if (m.se) this.game.audio.se(m.se);
    this.msgTimer = m.text ? 40 : 1;
    this.phase = 'exec';
  }
  updateExec() {
    if (this.flashT > 0) this.flashT--;
    if (--this.msgTimer <= 0 || this.game.input.isPressed('confirm')) this.nextMessage();
  }

  afterRound() {
    if (this.system.isWin()) return this.beginResult();
    if (this.system.isLose()) return this.showThen('ぜんめつ してしまった……', () => this.finish('lose'));
    if (this.system.escaped) return this.finish('escape');
    // 次ラウンド
    this.players.forEach((p) => p.invalidate?.());
    this.startInput();
  }

  showThen(text, cb) {
    this.log = text; this.msgTimer = 70; this._after = cb; this.phase = 'message';
  }
  updateMessage() {
    if (--this.msgTimer <= 0 || this.game.input.isPressed('confirm')) { const cb = this._after; this._after = null; cb?.(); }
  }

  // =================== RESULT ===================
  beginResult() {
    const res = this.system.result();
    this.result = res;
    // 経験値・ゴールド配分
    this.levelups = [];
    const front = this.game.party.frontline();
    const reserve = this.game.state.party.reserve.map((id) => this.game.party.char(id)).filter(Boolean);
    for (const c of front) this.levelups.push(...LevelSystem.gainExp(c, res.exp, this.game.db));
    for (const c of reserve) LevelSystem.gainExp(c, Math.floor(res.exp * 0.5), this.game.db);
    this.game.party.gainGold(res.gold);
    for (const d of res.drops) this.game.inventory.add(d, 1);
    // 図鑑：撃破登録
    for (const e of this.enemies) if (!this.game.state.bestiary.defeated.includes(e.id)) this.game.state.bestiary.defeated.push(e.id);

    // 結果メッセージのキュー
    this.resultQueue = [];
    this.resultQueue.push(`たたかいに かった！`);
    this.resultQueue.push(`けいけんち ${res.exp} と ${res.gold} ギルを 手に入れた！`);
    for (const d of res.drops) { const it = this.game.db.getItem(d); this.resultQueue.push(`${it ? it.name : d} を 手に入れた！`); }
    for (const lu of this.levelups) {
      this.resultQueue.push(`${lu.name} は レベル ${lu.to} に あがった！`);
      if (lu.learned?.length) {
        const names = lu.learned.map((s) => this.game.db.getSkill(s)?.name || s).join('・');
        this.resultQueue.push(`${lu.name} は ${names} を おぼえた！`);
      }
    }
    this.game.audio.playBgm('field');
    if (this.levelups.length) this.game.audio.se('levelup');
    this.phase = 'result'; this.resultIdx = 0; this.log = this.resultQueue[0]; this.msgTimer = 60;
  }
  updateResult() {
    if (--this.msgTimer <= 0 || this.game.input.isPressed('confirm')) {
      this.resultIdx++;
      if (this.resultIdx >= this.resultQueue.length) { this.finish('win'); return; }
      this.log = this.resultQueue[this.resultIdx];
      this.msgTimer = this.resultIdx === this.resultQueue.length - 1 ? 60 : 50;
      if (this.resultQueue[this.resultIdx].includes('レベル')) this.game.audio.se('levelup');
    }
  }

  finish(outcome) {
    const result = outcome === 'win' ? { ...this.result, outcome } : { outcome };
    this.onComplete?.(result);
    this.game.scenes.pop();
  }

  // =================== RENDER ===================
  render(r) {
    // 背景
    r.clear(this.isBoss ? '#1a0e18' : '#0e1326');
    for (let i = 0; i < 40; i++) r.rect((i * 97) % VIEW_W, (i * 53) % 140, 2, 2, 'rgba(255,255,255,0.25)');
    r.rect(0, 220, VIEW_W, VIEW_H - 220, this.isBoss ? '#241020' : '#13203a');

    this.ui.drawEnemies(r, this.enemies, this.flashT > 0 ? this.flash : null, this.tick);

    // 対象カーソル
    if (this.phase === 'target') {
      const t = this.targets[this.targetIdx];
      if (this.targetKind === 'enemy') {
        const i = this.enemies.indexOf(t);
        const cx = (VIEW_W / (this.enemies.length + 1)) * (i + 1);
        r.text('▼', cx, 95, { size: 22, align: 'center', color: COLORS.selected });
      }
    }

    // ボスHPバー（ボス戦）
    if (this.bossEnemy && !this.bossEnemy.isDead) {
      const bw = 360, bx = (VIEW_W - bw) / 2, by = 64;
      r.text(this.bossEnemy.def.name, bx, by - 18, { size: 14, color: '#ffd0d0' });
      r.gauge(bx, by, bw, 10, this.bossEnemy.curHp / this.bossEnemy.maxHp, '#d2526b');
      if (this.bossEnemy._broken) r.text('不死 崩壊', bx + bw - 70, by - 18, { size: 12, color: '#ffd23f' });
    }
    // 赦しゲージ（神戦のみ）
    if (this.special) {
      const f = this.game.state.variables.forgiveness || 0;
      const gw = 220, gx = (VIEW_W - gw) / 2, gy = 92;
      r.text(`赦し ${f}`, gx, gy - 16, { size: 12, color: '#aee0ff' });
      r.gauge(gx, gy, gw, 8, f / 100, '#aee0ff');
      const can = f >= 60;
      r.text(can ? '連携「ラスト・レクイエム」 解放中' : '赦しが 足りない…連携は 使えない',
        gx, gy + 12, { size: 11, color: can ? '#ffd23f' : '#9a6b6b' });
    }

    this.ui.drawLog(r, this.log);
    this.ui.drawPartyStatus(r, this.players, (this.phase === 'cmd' || this.phase === 'skill' || this.phase === 'item' || this.phase === 'target') ? this.curPlayer : null);

    // コマンド系ウィンドウ
    if (this.phase === 'cmd') { r.window(16, VIEW_H - 92, 150, 84); this.cmdMenu.render(r, 30, VIEW_H - 84, 130); }
    if (this.phase === 'skill') { r.window(16, 70, 240, 200); r.text('じゅもん／スキル', 30, 78, { size: 14, color: COLORS.textDim }); this.skillMenu.render(r, 30, 104, 220); }
    if (this.phase === 'item')  { r.window(16, 70, 240, 200); r.text('どうぐ', 30, 78, { size: 14, color: COLORS.textDim }); this.itemMenu.render(r, 30, 104, 220); }
    if (this.phase === 'target' && this.targetKind === 'ally') {
      const t = this.targets[this.targetIdx];
      const i = this.players.indexOf(t);
      const w = VIEW_W / this.players.length;
      r.strokeRect(i * w + 4, VIEW_H - 92, w - 8, 84, COLORS.selected, 3);
    }
  }
}
