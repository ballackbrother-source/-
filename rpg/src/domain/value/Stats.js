/**
 * domain/value/Stats.js
 * @layer domain
 * ステータス算出（§04-2）。基礎値＋レベル成長＋装備補正から二次パラメータを導く。
 * 純粋関数。db(不変データ)を引数で受け取り、副作用を持たない。
 */
const PRIMARY = ['str', 'vit', 'agi', 'dex', 'int', 'spi', 'luk'];

/** 装備の合計補正を集計（武器/防具/装飾の bonus を加算、属性耐性を統合） */
function aggregateEquip(member, db) {
  const acc = { atk: 0, def: 0, mat: 0, mdf: 0, hpc: 0, mpc: 0, critBonus: 0 };
  for (const k of PRIMARY) acc[k] = 0;
  const affinity = { weak: [], resist: [], absorb: [], null: [] };
  let weaponElement = 'none';
  for (const slot of Object.keys(member.equip || {})) {
    const itemId = member.equip[slot];
    if (!itemId) continue;
    const it = db.getItem(itemId);
    if (!it) continue;
    const b = it.bonus || {};
    acc.atk += b.atk || 0; acc.def += b.def || 0;
    acc.mat += b.mat || 0; acc.mdf += b.mdf || 0;
    acc.hpc += b.hp || 0;  acc.mpc += b.mp || 0;
    for (const k of PRIMARY) acc[k] += b[k] || 0;
    if (slot === 'weapon') {
      weaponElement = (member.imbueById && member.imbueById[itemId]) || it.element || 'none';
      const mei = member.meiById && member.meiById[itemId];
      if (mei === 'crit') acc.critBonus += 15; // 銘・会心
    }
    if (it.resist) affinity.resist.push(...it.resist);
    // 装備強化（+N）：武器は攻/魔攻、防具は守/魔守を1レベルごとに加算
    const enh = (member.enhById && member.enhById[itemId]) || 0;
    if (enh > 0) {
      const inc = (base) => Math.max(1, Math.round((base || 0) * 0.18));
      if (it.type === 'weapon') { acc.atk += inc(b.atk) * enh; if (b.mat) acc.mat += inc(b.mat) * enh; }
      else { if (b.def) acc.def += inc(b.def) * enh; if (b.mdf) acc.mdf += inc(b.mdf) * enh; }
    }
  }
  return { acc, affinity, weaponElement };
}

/** 装備強化の1レベルあたり上昇量（UI表示用） */
export function enhIncrement(base) { return Math.max(1, Math.round((base || 0) * 0.18)); }

/** メンバーの全ステータスを計算して返す */
export function computeStats(member, db) {
  const def = db.getCharacter(member.id);
  const lv = member.lv;
  const { acc, affinity, weaponElement } = aggregateEquip(member, db);
  const bonus = member.bonusStats || {}; // 種などによる永続ボーナス

  // 一次ステ：基礎 + 成長*(lv-1) + 装備補正 + 永続ボーナス
  const p = {};
  for (const k of PRIMARY) {
    p[k] = Math.round((def.base[k] || 0) + (def.growth[k] || 0) * (lv - 1) + acc[k] + (bonus[k] || 0));
  }

  const baseHp = def.base.hp || 0, baseMp = def.base.mp || 0;
  const grHp = (def.growth.hp || 0) * (lv - 1), grMp = (def.growth.mp || 0) * (lv - 1);

  const maxHp = Math.round(baseHp + grHp + p.vit * 4 + lv * 3 + acc.hpc + (bonus.hp || 0));
  const maxMp = Math.round(baseMp + grMp + p.spi * 3 + lv * 2 + acc.mpc + (bonus.mp || 0));

  return {
    ...p,
    maxHp, maxMp,
    atk: Math.round(p.str * 2 + acc.atk),
    def: Math.round(p.vit * 1.5 + acc.def),
    mat: Math.round(p.int * 2 + acc.mat),
    mdf: Math.round(p.spi * 1.5 + acc.mdf),
    eva: Math.min(60, p.agi * 0.4 + p.luk * 0.1),
    crit: 3 + p.dex * 0.1 + p.luk * 0.2 + (acc.critBonus || 0),
    weaponElement,
    affinity,
  };
}
