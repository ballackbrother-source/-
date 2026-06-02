/**
 * domain/systems/DamageFormula.js
 * @layer domain
 * ダメージ・命中・回復の計算式（§05-1）。純粋関数。rngを引数で受け取る。
 */
import { elementMultiplier } from '../value/Element.js';
import { ELEM_MULT } from '../../config/constants.js';

/** 命中判定 */
export function hitCheck(attacker, defender, baseHit, rng) {
  const hit = Math.max(20, Math.min(99, baseHit - defender.eva));
  return rng.int(0, 99) < hit;
}

/**
 * 物理ダメージ。opts: { element, power(倍率,既定1), ignoreDefRate, canCrit }
 * @returns {{ value, crit, mult }}
 */
export function physical(attacker, defender, opts, rng) {
  const element = opts.element ?? attacker.weaponElement ?? 'none';
  const power = opts.power ?? 1.0;
  let def = defender.def_;
  let crit = false;
  if (opts.canCrit !== false && rng.int(0, 99) < (attacker.crit || 0)) { crit = true; def *= 0.5; }

  let base = attacker.atk * 2 - def;
  base *= power;
  const mult = elementMultiplier(element, defender.affinity);
  let dmg = base * mult * rng.float(0.9, 1.1) * (crit ? 2.0 : 1.0);

  return finalize(dmg, mult, crit);
}

/** 魔法ダメージ。opts: { element, power(威力倍率) } */
export function magic(attacker, defender, opts, rng) {
  const element = opts.element ?? 'none';
  const power = opts.power ?? 2.5;
  let base = attacker.mat * power - defender.mdf;
  const mult = elementMultiplier(element, defender.affinity);
  let dmg = base * mult * rng.float(0.9, 1.1);
  return finalize(dmg, mult, false);
}

/** 回復量 */
export function heal(caster, power, rng) {
  return Math.max(1, Math.floor(caster.mat * 0.5 + power) * rng.float(0.95, 1.05) | 0);
}

function finalize(dmg, mult, crit) {
  if (mult === ELEM_MULT.NULL) return { value: 0, crit: false, mult, nullified: true };
  if (mult < 0) { // 吸収（負ダメージ＝回復）
    return { value: Math.max(1, Math.floor(Math.abs(dmg))), crit: false, mult, absorbed: true };
  }
  return { value: Math.max(1, Math.floor(dmg)), crit: !!crit, mult };
}

export const DamageFormula = { hitCheck, physical, magic, heal };
