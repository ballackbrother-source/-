/**
 * domain/systems/DexRewards.js
 * @layer domain
 * 図鑑（モンスター/アイテム）の達成率マイルストーン報酬。
 * 戦闘後・図鑑を開いた時に checkDexRewards(game) を呼び、未獲得の報酬を付与する。
 * 獲得済みは GameState.flags に記録して二重付与を防ぐ。
 */
const REWARDS = [
  { flag: 'dex_mon50',  kind: 'monster', pct: 0.5, gold: 200, items: [['hi_herb', 2]], msg: 'モンスター図鑑 50%達成！' },
  { flag: 'dex_mon100', kind: 'monster', pct: 1.0, gold: 0,   items: [['power_seed', 1]], title: '魔物博士', msg: 'モンスター図鑑 コンプリート！' },
  { flag: 'dex_item50', kind: 'item',    pct: 0.5, gold: 200, items: [['magic_water', 3]], msg: 'アイテム図鑑 50%達成！' },
  { flag: 'dex_item100',kind: 'item',    pct: 1.0, gold: 0,   items: [['guard_seed', 1]], title: '収集家', msg: 'アイテム図鑑 コンプリート！' },
];

/** @returns {string[]} 付与した報酬の通知メッセージ */
export function checkDexRewards(game) {
  const st = game.state, db = game.db;
  const monTotal = Object.keys(db.monsters).length;
  const monDone = (st.bestiary.defeated || []).length;
  const itemTotal = Object.keys(db.items).length;
  const itemDone = (st.bestiary.items || []).length;
  const granted = [];
  for (const r of REWARDS) {
    if (st.flags[r.flag]) continue;
    const pct = r.kind === 'monster' ? monDone / monTotal : itemDone / itemTotal;
    if (pct < r.pct) continue;
    st.flags[r.flag] = true;
    if (r.gold) game.party.gainGold(r.gold);
    for (const [id, n] of (r.items || [])) game.inventory.add(id, n);
    if (r.title) { (st.titles ||= []).push(r.title); }
    granted.push(r.msg + (r.title ? `／称号「${r.title}」獲得！` : ''));
  }
  return granted;
}
