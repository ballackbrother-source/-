/**
 * qa/flow.mjs — 統合フロー回帰テスト。
 * 実装済みの全ルートを実機（ヘッドレスChromium）で通し、
 * コンソールエラー0 と 主要なステート遷移を検証する。
 *
 * 実行: cd rpg && npm run qa   （= node qa/flow.mjs）
 * 各テストは独立した browser context（localStorage分離）で走る。
 */
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
if (!process.env.PLAYWRIGHT_BROWSERS_PATH) process.env.PLAYWRIGHT_BROWSERS_PATH = '/opt/pw-browsers';
function loadPlaywright() {
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { return require(p); } catch {} }
  throw new Error('playwright が見つかりません');
}
const { chromium } = loadPlaywright();
const { start } = require('../../tools/serve.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let server, baseURL, browser;
const results = [];
const LOG = path.join(__dirname, 'last-run.log');
const logLine = (s) => { try { fs.appendFileSync(LOG, s + '\n'); } catch {} };

async function main() {
  try { fs.writeFileSync(LOG, `flow.mjs run @ ${new Date().toISOString()}\n`); } catch {}
  server = await start(0);
  baseURL = `http://localhost:${server.address().port}/rpg/`;
  browser = await chromium.launch();

  await test('タイトル起動', testTitle);
  await test('新規ゲーム→プロローグ', testPrologue);
  await test('第1章 仲間＆シオン加入', testCh1Join);
  await test('第2章 裏切り（シオン離脱・章ch3）', testBetrayal);
  await test('枯れ谷ミニボス撃破（レヴナント）', testValeRevenant);
  await test('焚き火の絆（シオン語らい→赦し+5）', testCampfireBond);
  await test('後半TRUEルート（赦し95→連携→撃破）', testBackhalfTrue);
  await test('後半BADルート（拒絶→敗北→リセット）', testBackhalfBad);
  await test('セーブ→リロード→ロード', testSaveLoad);

  await browser.close();
  server.close();

  console.log('\n==== 結果 ====');
  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.msg ? ' — ' + r.msg : ''}`);
    if (!r.ok) failed++;
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

/** 1テスト = 専用context。errors収集。fn(ctx)が真偽 or {ok,msg} を返す */
async function test(name, fn) {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  const h = helpers(page);
  logLine(`START ${name} @ ${new Date().toISOString()}`);
  let res;
  try {
    await page.goto(baseURL, { waitUntil: 'load' });
    await sleep(1500);
    res = await fn(h);
  } catch (e) { res = { ok: false, msg: 'throw: ' + e.message }; }
  await ctx.close();
  const ok = (res === true || (res && res.ok)) && errors.length === 0;
  const msg = [res && res.msg, errors.length ? `${errors.length} console errors: ${errors[0]}` : '']
    .filter(Boolean).join(' / ');
  results.push({ name, ok, msg });
  logLine(`${ok ? 'PASS' : 'FAIL'} ${name}${msg ? ' — ' + msg : ''}`);
  console.log(`  [${ok ? 'ok' : 'NG'}] ${name}${msg ? ' — ' + msg : ''}`);
}

function helpers(page) {
  const press = async (k) => { await page.keyboard.press(k); await sleep(28); };
  const burst = async (n) => { for (let i = 0; i < n; i++) await press('Enter'); };
  const info = () => page.evaluate(() => {
    const g = window.__ETERNIA?.game; const s = g?.scenes?.current;
    return {
      scene: s?.constructor?.name,
      choice: !!(s && s.choiceWin && s.choiceWin.active),
      phase: s?.phase,
      boss: s && s.enemies ? (s.enemies[0] && s.enemies[0].id) : null,
      chapter: g?.state?.chapter?.id,
      order: g?.state?.party?.order?.join(',') ?? '',
      flags: g?.state ? Object.keys(g.state.flags) : [],
      forgiveness: g?.state?.variables?.forgiveness ?? 0,
      cores: g?.state ? (g.state.inventory.items.star_core || 0) : 0,
    };
  });
  // 新規ゲーム開始後、進行中のプロローグ自動イベントを中断する（テスト高速化）
  const newGameAbortPrologue = async () => {
    await press('Enter'); await sleep(250);
    await page.evaluate(() => {
      const s = window.__ETERNIA.game.scenes.current;
      if (s) {
        s.eventRunning = false;
        if (s.interp) s.interp.running = false; // 中断したインタプリタを解放（次イベントが空振りしないように）
        if (s.msgWin) s.msgWin.active = false;
        if (s.choiceWin) s.choiceWin.active = false;
      }
    });
  };
  const evaluate = (fn, arg) => page.evaluate(fn, arg);
  // ボス戦を決定論化：戦闘中の敵HPを1にして1ターンで決着（連携演出は別途unit/liveで検証済み）
  const killEnemies = (broken) => evaluate((br) => {
    const s = window.__ETERNIA.game.scenes.current;
    if (s && s.enemies) s.enemies.forEach((e) => { if (!e.isDead) { if (br) e._broken = true; e.curHp = 1; } });
  }, broken);
  // 条件成立まで一定間隔でEnter送り（フェード等の待ちを越えて演出を確実に進める）
  const pressUntil = async (pred, maxMs = 12000, interval = 160) => {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      const st = await info();
      if (pred(st)) return st;
      await page.keyboard.press('Enter');
      await sleep(interval);
    }
    return info();
  };
  return { page, press, burst, info, newGameAbortPrologue, evaluate, killEnemies, pressUntil };
}

// ─────────── 各テスト ───────────
async function testTitle({ evaluate }) {
  const items = await evaluate(() => window.__ETERNIA?.game?.scenes?.current?.menu?.items?.map((i) => i.value));
  const scene = await evaluate(() => window.__ETERNIA?.game?.scenes?.current?.constructor?.name);
  const ok = scene === 'TitleScene' && items && items.includes('new') && items.includes('trial');
  return { ok, msg: ok ? '' : `scene=${scene} items=${items}` };
}

async function testPrologue({ press, burst, info }) {
  await press('Enter'); await sleep(250);  // はじめから
  await burst(26);                          // プロローグ会話送り
  const st = await info();
  const ok = st.scene === 'FieldScene' && st.flags.includes('p_intro');
  return { ok, msg: ok ? '' : `scene=${st.scene} flags=${st.flags}` };
}

async function testCh1Join({ newGameAbortPrologue, evaluate, info, burst }) {
  await newGameAbortPrologue();
  await evaluate(() => {
    const g = window.__ETERNIA.game;
    g.state.chapter = { id: 'ch1', step: 0 };
    g.scenes.current.loadMap('hafen', 9, 12, 'up');
    g.scenes.current.runAutoruns();
  });
  await sleep(250);
  await burst(48); // 加入会話を送る
  const st = await info();
  const got = st.order.split(',').sort().join(',');
  const ok = got === ['fina', 'garrod', 'lou', 'shion'].join(',');
  return { ok, msg: ok ? '' : `order=${st.order}` };
}

async function testBetrayal({ newGameAbortPrologue, press, info, evaluate, burst, killEnemies, pressUntil }) {
  await newGameAbortPrologue();
  await evaluate(() => {
    const g = window.__ETERNIA.game;
    Object.assign(g.state.flags, { p_intro: 1, ch1_join: 1, verdante_down: 1, ch2_intro: 1, cores4: 1, ruin_enter: 1 });
    g.state.chapter = { id: 'ch2', step: 0 };
    g.state.variables.starcores = 4;
    ['garrod', 'fina', 'shion'].forEach((id) => g.party.addMember(id));
    g.inventory.add('star_core', 1);
    g.state.party.members.forEach((m) => { m.lv = 26; m.exp = 0; m.curHp = -1; m.curMp = -1; });
    g.party.all().forEach((c) => { c.invalidate(); c.ensureVitals(); });
    g.scenes.current.loadMap('ruin', 9, 2, 'up');
  });
  await sleep(250);
  await burst(7);                       // ボス導入 → 戦闘開始
  // ネレイド戦：毎ループ敵HPを1にして1ターンで決着
  for (let i = 0; i < 40; i++) {
    const s = await info();
    if (s.scene !== 'BattleScene') break;
    await killEnemies(false);
    await press('Enter');
  }
  // 裏切り演出（フェード含む）を betrayed 成立まで送る
  const st = await pressUntil((s) => s.flags.includes('betrayed') || s.scene === 'TitleScene', 14000);
  const ok = !st.order.split(',').includes('shion') && st.flags.includes('betrayed') && st.chapter === 'ch3' && st.cores === 0;
  return { ok, msg: ok ? '' : `order=${st.order} ch=${st.chapter} cores=${st.cores} scene=${st.scene}` };
}

// 枯れ谷（任意ダンジョン）：奥のミニボス「嘆きの亡霊」を撃破し vale_clear が立つことを検証
async function testValeRevenant({ newGameAbortPrologue, evaluate, info, press, killEnemies, pressUntil }) {
  await newGameAbortPrologue();
  await evaluate(() => {
    const g = window.__ETERNIA.game;
    Object.assign(g.state.flags, { p_intro: 1, ch1_join: 1, verdante_down: 1, ch2_intro: 1 });
    g.state.chapter = { id: 'ch2', step: 0 };
    ['garrod', 'fina', 'shino'].forEach((id) => g.party.addMember(id));
    g.state.party.members.forEach((m) => { m.lv = 22; m.curHp = -1; m.curMp = -1; });
    g.party.all().forEach((c) => { c.invalidate(); c.ensureVitals(); });
    const s = g.scenes.current;
    s.loadMap('vale', 9, 14, 'up');
    // 奥のミニボス行動イベント（vale_clear 未成立分）を直接発火
    const ev = (s.map.data.events || []).find((e) => e.trigger === 'action' && e.x === 9 && e.y === 1 && e.cond && e.cond.notFlag === 'vale_clear');
    s.runEvent(ev.commands);
  });
  await sleep(300);
  for (let i = 0; i < 8; i++) await press('Enter'); // 戦闘開始まで会話送り
  for (let i = 0; i < 40; i++) {
    const s = await info();
    if (s.scene !== 'BattleScene') break;
    await killEnemies(false);
    await press('Enter');
  }
  const st = await pressUntil((s) => s.flags.includes('vale_clear') || s.scene === 'TitleScene', 12000);
  const ok = st.flags.includes('vale_clear') && st.scene === 'FieldScene';
  return { ok, msg: ok ? '' : `scene=${st.scene} flags=${st.flags}` };
}

// 焚き火の絆ハブ：シオンと語らうと bond_shion が立ち、赦しゲージ +5（伏線提示）
async function testCampfireBond({ newGameAbortPrologue, evaluate, info, press, pressUntil }) {
  await newGameAbortPrologue();
  await evaluate(() => {
    const g = window.__ETERNIA.game;
    Object.assign(g.state.flags, { p_intro: 1, ch1_join: 1, verdante_down: 1, ch2_intro: 1 });
    g.state.chapter = { id: 'ch2', step: 0 };
    ['garrod', 'fina', 'shion'].forEach((id) => g.party.addMember(id));
    g.state.variables.forgiveness = 0;
    const s = g.scenes.current;
    s.loadMap('hafen', 16, 8, 'up');
    const npc = (s.map.data.npcs || []).find((n) => n.id === 'campfire');
    const page = npc.pages.find((p) => p.conditions && p.conditions.flag === 'ch2_intro' && p.conditions.notFlag === 'betrayed');
    s.runEvent(page.commands);
  });
  await sleep(250);
  // 導入文を送り「誰と話す?」の選択肢が開くまで待つ
  for (let i = 0; i < 12; i++) { const s = await info(); if (s.choice) break; await press('Enter'); await sleep(60); }
  for (let i = 0; i < 3; i++) await press('ArrowDown'); // ガロード→フィーナ→シノ→シオン
  await press('Enter'); await sleep(120);
  // シオンの語らい（複数ページ）を送り、bond_shion 成立まで待つ
  const st = await pressUntil((s) => s.flags.includes('bond_shion'), 10000);
  const ok = st.flags.includes('bond_shion') && st.forgiveness === 5;
  return { ok, msg: ok ? '' : `flags=${st.flags} f=${st.forgiveness}` };
}

async function backhalfSetup(evaluate) {
  await evaluate(() => {
    const g = window.__ETERNIA.game;
    Object.assign(g.state.flags, { p_intro: 1, ch1_join: 1, verdante_down: 1, ch2_intro: 1, cores4: 1, betrayed: 1, ch3_seen: 1, regrouped: 1, bond_fina: 1, bond_shion: 1 });
    g.state.chapter = { id: 'ch4', step: 0 };
    ['garrod', 'fina'].forEach((id) => g.party.addMember(id));
    g.party.all().forEach((c) => c.ensureVitals());
    const s = g.scenes.current; s.loadMap('shrine', 9, 10, 'up'); s.runAutoruns();
  });
  await sleep(350);
}

/**
 * 後半クライマックスの自動進行。pickIndex=赦しの選択、winAldia=神を倒す(True/Normal)か否か(Bad)。
 * ボス戦は決定論化：シオン戦は必ず撃破、アルディア戦は winAldia なら不死を砕いて撃破、
 * そうでなければ放置して時間切れ全滅（Bad）。
 */
async function driveBackhalf({ press, info, killEnemies }, pickIndex, winAldia) {
  for (let g = 0; g < 320; g++) {
    const st = await info();
    // s_final（エンディング確定）／エンディング画面に達したら成功として停止（連打で突き抜けない）
    if ((st.flags && st.flags.includes('s_final')) || st.scene === 'EndingScene' || st.scene === 'TitleScene') return st;
    if (st.scene === 'BattleScene') {
      if (st.boss === 'SHION_BOSS') { await killEnemies(false); await press('Enter'); }
      else if (st.boss === 'ALDIA') {
        if (winAldia) { await killEnemies(true); await press('Enter'); }  // 不死を砕いて撃破
        else { for (let k = 0; k < 6; k++) await press('Enter'); }        // 放置→時間切れ全滅
      } else { await press('Enter'); }
    } else if (st.choice) {
      for (let i = 0; i < pickIndex; i++) await press('ArrowDown');
      await press('Enter');
    } else {
      await press('Enter');                                              // 会話送り
    }
  }
  return await info();
}

async function testBackhalfTrue(h) {
  await h.newGameAbortPrologue();
  await backhalfSetup(h.evaluate);
  const st = await driveBackhalf(h, 2, true);   // 理由を聞く＋連携
  const reached = (st.flags && st.flags.includes('s_final')) || st.scene === 'EndingScene' || st.scene === 'TitleScene';
  const ok = reached && st.forgiveness >= 90;
  return { ok, msg: ok ? '' : `scene=${st.scene} f=${st.forgiveness} final=${st.flags && st.flags.includes('s_final')}` };
}

async function testBackhalfBad(h) {
  await h.newGameAbortPrologue();
  await backhalfSetup(h.evaluate);
  const st = await driveBackhalf(h, 0, false);  // 許さない＋連携なし
  const reached = (st.flags && st.flags.includes('s_final')) || st.scene === 'EndingScene' || st.scene === 'TitleScene';
  const ok = reached && st.forgiveness < 60;
  return { ok, msg: ok ? '' : `scene=${st.scene} f=${st.forgiveness} final=${st.flags && st.flags.includes('s_final')}` };
}

async function testSaveLoad({ press, burst, evaluate, page }) {
  await press('Enter'); await sleep(250);
  await burst(26);                                     // プロローグ完了
  await evaluate(() => { window.__ETERNIA.game.state.party.gold = 777; });
  await press('c'); await sleep(200);                  // メニュー
  // 「セーブ」項目までカーソルを送る（メニュー構成の変更に強い）
  for (let i = 0; i < 12; i++) {
    const v = await evaluate(() => window.__ETERNIA.game.scenes.current.root?.current?.value);
    if (v === 'save') break;
    await press('ArrowDown');
  }
  await press('Enter'); await sleep(200);
  await press('Enter'); await sleep(300);              // slot1 保存
  const saved = await evaluate(() => !!localStorage.getItem('eternia.save.slot1'));
  await page.reload({ waitUntil: 'load' }); await sleep(1500);
  await press('ArrowDown'); await sleep(120);          // つづきから
  await press('Enter'); await sleep(200);
  await press('ArrowDown'); await sleep(120);          // slot0(auto)→slot1
  await press('Enter'); await sleep(450);              // ロード
  const st = await evaluate(() => ({ gold: window.__ETERNIA.game.state?.party?.gold, scene: window.__ETERNIA.game.scenes.current?.constructor?.name }));
  const ok = saved && st.gold === 777 && st.scene === 'FieldScene';
  return { ok, msg: ok ? '' : `saved=${saved} gold=${st.gold} scene=${st.scene}` };
}

main().catch((e) => { console.error(e); process.exit(1); });
