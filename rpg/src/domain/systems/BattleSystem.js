/**
 * domain/systems/BattleSystem.js
 * @layer domain
 * ターン制バトルの中核ロジック（§05）。UIから独立し、ルールのみを担う。
 * resolveRound() はジェネレータで、1メッセージずつ yield する。
 * BattleScene はこれを順に消費して演出・入力待ちを行う。
 *
 * yieldするメッセージ: { text, se?, flash? }
 */
import { DamageFormula } from './DamageFormula.js';
import { StatusEffectSystem as SES } from './StatusEffectSystem.js';
import { EnemyAI } from './EnemyAI.js';
import { STATUS } from '../../config/constants.js';
import { pick } from '../../core/util.js';

export class BattleSystem {
  constructor(players, enemies, db, rng, opts = {}) {
    this.players = players;       // Character[]
    this.enemies = enemies;       // Enemy[]
    this.db = db; this.rng = rng;
    this.canEscape = opts.canEscape !== false;
    this.isBoss = opts.isBoss || false;
    this.escaped = false;
    this.turnCount = 0;
    // 難易度：プレイヤーが受けるダメージ倍率
    this.playerDmgMul = opts.difficulty === 'easy' ? 0.7 : (opts.difficulty === 'hard' ? 1.3 : 1.0);
  }

  livePlayers() { return this.players.filter((p) => !p.isDead); }
  liveEnemies() { return this.enemies.filter((e) => !e.isDead); }

  isWin()  { return this.liveEnemies().length === 0; }
  isLose() { return this.livePlayers().length === 0; }
  isOver() { return this.isWin() || this.isLose() || this.escaped; }

  baseHit(attacker) { return 90 + (((attacker.dex || 10) - 5) * 0.5); }

  /**
   * 1ラウンドを解決。playerCommands: Map<Character, command>
   * command: { type:'attack'|'skill'|'item'|'defend'|'escape', skillId?, itemId?, target? }
   */
  *resolveRound(playerCommands, inventory) {
    this.turnCount++;
    this._inv = inventory; // ぬすむ等でアイテムを増やすのに使う
    const all = [...this.players, ...this.enemies];
    for (const a of all) a._defending = false;

    // 逃走（プレイヤーの誰かが逃げる選択 → 先に判定）
    for (const [actor, cmd] of playerCommands) {
      if (cmd?.type === 'escape') {
        const ok = this.canEscape && this.rng.chance(0.6 + this._agiAdvantage());
        if (ok) { this.escaped = true; yield { text: 'うまく にげだした！', se: 'cancel' }; return; }
        yield { text: 'しかし まわりこまれてしまった！', se: 'cancel' };
      }
    }

    // 行動順（AGI×乱数）
    const order = all
      .filter((a) => !a.isDead)
      .map((a) => ({ a, v: a.agi * this.rng.float(0.9, 1.1) }))
      .sort((x, y) => y.v - x.v)
      .map((o) => o.a);

    for (const actor of order) {
      if (actor.isDead || this.isOver()) continue;

      // 行動可能判定（まひ/ねむり）
      if (!SES.canAct(actor, this.rng)) {
        // 溜め中に行動不能 → 大技が崩れる（睡眠/麻痺による妨害成功）
        if (actor._charging) {
          actor._charging = null;
          yield { text: `${actor.name}の ためが くずれた！`, se: 'cancel' };
        }
        if (SES.has(actor, STATUS.SLEEP)) yield { text: `${actor.name}は ねむっている。` };
        else yield { text: `${actor.name}は からだが しびれて うごけない！` };
        continue;
      }

      const cmd = actor.isPlayer
        ? (playerCommands.get(actor) || { type: 'defend' })
        : this._enemyCommand(actor);
      yield* this._execute(actor, cmd, inventory);
      // 攻撃直後にHP閾値フェーズを判定（被弾の瞬間に変化が起きると劇的）
      yield* this._checkPhases();
      if (this.isOver()) break;
    }

    // ラウンド終了時：状態異常の経過処理
    for (const a of order) {
      if (a.isDead) continue;
      const log = [];
      SES.tickTurnEnd(a, log);
      for (const t of log) yield { text: t, se: a.isDead ? 'damage' : undefined };
    }

    // ── 特殊ボス：神の「不死（無限回復）」と「世界の初期化（時間切れ）」 ──
    for (const e of this.enemies) {
      if (e.isDead || !e.def.regenUntilBroken || e._broken) continue;
      if (e.curHp < e.maxHp) {
        e.curHp = e.maxHp; // 不死性：傷が瞬時に塞がる
        yield { text: `${e.def.name}の 傷が、みるみる ふさがっていく……！`, se: 'heal' };
      }
    }
    const doom = this.enemies.find((e) =>
      !e.isDead && e.def.doomTurn && !e._broken && this.turnCount >= e.def.doomTurn);
    if (doom) {
      yield { text: `${doom.def.name}「——もう いい。リセットの 時だ。」`, se: 'damage' };
      for (const p of this.players) p.curHp = 0; // 世界の初期化＝全滅（Bad導線）
      yield { text: '世界が、白く 塗りつぶされていく……', se: 'cancel' };
    }
  }

  _agiAdvantage() {
    const pa = this.livePlayers().reduce((s, p) => s + p.agi, 0) / Math.max(1, this.livePlayers().length);
    const ea = this.liveEnemies().reduce((s, e) => s + e.agi, 0) / Math.max(1, this.liveEnemies().length);
    return Math.max(-0.3, Math.min(0.3, (pa - ea) * 0.01));
  }

  /** HP閾値フェーズ変化（属性/AI/攻撃力の切り替え）。被弾直後に呼ぶ */
  *_checkPhases() {
    for (const e of this.enemies) {
      if (e.isDead || !e.def.phases) continue;
      const ratio = e.curHp / e.maxHp;
      for (const ph of e.def.phases) {
        if (e._appliedPhases.has(ph) || ratio > ph.hp) continue;
        e._appliedPhases.add(ph);
        if (ph.element) e._elementOverride = ph.element;
        if (ph.ai) e._aiOverride = ph.ai;
        if (ph.atkMul) e._atkMul = ph.atkMul;
        if (ph.healRatio) e.curHp = Math.min(e.maxHp, e.curHp + Math.floor(e.maxHp * ph.healRatio));
        if (ph.message) yield { text: ph.message, se: 'magic', flash: e };
      }
    }
  }

  _enemyTargetFor(skill) {
    if (skill && (skill.target === 'oneAlly' || skill.type === 'heal')) {
      return pick(this.liveEnemies(), () => this.rng.next());
    }
    return pick(this.livePlayers(), () => this.rng.next());
  }

  _enemyCommand(enemy) {
    // 溜め解放：前ターンに予兆を出した大技を、今ターン発動する
    if (enemy._charging) {
      const skillId = enemy._charging.skillId;
      enemy._charging = null;
      return { type: 'skill', skillId, target: this._enemyTargetFor(this.db.getSkill(skillId)), released: true };
    }
    const a = EnemyAI.decide(enemy, this.rng);
    if (a.type === 'skill') {
      const skill = this.db.getSkill(a.skillId);
      // charge技：このターンは予兆のみ（行動を消費）、次ターンに解放
      if (skill && skill.charge) {
        enemy._charging = { skillId: a.skillId };
        return { type: 'chargeWarn', skillName: skill.name };
      }
      return { type: 'skill', skillId: a.skillId, target: this._enemyTargetFor(skill) };
    }
    return { type: 'attack', skillId: 'attack', target: pick(this.livePlayers(), () => this.rng.next()) };
  }

  *_execute(actor, cmd, inventory) {
    switch (cmd.type) {
      case 'chargeWarn':
        actor._defending = false;
        yield { text: `${actor.name}は ${cmd.skillName}の 力を ためている……！ （今のうちに 守りを！）`, se: 'magic', flash: actor };
        return;
      case 'defend':
        actor._defending = true;
        yield { text: `${actor.name}は 身を まもっている。` };
        return;
      case 'item':
        yield* this._useItem(actor, cmd, inventory);
        return;
      case 'attack':
      case 'skill':
      default:
        yield* this._useSkill(actor, cmd);
        return;
    }
  }

  *_useSkill(actor, cmd) {
    const skill = this.db.getSkill(cmd.skillId);
    if (!skill) return;
    const magicLike = ['magic', 'heal', 'status', 'revive'].includes(skill.type);

    if (magicLike && SES.has(actor, STATUS.SILENCE)) {
      yield { text: `${actor.name}は ちんもくして じゅもんが 使えない！` };
      return;
    }
    if ((skill.mp || 0) > actor.curMp) {
      yield { text: `${actor.name}は MPが たりない！` };
      return;
    }
    actor.curMp -= skill.mp || 0;

    // 行動メッセージ
    if (cmd.skillId === 'attack') yield { text: `${actor.name}の こうげき！` };
    else if (['magic', 'heal', 'revive', 'status'].includes(skill.type)) {
      yield { text: `${actor.name}は ${skill.name}を となえた！`, se: skill.type === 'heal' ? 'heal' : 'magic' };
    } else {
      yield { text: `${actor.name}の ${skill.name}！`, se: skill.type === 'steal' ? 'open' : undefined };
    }

    const targets = this._resolveTargets(actor, skill, cmd.target);
    for (const t of targets) {
      if (!t) continue;
      yield* this._applyToTarget(actor, skill, t);
    }
    // 銘・連撃：通常こうげきが 35%で もう一度
    if (cmd.skillId === 'attack' && actor.weaponMei === 'double' && this.rng.chance(0.35)) {
      const t = targets.find((x) => x && !x.isDead) || pick(this.players.includes(actor) ? this.enemies.filter((e) => !e.isDead) : this.players.filter((p) => !p.isDead), () => this.rng.next());
      if (t) { yield { text: '連撃！', se: 'hit' }; yield* this._applyToTarget(actor, skill, t); }
    }
  }

  _resolveTargets(actor, skill, chosen) {
    const allies = (actor.isPlayer ? this.players : this.enemies);
    const foes = (actor.isPlayer ? this.enemies : this.players);
    const liveAllies = allies.filter((a) => !a.isDead);
    const liveFoes = foes.filter((a) => !a.isDead);
    switch (skill.target) {
      case 'self': return [actor];
      case 'allEnemies': return liveFoes;
      case 'allAllies': return liveAllies;
      case 'oneAlly':
        return [chosen && !chosen.isDead ? chosen : pick(liveAllies, () => this.rng.next())];
      case 'deadAlly': // 蘇生用
        return [chosen || allies.find((a) => a.isDead)];
      case 'oneEnemy':
      default:
        return [chosen && !chosen.isDead ? chosen : pick(liveFoes, () => this.rng.next())];
    }
  }

  *_applyToTarget(actor, skill, t) {
    // ぬすむ
    if (skill.type === 'steal') {
      if (t.isPlayer) return;
      if (t._stolen) { yield { text: `${t.name}からは もう 何も 盗めない。` }; return; }
      const list = (t.def && t.def.steal) ? (Array.isArray(t.def.steal) ? t.def.steal : [t.def.steal]) : null;
      if (!list || !list.length) { yield { text: `${t.name}は 何も 持っていない。` }; return; }
      const entry = list[Math.floor(this.rng.next() * list.length)];
      const rate = Math.min(0.95, (entry.rate ?? 0.4) + (((actor.dex || 5) + (actor.luk || 5)) * 0.005));
      if (this.rng.chance(rate)) {
        t._stolen = true;
        if (this._inv) this._inv.add(entry.item, 1);
        const it = this.db.getItem(entry.item);
        yield { text: `${t.name}から ${it ? it.name : entry.item}を 盗んだ！`, se: 'steal' };
      } else {
        yield { text: `${t.name}からの ぬすみは 失敗した。` };
      }
      return;
    }
    // 回復
    if (skill.type === 'heal') {
      const amt = DamageFormula.heal(actor, skill.power, this.rng);
      t.curHp += amt;
      yield { text: `${t.name}の HPが ${amt} かいふくした。`, se: 'heal', popup: { who: t, value: amt, kind: 'heal' } };
      return;
    }
    if (skill.type === 'revive') {
      if (!t || !t.isDead) { yield { text: '効果が なかった。' }; return; }
      t.curHp = Math.floor(t.maxHp * (skill.power || 0.5));
      yield { text: `${t.name}が いきをふきかえした！`, se: 'heal' };
      return;
    }
    // ダメージ系
    if (skill.type === 'physical' || skill.type === 'magic') {
      if (skill.type === 'physical' &&
          !DamageFormula.hitCheck(actor, t, this.baseHit(actor), this.rng)) {
        yield { text: `しかし ${t.name}には 当たらなかった！` };
        return;
      }
      const opts = { element: skill.element, power: skill.power };
      const res = skill.type === 'physical'
        ? DamageFormula.physical(actor, t, opts, this.rng)
        : DamageFormula.magic(actor, t, opts, this.rng);

      if (res.nullified) { yield { text: `${t.name}には 効かない！` }; return; }
      if (res.absorbed) {
        t.curHp += res.value;
        yield { text: `${t.name}は ${res.value} ぶんの 力を 吸収した！`, se: 'heal', popup: { who: t, value: res.value, kind: 'heal' } };
        return;
      }
      const wake = [];
      SES.wakeOnHit(t, wake);
      let dmg = res.value;
      if (t._defending) dmg = Math.max(1, Math.floor(dmg * 0.5));
      let vuln = false;
      if (t._charging) { dmg = Math.floor(dmg * 1.25); vuln = true; } // 溜め中は隙だらけ
      if (t.isPlayer) dmg = Math.max(1, Math.floor(dmg * this.playerDmgMul)); // 難易度補正
      t.curHp -= dmg;
      const tag = res.mult > 1 ? ' 弱点を ついた！' : (res.mult > 0 && res.mult < 1 ? ' （半減）' : '')
        + (vuln ? ' （ための 隙を ついた！）' : '');
      yield {
        text: `${t.name}に ${dmg}の ダメージ！${res.crit ? ' 会心の一撃！' : ''}${tag}`,
        se: res.crit ? 'crit' : 'damage', flash: t,
        popup: { who: t, value: dmg, kind: res.crit ? 'crit' : (res.mult > 1 ? 'weak' : 'damage') },
      };
      for (const w of wake) yield { text: w };
      // 銘・吸血：物理ダメージの一部を 回復
      if (actor.weaponMei === 'vampire' && skill.type === 'physical' && !actor.isDead) {
        const drain = Math.max(1, Math.floor(dmg * 0.25));
        actor.curHp += drain;
        yield { text: `${actor.name}は ${drain} 吸収した。`, se: 'heal', popup: { who: actor, value: drain, kind: 'heal' } };
      }
    }
    // 連携技「ラスト・レクイエム」：神の不死性を打ち砕く
    if (skill.breaksRegen && t.def && t.def.regenUntilBroken && !t._broken) {
      t._broken = true;
      yield { text: `${t.name}の 不死が——砕けた！ いまなら、届く！`, se: 'hit' };
    }
    // 状態異常付与
    if (skill.inflict && !t.isDead) {
      yield* this._tryInflict(actor, t, skill.inflict);
    }
    if (t.isDead) yield { text: `${t.name}を たおした！`, se: 'cancel' };
  }

  /** 状態異常の付与判定（命中側LUK・対象の statusResist を加味）。ボスは耐性が高い */
  *_tryInflict(actor, t, inflict) {
    const resist = (!t.isPlayer && t.def && t.def.statusResist) ? t.def.statusResist : 0;
    const rate = inflict.rate + (((actor.luk || 5) - (t.luk || 5)) * 0.005) - resist;
    if (this.rng.chance(Math.max(0.02, Math.min(0.95, rate)))) {
      if (SES.apply(t, inflict.status)) {
        yield { text: `${t.name}は ${SES.label(inflict.status)}に なった！`, se: 'magic' };
      }
    } else {
      yield { text: `しかし ${t.name}には 効かなかった。` };
    }
  }

  *_useItem(actor, cmd, inventory) {
    const it = this.db.getItem(cmd.itemId);
    if (!it || !inventory.has(cmd.itemId)) { yield { text: 'アイテムが ない！' }; return; }
    inventory.remove(cmd.itemId, 1);
    yield { text: `${actor.name}は ${it.name}を 使った！`, se: 'open' };
    const t = cmd.target || actor;
    const ef = it.effect || {};
    if (ef.revive && t.isDead) { t.curHp = Math.floor(t.maxHp * (ef.revive)); yield { text: `${t.name}が いきをふきかえした！`, se: 'heal' }; }
    if (ef.hp) { t.curHp += ef.hp; yield { text: `${t.name}の HPが ${ef.hp} かいふくした。`, se: 'heal' }; }
    if (ef.mp) { t.curMp += ef.mp; yield { text: `${t.name}の MPが ${ef.mp} かいふくした。`, se: 'heal' }; }
    if (ef.cure) { for (const s of ef.cure) SES.cure(t, s); yield { text: `${t.name}の 状態が もとに もどった。` }; }
    if (ef.inflict && !t.isDead) { yield* this._tryInflict(actor, t, ef.inflict); }
  }

  /** 戦闘結果（勝利時のEXP/Gold/ドロップ） */
  result() {
    if (this.escaped) return { outcome: 'escape' };
    if (this.isLose()) return { outcome: 'lose' };
    let exp = 0, gold = 0; const drops = [];
    for (const e of this.enemies) {
      exp += e.exp; gold += e.gold;
      drops.push(...e.rollDrops(this.rng));
    }
    return { outcome: 'win', exp, gold, drops };
  }
}
