/**
 * domain/systems/StatusEffectSystem.js
 * @layer domain
 * 状態異常の付与・解除・毎ターン処理（§05-3）。純粋ロジック寄り（対象をmutate）。
 */
import { STATUS } from '../../config/constants.js';

const DEFS = {
  [STATUS.POISON]:   { name: 'どく',  turns: 5 },
  [STATUS.SLEEP]:    { name: 'ねむり', turns: 3 },
  [STATUS.PARALYZE]: { name: 'まひ',  turns: 3 },
  [STATUS.SILENCE]:  { name: 'ちんもく', turns: 3 },
  [STATUS.CONFUSE]:  { name: 'こんらん', turns: 3 },
  [STATUS.BLIND]:    { name: 'くらやみ', turns: 4 },
};

export const StatusEffectSystem = {
  label(id) { return DEFS[id]?.name ?? id; },

  has(actor, id) { return actor.statusEffects.some((s) => s.id === id); },

  /** 付与（成功率は呼び出し側で判定済みの想定。重複は上書き） */
  apply(actor, id) {
    const d = DEFS[id]; if (!d) return false;
    const exist = actor.statusEffects.find((s) => s.id === id);
    if (exist) { exist.turns = d.turns; return false; }
    actor.statusEffects.push({ id, turns: d.turns });
    return true;
  },

  cure(actor, id) {
    actor.statusEffects = actor.statusEffects.filter((s) => s.id !== id);
  },
  cureAll(actor) { actor.statusEffects = []; },

  /** 行動可能か（まひ/ねむりで阻害） */
  canAct(actor, rng) {
    if (this.has(actor, STATUS.SLEEP)) return false;
    if (this.has(actor, STATUS.PARALYZE)) return rng.chance(0.5);
    return true;
  },

  /** ターン終了時処理。毒ダメージ・効果ターン減少。ログ配列を返す */
  tickTurnEnd(actor, log) {
    if (actor.isDead) return;
    if (this.has(actor, STATUS.POISON)) {
      const dmg = Math.max(1, Math.floor(actor.maxHp / 16));
      actor.curHp -= dmg;
      log.push(`${actor.name}は どくで ${dmg}の ダメージ！`);
    }
    for (const s of actor.statusEffects) s.turns--;
    const expired = actor.statusEffects.filter((s) => s.turns <= 0);
    actor.statusEffects = actor.statusEffects.filter((s) => s.turns > 0);
    for (const e of expired) log.push(`${actor.name}の ${this.label(e.id)}が 治った。`);
  },

  /** 被物理ダメージでねむり解除 */
  wakeOnHit(actor, log) {
    if (this.has(actor, STATUS.SLEEP)) {
      this.cure(actor, STATUS.SLEEP);
      log.push(`${actor.name}は 目を覚ました！`);
    }
  },
};
