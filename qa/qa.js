#!/usr/bin/env node
/* ============================================================
   qa/qa.js : headless-Chrome QA for NOVA LANCE.
   - boots the game through a local server
   - captures ALL console output (fails on any console error)
   - screenshots title + each stage + each boss
   - numerically verifies boss CORE hits reduce HP (collision
     validity), via the in-game __NL test hooks
   Output: qa/shots/*.png and a JSON summary to stdout.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { start } = require("../tools/serve.js");

const SHOTS = path.join(__dirname, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = "/opt/pw-browsers";
  if (fs.existsSync(base)) {
    const dir = fs.readdirSync(base).find((d) => d.startsWith("chromium-") && fs.existsSync(path.join(base, d, "chrome-linux/chrome")));
    if (dir) return path.join(base, dir, "chrome-linux/chrome");
  }
  return undefined; // let playwright resolve its own
}

const STAGE_NAMES = ["STAGE1_DAWN", "STAGE2_ASTEROID", "STAGE3_OVERLORD"];

(async () => {
  const srv = await start(0);
  const port = srv.address().port;
  const url = `http://localhost:${port}/index.html`;
  const exe = findChrome();

  const errors = [];
  const logs = [];
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ["--no-sandbox", "--disable-gpu", "--use-gl=swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  page.on("console", (m) => { const t = m.type(); const txt = m.text(); logs.push(`[${t}] ${txt}`); if (t === "error") errors.push(txt); });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

  const report = { consoleErrors: [], shots: [], bossProbes: [], pass: false };

  async function shot(name) { const f = path.join(SHOTS, name + ".png"); await page.screenshot({ path: f }); report.shots.push(name + ".png"); }
  const wait = (ms) => page.waitForTimeout(ms);

  try {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.__NL_READY === true, { timeout: 15000 });
    await wait(700);
    await shot("00_title");

    for (let i = 0; i < 3; i++) {
      // --- gameplay shot (hold FIRE so weapon/muzzle effects are visible) ---
      await page.evaluate((idx) => { window.__NL.gotoStage(idx); window.__NL.invincible(true); }, i);
      await page.keyboard.down("Space");
      await wait(2500); // let waves spawn & effects build
      // throw in a capsule so the power meter shows life
      await page.evaluate(() => window.__NL.addCapsule());
      await wait(900);
      await shot(`${10 + i}_${STAGE_NAMES[i]}_play`);
      await page.keyboard.up("Space");

      // --- boss shot + hit verification ---
      await page.evaluate(() => window.__NL.jumpToBoss());
      // wait for boss to finish its entrance (core is only vulnerable once settled)
      await page.waitForFunction(() => window.__NL.bossHp !== null, { timeout: 8000 });
      await page.waitForFunction(() => window.__NL.bossEntering === false, { timeout: 8000 });
      await wait(800);
      await shot(`${20 + i}_${STAGE_NAMES[i]}_boss`);

      // numeric probe 1: direct core hit-test
      const probe = await page.evaluate(() => window.__NL.probeBossCore(8));
      // numeric probe 2: spawn a real shot at the core and resolve collisions
      const probe2 = await page.evaluate(() => window.__NL.probeShotAtCore());
      const name = await page.evaluate(() => window.__NL.bossName);
      report.bossProbes.push({ stage: i, boss: name, coreHitPart: probe && probe.hitPart, coreDelta: probe && probe.delta, shotDelta: probe2 && probe2.delta });

      // damage flash shot (after probes the boss took damage)
      await wait(200);
      await shot(`${30 + i}_${STAGE_NAMES[i]}_boss_hit`);
    }

    // victory screen
    await page.evaluate(() => { window.__NL.gotoStage(2); window.__NL.jumpToBoss(); });
    await page.waitForFunction(() => window.__NL.bossHp !== null, { timeout: 8000 });
    await page.evaluate(() => window.__NL.killBoss());
    await wait(2600);
    await shot("40_clear_or_victory");
  } catch (e) {
    errors.push("QA_EXCEPTION: " + e.message);
  }

  report.consoleErrors = errors;
  // boss verification: every boss core hit must register damage
  const allCores = report.bossProbes.length === 3;
  const coreHitsOk = report.bossProbes.every((p) => p.coreHitPart === "core" && p.coreDelta > 0 && p.shotDelta > 0);
  report.bossHitVerified = allCores && coreHitsOk;
  report.pass = errors.length === 0 && report.bossHitVerified;

  fs.writeFileSync(path.join(__dirname, "report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(__dirname, "console.log"), logs.join("\n"));

  await browser.close();
  srv.close();

  console.log("\n===== NOVA LANCE QA REPORT =====");
  console.log("console errors :", errors.length);
  if (errors.length) errors.forEach((e) => console.log("   !", e));
  console.log("screenshots    :", report.shots.length, "->", SHOTS);
  console.log("boss probes    :");
  report.bossProbes.forEach((p) => console.log(`   stage${p.stage} ${p.boss}: hitPart=${p.coreHitPart} coreDelta=${p.coreDelta} shotDelta=${p.shotDelta}`));
  console.log("boss hit verified:", report.bossHitVerified);
  console.log("PASS:", report.pass);
  process.exit(report.pass ? 0 : 1);
})();
