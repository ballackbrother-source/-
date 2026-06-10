/**
 * qa/play.mjs — ヘッドレス通しプレイ検証。
 * タイトル→新規開始→プロローグ→移動→戦闘→メニューを自動操作し、
 * コンソールエラー/ページ例外が 0 であることを確認、スクリーンショットを保存。
 *
 * 実行: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers NODE_PATH=/opt/node22/lib/node_modules node rpg/qa/play.mjs
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
const require = createRequire(import.meta.url);

// サンドボックスではPlaywright/Chromiumが固定パスにある（STFのqaと同方針）
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
function loadPlaywright() {
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try { return require(p); } catch {}
  }
  throw new Error('playwright が見つかりません');
}
const { chromium } = loadPlaywright();
const { start } = require('../../tools/serve.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const errors = [];

(async () => {
  const srv = await start(0);
  const port = srv.address().port;
  const url = `http://localhost:${port}/rpg/`;
  console.log('serving', url);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });

  page.on('console', (m) => { if (m.type() === 'error') { errors.push('[console] ' + m.text()); console.log('CONSOLE ERROR:', m.text()); } });
  page.on('pageerror', (e) => { errors.push('[pageerror] ' + e.message); console.log('PAGE ERROR:', e.message); });

  await page.goto(url, { waitUntil: 'load' });
  await sleep(1800); // Boot: データ/アセット読込
  await shot(page, '01_title');

  // はじめから（先頭項目）を選んで新規開始 → プロローグ会話を送る
  for (let i = 0; i < 24; i++) { await page.keyboard.press('Enter'); await sleep(160); }
  await shot(page, '02_after_prologue_intro');

  // 南へ移動 → 森へ → チュートリアル戦闘トリガー
  await page.keyboard.down('ArrowDown');
  await sleep(2600);
  await page.keyboard.up('ArrowDown');
  await sleep(400);
  await shot(page, '03_moved');

  // 戦闘になっていれば 決定連打で自動的に たたかう→対象→実行 を繰り返し勝利
  for (let i = 0; i < 40; i++) { await page.keyboard.press('Enter'); await sleep(140); }
  await shot(page, '04_after_battle');

  // メニュー開閉
  await page.keyboard.press('c'); await sleep(300);
  await shot(page, '05_menu');
  await page.keyboard.press('ArrowDown'); await sleep(150);
  await page.keyboard.press('Escape'); await sleep(300);

  // さらに少し歩く（移動・エンカウントの追加検証）
  await page.keyboard.down('ArrowDown'); await sleep(1500); await page.keyboard.up('ArrowDown');
  for (let i = 0; i < 20; i++) { await page.keyboard.press('Enter'); await sleep(120); }
  await shot(page, '06_explore');

  // 状態ダンプ（進行を確認）
  const stateInfo = await page.evaluate(() => {
    const g = window.__ETERNIA?.game;
    if (!g || !g.state) return null;
    return {
      chapter: g.state.chapter,
      map: g.state.location.mapId,
      gold: g.state.party.gold,
      party: g.state.party.order,
      flags: Object.keys(g.state.flags),
      scene: g.scenes.current?.constructor?.name,
    };
  });
  console.log('STATE:', JSON.stringify(stateInfo));

  await browser.close();
  srv.close();

  console.log('---');
  if (errors.length) { console.log(`FAIL: ${errors.length} 件のエラー`); errors.forEach((e) => console.log(' -', e)); process.exit(1); }
  console.log('PASS: コンソールエラー 0 件');
})().catch((e) => { console.error(e); process.exit(1); });

async function shot(page, name) {
  await page.screenshot({ path: path.join(__dirname, 'shots', name + '.png') });
}
