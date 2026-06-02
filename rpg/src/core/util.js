/**
 * core/util.js
 * @layer core
 * 汎用ユーティリティ（数学・グリッド・配列）。副作用なし。
 */
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const approach = (cur, target, step) =>
  cur < target ? Math.min(cur + step, target) : Math.max(cur - step, target);

/** 配列からランダムに1つ（rngは0..1を返す関数） */
export const pick = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length)];

/** 重み付き抽選。entries = [{value, weight}] */
export function weightedPick(entries, rng = Math.random) {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let r = rng() * total;
  for (const e of entries) { if ((r -= e.weight) < 0) return e.value; }
  return entries[entries.length - 1]?.value;
}

/** ミリ秒 → "MM:SS" / "HH:MM" 形式 */
export function formatPlaytime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
               : `${m}:${String(s).padStart(2, '0')}`;
}

/** 浅いディープコピー（JSON安全な構造のみ） */
export const deepClone = (o) => JSON.parse(JSON.stringify(o));

/** sleep（async/awaitのイベント実行で使用） */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
