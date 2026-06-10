/**
 * scenes/BattleScene.js
 * @layer presentation(scene)
 * 戦闘画面。コマンド入力→ラウンド解決→結果（EXP/Lv/ドロップ）の状態機械。
 * ルール計算は domain/BattleSystem に委譲し、本シーンは入力・演出・進行を担う。
 */
import { Scene } from '../core/Scene.js';
import { VIEW_W, VIEW_H, COLORS } from '../config/constants.js';
import { drawBattleBg } from '../ui/Backdrop.js';
import { CommandWindow } from '../ui/CommandWindow.js';
import { BattleUI } from '../ui/BattleUI.js';
import { BattleSystem } from '../domain/systems/BattleSystem.js';
import { Enemy } from '../domain/entities/Enemy.js';
import { LevelSystem } from '../domain/systems/LevelSystem.js';
import { checkDexRewards } from '../domain/systems/DexRewards.js';
import { rng } from '../core/RNG.js';

const ENEMY_LABELS = ['Ａ', 'Ｂ', 'Ｃ', 'Ｄ', 'Ｅ'];

function rgbaHex(hex, a) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const ELEM_COLOR = { fire: '#ff6a3a', ice: '#7fd8ff', thunder: '#ffd23f', wind: '#7fe0a0', earth: '#cf9a52', light: '#fff0a0', dark: '#a878e0' };

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
      difficulty: this.game.state.settings.difficulty,
    });

    this.game.audio.playBgm(this.isBoss ? 'boss' : 'battle');
    this.markSeen();

    this.phase = 'intro';
    this.introMax = this.isBoss ? 100 : 60; // ボスは登場演出ぶん長め
    this.introT = this.introMax;
    this.log = `${this.enemyNames()} が あらわれた！`;
    this.commands = new Map();
    this.flash = null; this.tick = 0;
    this.popups = []; this.shakeT = 0; this.shakeMag = 0; this.bfx = [];
    this._buildCmdMenu();
  }

  // 戦闘演出：浮き上がるダメージ/回復数字
  spawnPopup(popup) {
    if (!popup) return;
    const pos = this._targetPos(popup.who);
    if (!pos) return;
    const styles = {
      damage: { color: '#ffffff', size: 22 },
      crit:   { color: '#ffe24a', size: 34 },
      weak:   { color: '#ff8a5a', size: 27 },
      heal:   { color: '#7bf08a', size: 22 },
    };
    const s = styles[popup.kind] || styles.damage;
    const text = popup.kind === 'heal' ? `+${popup.value}` : `${popup.value}${popup.kind === 'crit' ? '!' : ''}`;
    this.popups.push({
      x: pos.x + (Math.random() * 20 - 10), y: pos.y - 6,
      vx: Math.random() * 1.2 - 0.6, vy: -3.0, g: 0.16,
      life: 52, max: 52, kind: popup.kind, text, ...s,
    });
    if (popup.kind === 'crit' || popup.kind === 'weak') { this.shakeT = 12; this.shakeMag = popup.kind === 'crit' ? 7 : 4; }
  }
  _targetPos(who) {
    if (!who) return null;
    if (!who.isPlayer) {
      const i = this.enemies.indexOf(who);
      if (i < 0) return null;
      return { x: (VIEW_W / (this.enemies.length + 1)) * (i + 1), y: 130 };
    }
    const i = this.players.indexOf(who);
    if (i < 0) return null;
    const w = VIEW_W / this.players.length;
    return { x: i * w + w / 2, y: VIEW_H - 100 };
  }
  _updatePopups() {
    for (const p of this.popups) { p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life--; }
    this.popups = this.popups.filter((p) => p.life > 0);
    if (this.bfx.length) { for (const f of this.bfx) { if (f.type === 'spark') { f.x += f.vx; f.y += f.vy; f.vy += f.g; } f.life--; } this.bfx = this.bfx.filter((f) => f.life > 0); }
    if (this.shakeT > 0) this.shakeT--;
  }

  // 全体攻撃/魔法のエフェクト（バンド閃光＋各対象にリング＋粒子）
  // 単体魔法ヒット時の属性バースト（リング＋粒子）
  _spawnHitFx(target, element) {
    const pos = this._targetPos(target); if (!pos) return;
    const col = ELEM_COLOR[element] || '#bfd8ff';
    this.bfx.push({ type: 'ring', x: pos.x, y: pos.y, col, life: 18, max: 18 });
    for (let k = 0; k < 9; k++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.2;
      this.bfx.push({ type: 'spark', x: pos.x, y: pos.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6, g: 0.12, life: 18 + Math.random() * 12, max: 32, col });
    }
  }

  _spawnSkillFx(fx) {
    if (!fx || !fx.aoe) return;
    const col = fx.kind === 'heal' ? '#7bf08a' : (ELEM_COLOR[fx.element] || '#bfd8ff');
    const targets = (fx.side === 'ally' ? this.players : this.enemies).filter((t) => !t.isDead);
    this.bfx.push({ type: 'band', col, side: fx.side, life: 22, max: 22 });
    this.shakeT = Math.max(this.shakeT, 8); this.shakeMag = 4;
    for (const t of targets) {
      const pos = this._targetPos(t); if (!pos) continue;
      this.bfx.push({ type: 'ring', x: pos.x, y: pos.y, col, life: 22, max: 22 });
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.4;
        this.bfx.push({ type: 'spark', x: pos.x, y: pos.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (fx.kind === 'heal' ? 1.8 : 0.6), g: 0.12, life: 22 + Math.random() * 14, max: 38, col });
      }
    }
  }

  _drawBfx(r) {
    if (!this.bfx || !this.bfx.length) return;
    const c = r.ctx; c.save(); c.globalCompositeOperation = 'lighter';
    for (const f of this.bfx) {
      const p = Math.max(0, f.life / f.max);
      if (f.type === 'band') {
        const y0 = f.side === 'ally' ? VIEW_H - 168 : 66, h = 132;
        const g = c.createLinearGradient(0, y0, 0, y0 + h);
        g.addColorStop(0, rgbaHex(f.col, 0)); g.addColorStop(0.5, rgbaHex(f.col, 0.32 * p)); g.addColorStop(1, rgbaHex(f.col, 0));
        c.fillStyle = g; c.fillRect(0, y0, VIEW_W, h);
      } else if (f.type === 'ring') {
        c.strokeStyle = rgbaHex(f.col, 0.85 * p); c.lineWidth = 3;
        c.beginPath(); c.arc(f.x, f.y, (1 - p) * 34 + 6, 0, 7); c.stroke();
      } else {
        c.fillStyle = rgbaHex(f.col, Math.min(1, p * 1.4));
        c.beginPath(); c.arc(f.x, f.y, 2.4 * (0.5 + p), 0, 7); c.fill();
      }
    }
    c.restore();
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
      { label: 'たたかう', value: 'attack', icon: 'attack' },
      { label: 'じゅもん', value: 'skill', icon: 'skill' },
      { label: 'どうぐ', value: 'item', icon: 'item' },
      { label: 'ぼうぎょ', value: 'defend', icon: 'defend' },
      { label: 'にげる', value: 'escape', disabled: this.isBoss, icon: 'escape' },
    ], { cols: 1, lineH: 28 });
  }

  // =================== UPDATE ===================
  update() {
    this.tick++;
    this._updatePopups();
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
        icon: (s.sk.element && s.sk.element !== 'none') ? s.sk.element : (s.sk.type === 'heal' ? 'item' : 'skill'),
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
      items.map((e) => ({ value: e.id, label: e.item.name, sub: `×${e.count}`, icon: e.item.type || 'item' })), { lineH: 26 });
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
    // 被弾/攻撃モーション用のトリガ（敵のみ。tickを起点に BattleUI が演出）
    if (m.flash && this.enemies.includes(m.flash)) m.flash._hitTick = this.tick;
    if (m.actor && this.enemies.includes(m.actor)) m.actor._atkTick = this.tick;
    if (m.fx) this._spawnSkillFx(m.fx);
    if (m.magic && m.flash) this._spawnHitFx(m.flash, m.element);
    if (m.popup) this.spawnPopup(m.popup);
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
    if (this.system.isLose()) { this.game.audio.defeat(); return this.showThen('ぜんめつ してしまった……', () => this.finish('lose')); }
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
    // 経験値・ゴールド配分（難易度でEXP補正：易+20%／難-10%）
    const diff = this.game.state.settings.difficulty;
    const expMul = diff === 'easy' ? 1.2 : (diff === 'hard' ? 0.9 : 1.0);
    res.exp = Math.floor(res.exp * expMul);
    this.levelups = [];
    const front = this.game.party.frontline();
    const reserve = this.game.state.party.reserve.map((id) => this.game.party.char(id)).filter(Boolean);
    const ratio = (c) => { const lo = LevelSystem.totalExpFor(c.lv), hi = LevelSystem.totalExpFor(c.lv + 1); return hi > lo ? Math.max(0, Math.min(1, (c.exp - lo) / (hi - lo))) : 1; };
    const rows = [];
    for (const c of front) {
      const lv0 = c.lv, r0 = ratio(c);
      const lus = LevelSystem.gainExp(c, res.exp, this.game.db);
      this.levelups.push(...lus);
      const learned = lus.flatMap((l) => l.learned || []).map((s) => this.game.db.getSkill(s)?.name || s);
      rows.push({ name: c.name, lv0, r0, lv1: c.lv, r1: ratio(c), up: c.lv > lv0, learned });
    }
    for (const c of reserve) LevelSystem.gainExp(c, Math.floor(res.exp * 0.5), this.game.db);
    this.game.party.gainGold(res.gold);
    for (const d of res.drops) this.game.inventory.add(d, 1);
    // 図鑑：撃破登録
    for (const e of this.enemies) if (!this.game.state.bestiary.defeated.includes(e.id)) this.game.state.bestiary.defeated.push(e.id);
    const dex = checkDexRewards(this.game);
    this.game.audio.victory(); // 勝利ファンファーレ
    this.resultData = { exp: res.exp, gold: res.gold, drops: res.drops.slice(), rows, dex };
    this.resultT = 0; this._luSe = false;
    this.log = '';
    this.phase = 'result';
  }
  updateResult(a) {
    this.resultT++;
    const DUR = 70;
    if (!this._luSe && this.resultT > 42 && this.resultData.rows.some((row) => row.up)) { this._luSe = true; a.se('levelup'); }
    if (this.game.input.isPressed('confirm')) {
      if (this.resultT < DUR) { this.resultT = DUR; }
      else { a.se('confirm'); this.finish('win'); }
    }
  }

  finish(outcome) {
    const result = outcome === 'win' ? { ...this.result, outcome } : { outcome };
    this.onComplete?.(result);
    this.game.scenes.pop();
  }

  // =================== RENDER ===================
  render(r) {
    // 背景（雰囲気のある手続き背景）
    drawBattleBg(r.ctx, { boss: this.isBoss, special: this.special, tick: this.tick, env: this.params?.env });

    // 画面シェイク（会心/弱点ヒット時、敵の描画をゆらす）
    let sx = 0, sy = 0;
    if (this.shakeT > 0) { const m = this.shakeMag * (this.shakeT / 12); sx = (Math.random() - 0.5) * m * 2; sy = (Math.random() - 0.5) * m * 2; }
    r.save(); r.translate(sx, sy);
    if (this.isBoss && this.phase === 'intro') { // 登場ズームイン
      const z = 1.7 - 0.7 * this._ease(this._introP());
      const cx = VIEW_W / 2, cy = 150;
      r.ctx.translate(cx, cy); r.ctx.scale(z, z); r.ctx.translate(-cx, -cy);
    }
    this.ui.drawEnemies(r, this.enemies, this.flashT > 0 ? this.flash : null, this.tick);
    r.restore();

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
    this.ui.drawPartyStatus(r, this.players, (this.phase === 'cmd' || this.phase === 'skill' || this.phase === 'item' || this.phase === 'target') ? this.curPlayer : null, this.tick);
    // 全体攻撃/魔法のエフェクト（敵・味方の上に加算）
    this._drawBfx(r);
    // 行動順（AGI順の予測）インジケータ
    if (this.phase === 'cmd' || this.phase === 'target') this._drawTurnOrder(r);

    // コマンド系ウィンドウ
    if (this.phase === 'cmd') { r.window(16, VIEW_H - 92, 150, 84); this.cmdMenu.render(r, 30, VIEW_H - 84, 130, this.game.assets); }
    if (this.phase === 'skill') { r.window(16, 70, 240, 200); r.text('じゅもん／スキル', 30, 78, { size: 14, color: COLORS.textDim }); this.skillMenu.render(r, 30, 104, 220, this.game.assets); }
    if (this.phase === 'item')  { r.window(16, 70, 240, 200); r.text('どうぐ', 30, 78, { size: 14, color: COLORS.textDim }); this.itemMenu.render(r, 30, 104, 220, this.game.assets); }
    if (this.phase === 'target' && this.targetKind === 'ally') {
      const t = this.targets[this.targetIdx];
      const i = this.players.indexOf(t);
      const w = VIEW_W / this.players.length;
      r.strokeRect(i * w + 4, VIEW_H - 92, w - 8, 84, COLORS.selected, 3);
    }

    // 浮き上がるダメージ/回復数字（弾む・縁取り・会心は特大＋光輪）
    const c = r.ctx;
    for (const p of this.popups) {
      const age = p.max - p.life;
      const pop = age < 5 ? 0.5 + 0.5 * (age / 5) : (age < 9 ? 1.14 - 0.14 * ((age - 5) / 4) : 1); // 出現時に弾む
      const alpha = Math.min(1, p.life / 12);
      if (p.kind === 'crit' && age < 12) { // 会心の光輪
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = (1 - age / 12) * 0.7;
        c.strokeStyle = '#ffe24a'; c.lineWidth = 3;
        c.beginPath(); c.arc(p.x, p.y, 8 + age * 4.5, 0, 7); c.stroke(); c.restore();
      }
      c.save();
      c.globalAlpha = alpha;
      c.translate(p.x, p.y); c.scale(pop, pop);
      c.font = `bold ${p.size}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
      c.lineWidth = Math.max(3, p.size * 0.18); c.strokeStyle = 'rgba(0,0,0,0.85)'; c.strokeText(p.text, 0, 0);
      c.fillStyle = p.color; c.fillText(p.text, 0, 0);
      c.restore();
    }

    // ボス登場演出（暗転リビール＋赤フラッシュ＋WARNINGバナー）は最前面
    if (this.isBoss && this.phase === 'intro') this._drawBossIntro(r);
    // 勝利リザルト演出
    if (this.phase === 'result') this._drawResult(r);
  }

  _drawResult(r) {
    const c = r.ctx, d = this.resultData; if (!d) return;
    const ap = Math.min(1, this.resultT / 70), ease = ap * ap * (3 - 2 * ap);
    const x = 60, y = 44, w = VIEW_W - 120, h = 322;
    r.window(x, y, w, h);
    // VICTORY タイトル（ポップ）
    const pop = this.resultT < 12 ? this.resultT / 12 : 1;
    c.save(); c.translate(x + w / 2, y + 30); c.scale(pop, pop);
    c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.lineWidth = 5; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.strokeText('VICTORY!', 0, 0);
    c.fillStyle = '#ffd23f'; c.fillText('VICTORY!', 0, 0); c.restore();
    // EXP / GOLD カウントアップ
    r.text('けいけんち', x + 26, y + 60, { size: 14, color: COLORS.textDim });
    r.text(`${Math.floor(d.exp * ease)}`, x + 150, y + 58, { size: 18, color: COLORS.exp });
    r.text('ゴールド', x + 26, y + 88, { size: 14, color: COLORS.textDim });
    r.text(`${Math.floor(d.gold * ease)}`, x + 150, y + 86, { size: 18, color: '#ffd23f' });
    // ドロップ（アイコン）
    r.text('入手', x + 270, y + 56, { size: 13, color: COLORS.textDim });
    if (d.drops.length) {
      d.drops.forEach((id, i) => { const it = this.game.db.getItem(id); this.game.assets.drawIcon(c, x + 296, y + 66 + i * 22, 7, it?.type || 'item'); r.text(it ? it.name : id, x + 310, y + 60 + i * 22, { size: 13 }); });
    } else r.text('なし', x + 296, y + 60, { size: 13, color: COLORS.textDim });
    // パーティ EXP バー
    d.rows.forEach((row, i) => {
      const ry = y + 132 + i * 40, bw = w - 250, bx = x + 210;
      r.text(row.name, x + 26, ry, { size: 15 });
      r.text(`Lv ${row.up && ease < 0.9 ? row.lv0 : row.lv1}`, x + 140, ry, { size: 13, color: row.up ? '#ffd23f' : COLORS.text });
      const ratio = row.up ? ease : (row.r0 + (row.r1 - row.r0) * ease);
      r.gauge(bx, ry + 2, bw, 11, Math.min(1, ratio), COLORS.exp);
      if (row.up && ease > 0.55) {
        const bl = 0.6 + 0.4 * Math.sin(this.tick * 0.3);
        c.save(); c.globalAlpha = bl; r.text('LEVEL UP!', bx + bw - 96, ry - 1, { size: 13, color: '#ffd23f' }); c.restore();
      }
      if (row.learned.length && ease > 0.9) r.text(`▶ ${row.learned.join('・')} を おぼえた！`, bx, ry + 16, { size: 11, color: '#aee0ff' });
    });
    // 図鑑報酬
    if (d.dex && d.dex.length && ease > 0.9) r.text(`★ ${d.dex[0]}`, x + 26, y + h - 44, { size: 12, color: '#ffd23f' });
    // 続行プロンプト
    if (ap >= 1) { const bl = 0.5 + 0.5 * Math.sin(this.tick * 0.2); c.save(); c.globalAlpha = bl; r.text('▼ かくにん', x + w - 110, y + h - 26, { size: 13, color: COLORS.selected }); c.restore(); }
  }

  _introP() { return Math.max(0, Math.min(1, (this.introMax - this.introT) / this.introMax)); }
  _ease(p) { return p * p * (3 - 2 * p); }

  _drawTurnOrder(r) {
    const order = [...this.players, ...this.enemies].filter((a) => !a.isDead).sort((x, y) => (y.agi || 0) - (x.agi || 0));
    if (order.length < 2) return;
    const c = r.ctx, tw = 30, x0 = 24, y = this.bossEnemy ? 98 : 64;
    r.text('行動順（予測）', x0, y - 15, { size: 11, color: COLORS.textDim });
    order.forEach((a, i) => {
      const tx = x0 + i * tw, cur = a === this.curPlayer;
      const col = a.isPlayer ? (this.game.db.getCharacter(a.id)?.color || '#4fb2ff') : this.ui._famColor(a.family);
      c.save();
      r.roundPath(tx, y, 24, 24, 4); c.fillStyle = col; c.fill();
      const g = c.createLinearGradient(0, y, 0, y + 24); g.addColorStop(0, 'rgba(255,255,255,0.28)'); g.addColorStop(0.5, 'rgba(255,255,255,0)');
      r.roundPath(tx, y, 24, 24, 4); c.fillStyle = g; c.fill();
      c.lineWidth = cur ? 2.5 : 1; c.strokeStyle = cur ? COLORS.selected : 'rgba(0,0,0,0.6)'; r.roundPath(tx, y, 24, 24, 4); c.stroke();
      c.restore();
      c.fillStyle = '#fff'; c.font = 'bold 13px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillText((a.name || '?').slice(0, 1), tx + 13, y + 13);
      c.fillStyle = '#fff'; c.fillText((a.name || '?').slice(0, 1), tx + 12, y + 12);
      if (cur) r.text('▼', tx + 7, y - 13, { size: 12, color: COLORS.selected });
      if (i < order.length - 1) r.text('›', tx + 25, y + 4, { size: 14, color: COLORS.textDim });
    });
  }

  _drawBossIntro(r) {
    const c = r.ctx, p = this._introP();
    c.save();
    c.fillStyle = `rgba(2,2,8,${Math.pow(1 - p, 1.4) * 0.88})`; c.fillRect(0, 0, VIEW_W, VIEW_H); // 暗転→リビール
    c.restore();
    if (p < 0.18) { // 開幕の赤フラッシュ
      c.save(); c.globalCompositeOperation = 'lighter';
      c.fillStyle = `rgba(150,20,30,${(0.18 - p) / 0.18 * 0.5})`; c.fillRect(0, 0, VIEW_W, VIEW_H); c.restore();
    }
    if (p > 0.15) { // WARNINGバナー
      const out = p > 0.82 ? (p - 0.82) / 0.18 : 0;
      const a = 1 - out, by = 196, bh = 56;
      c.save(); c.globalAlpha = a;
      const g = c.createLinearGradient(0, by, 0, by + bh);
      g.addColorStop(0, 'rgba(120,10,20,0.92)'); g.addColorStop(0.5, 'rgba(40,4,10,0.92)'); g.addColorStop(1, 'rgba(120,10,20,0.92)');
      c.fillStyle = g; c.fillRect(0, by, VIEW_W, bh);
      c.strokeStyle = '#ff5a4a'; c.lineWidth = 2; c.strokeRect(1, by + 2, VIEW_W - 2, bh - 4);
      c.fillStyle = '#ff8a3a'; // 端の警告ストライプ
      for (let i = 0; i < VIEW_W; i += 22) { c.beginPath(); c.moveTo(i, by); c.lineTo(i + 10, by); c.lineTo(i + 4, by + 6); c.closePath(); c.fill(); c.beginPath(); c.moveTo(i, by + bh); c.lineTo(i + 10, by + bh); c.lineTo(i + 4, by + bh - 6); c.closePath(); c.fill(); }
      const blink = 0.6 + 0.4 * Math.sin(this.tick * 0.4);
      c.globalAlpha = a * blink;
      r.text('⚠  W A R N I N G  ⚠', VIEW_W / 2, by + 7, { size: 22, align: 'center', color: '#ffd23f' });
      c.globalAlpha = a;
      r.text(this.bossEnemy ? this.bossEnemy.def.name : 'ボス', VIEW_W / 2, by + 34, { size: 16, align: 'center', color: '#ffffff' });
      c.restore();
    }
  }
}
