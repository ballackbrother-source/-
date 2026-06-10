/**
 * domain/systems/LevelSystem.js
 * @layer domain
 * 経験値曲線・レベルアップ・スキル習得（§04-1, §04-4）。純粋ロジック。
 */
const MAX_LV = 70;

/** 次のレベルまでに必要なEXP（§04-1の曲線） */
export function needExp(lv) {
  return Math.floor(12 * Math.pow(lv, 2.3) + 8 * lv);
}

/** Lv1からlvまでの累計必要EXP */
export function totalExpFor(lv) {
  let t = 0;
  for (let i = 1; i < lv; i++) t += needExp(i);
  return t;
}

/**
 * EXPを加算し、必要に応じて連続レベルアップさせる。
 * @returns {Array} レベルアップ結果 [{ from, to, gains, learned[] }]
 */
export function gainExp(character, amount, db) {
  const m = character.member;
  m.exp += amount;
  const results = [];
  while (m.lv < MAX_LV) {
    const need = totalExpFor(m.lv + 1);
    if (m.exp < need) break;
    const before = snapshot(character);
    m.lv += 1;
    character.invalidate();
    const after = snapshot(character);
    const learned = learnSkillsForLevel(character, db);
    results.push({
      name: character.name, from: m.lv - 1, to: m.lv,
      gains: diff(before, after), learned,
    });
  }
  // レベルアップ時はHP/MP全回復（王道仕様）
  if (results.length) { character.curHp = character.maxHp; character.curMp = character.maxMp; }
  return results;
}

function snapshot(c) {
  return { maxHp: c.maxHp, maxMp: c.maxMp, atk: c.atk, def: c.def_, mat: c.mat, mdf: c.mdf, agi: c.agi };
}
function diff(a, b) {
  const o = {}; for (const k of Object.keys(a)) o[k] = b[k] - a[k]; return o;
}

/** classes.json の習得テーブルに従い、現在Lvで覚えるスキルを習得 */
function learnSkillsForLevel(character, db) {
  const cls = db.getClass(character.member.jobId);
  if (!cls || !cls.learn) return [];
  const learned = [];
  for (const entry of cls.learn) {
    if (entry.lv === character.lv && !character.knows(entry.skill)) {
      character.learn(entry.skill);
      learned.push(entry.skill);
    }
  }
  return learned;
}

export const LevelSystem = { needExp, totalExpFor, gainExp, MAX_LV };
