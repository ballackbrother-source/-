/**
 * domain/systems/EnemyAI.js
 * @layer domain
 * 敵の行動決定（§07-4）。行動テーブル（重み付き）から選ぶ。
 * HP割合でパターンを切替（通常 / ピンチ）。
 */
import { weightedPick } from '../../core/util.js';

/**
 * @returns {{ type:'attack'|'skill', skillId?, targetSide:'players' }}
 */
export function decideEnemyAction(enemy, rng) {
  const hpRatio = enemy.curHp / enemy.maxHp;
  const table = enemy.def.ai || [{ type: 'attack', weight: 1 }];
  // ピンチ時(HP<=33%)は cond:'low' の行動を優先採用
  const pool = table.filter((a) => !a.cond || (a.cond === 'low' && hpRatio <= 0.33) || a.cond === 'always');
  const usable = (pool.length ? pool : table).map((a) => ({ value: a, weight: a.weight ?? 1 }));
  const choice = weightedPick(usable, () => rng.next());
  return choice;
}

export const EnemyAI = { decide: decideEnemyAction };
