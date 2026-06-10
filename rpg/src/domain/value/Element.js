/**
 * domain/value/Element.js
 * @layer domain
 * 属性相性の判定（§05-2）。純粋関数。Canvas非依存。
 * defender.affinity = { weak:[], resist:[], absorb:[], null:[] }
 */
import { ELEM_MULT } from '../../config/constants.js';

/** 攻撃属性 attackElem に対する防御側の倍率を返す */
export function elementMultiplier(attackElem, affinity) {
  if (!attackElem || attackElem === 'none' || !affinity) return ELEM_MULT.NORMAL;
  if (affinity.absorb?.includes(attackElem)) return ELEM_MULT.ABSORB;
  if (affinity.null?.includes(attackElem))   return ELEM_MULT.NULL;
  if (affinity.resist?.includes(attackElem)) return ELEM_MULT.HALF;
  if (affinity.weak?.includes(attackElem))   return ELEM_MULT.WEAK;
  return ELEM_MULT.NORMAL;
}
