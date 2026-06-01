#!/usr/bin/env node
/* ============================================================
   qa/flow.js : end-to-end state-machine + balance integration test.
   Exercises the REAL transitions (not just jump-around snapshots):
     - boss defeat -> STAGE CLEAR -> next stage advances
     - stage 3 boss defeat -> VICTORY
     - player death -> CONTINUE -> resume, and -> GAME OVER on timeout
     - measures how long a strong loadout needs to kill each boss
       (balance sanity: should be neither instant nor a slog)
   Fails on any console error or broken transition.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { start } = require("../tools/serve.js");

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = "/opt/pw-browsers";
  if (fs.existsSync(base)) {
    const d = fs.readdirSync(base).find((x) => x.startsWith("chromium-") && fs.existsSync(path.join(base, x, "chrome-linux/chrome")));
    if (d) return path.join(base, d, "chrome-linux/chrome");
  }
}

(async () => {
  const srv = await start(0);
  const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox", "--disable-gpu", "--use-gl=swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

  const wait = (ms) => page.waitForTimeout(ms);
  const state = () => page.evaluate(() => window.__NL.state);
  const stageIdx = () => page.evaluate(() => window.__NL.stageIdx);
  const checks = [];
  const assert = (name, cond, extra) => { checks.push({ name, ok: !!cond, extra }); };

  // strong loadout so the boss actually dies under sustained DPS
  async function loadout() {
    await page.evaluate(() => {
      const p = window.NL.game.player;
      p.weapon = "laser"; p.missile = true; p.speedLv = 3; p.applySpeed();
      while (p.options.length < 3) p.addOption();
    });
  }
  // simulate sustained fire at the core until boss dies (or timeout)
  async function killBossByDPS(label) {
    await page.evaluate(() => window.__NL.jumpToBoss());
    await page.waitForFunction(() => window.__NL.bossEntering === false, { timeout: 8000 });
    await loadout();
    const start = Date.now();
    let frames = 0;
    // drive damage deterministically via real shots resolved through collisions
    while (true) {
      const hp = await page.evaluate(() => {
        const g = window.NL.game, b = g.boss;
        if (!b) return null;
        const c = b.core, cp = b.partPos(c);
        // fire a burst of player shots at the core and resolve a few frames
        for (let k = 0; k < 4; k++) window.NL.weapons.spawnShot(cp.x - 40, cp.y + (k - 2) * 6, 34, 0, { r: 6, dmg: 2 });
        return b.hp;
      });
      frames += 1;
      if (hp === null || hp <= 0) break;
      await wait(50);
      if (Date.now() - start > 12000) break;
    }
    const took = ((Date.now() - start) / 1000).toFixed(1);
    await page.waitForFunction(() => ["clear", "victory", "play"].includes(window.__NL.state) || window.__NL.bossHp === null, { timeout: 8000 }).catch(() => {});
    return { took, frames };
  }

  try {
    await page.goto(`http://localhost:${port}/index.html`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__NL_READY === true, { timeout: 15000 });

    // --- full progression: stage0 boss -> clear -> stage1 -> ... -> victory ---
    await page.evaluate(() => window.__NL.start());
    await page.evaluate(() => window.__NL.invincible(true));
    assert("starts in PLAY on stage 0", (await state()) === "play" && (await stageIdx()) === 0);

    // Stage 1 boss
    let b1 = await killBossByDPS("boss1");
    await page.waitForFunction(() => window.__NL.state === "clear", { timeout: 6000 });
    assert("boss1 defeat -> CLEAR", true, b1);
    // CLEAR auto-advances to stage 1
    await page.waitForFunction(() => window.__NL.state === "play" && window.__NL.stageIdx === 1, { timeout: 8000 });
    assert("CLEAR advances to stage 2", (await stageIdx()) === 1);

    // Stage 2 boss
    await page.evaluate(() => window.__NL.invincible(true));
    let b2 = await killBossByDPS("boss2");
    await page.waitForFunction(() => window.__NL.state === "play" && window.__NL.stageIdx === 2, { timeout: 10000 });
    assert("stage 2 clear -> stage 3", (await stageIdx()) === 2, b2);

    // Stage 3 boss -> VICTORY
    await page.evaluate(() => window.__NL.invincible(true));
    let b3 = await killBossByDPS("boss3");
    await page.waitForFunction(() => window.__NL.state === "victory", { timeout: 8000 });
    assert("final boss -> VICTORY", (await state()) === "victory", b3);

    // balance: each boss should take more than ~1s of sustained fire (not trivial)
    assert("boss1 not instant", parseFloat(b1.took) >= 1.0, b1);
    assert("boss2 not instant", parseFloat(b2.took) >= 1.0, b2);
    assert("boss3 not instant", parseFloat(b3.took) >= 1.0, b3);

    // --- continue / game-over flow ---
    await page.evaluate(() => { window.__NL.gotoStage(0); window.__NL.setLives(0); });
    await page.evaluate(() => window.__NL.killPlayer());
    // DEATH (90f) -> afterDeath -> lives -1 -> CONTINUE
    await page.waitForFunction(() => window.__NL.state === "continue", { timeout: 4000 });
    assert("death with 0 lives -> CONTINUE", (await state()) === "continue");
    // press to continue
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__NL.state === "play" && window.__NL.lives === 3, { timeout: 4000 });
    assert("CONTINUE resumes with fresh lives", (await page.evaluate(() => window.__NL.lives)) === 3);

    // let continue countdown expire -> GAME OVER
    await page.evaluate(() => { window.__NL.setLives(0); });
    await page.evaluate(() => window.__NL.killPlayer());
    await page.waitForFunction(() => window.__NL.state === "continue", { timeout: 4000 });
    await page.waitForFunction(() => window.__NL.state === "gameover" || window.__NL.state === "title", { timeout: 12000 });
    assert("CONTINUE timeout -> GAME OVER/title", ["gameover", "title"].includes(await state()));
  } catch (e) {
    assert("no exception", false, e.message);
  }

  await browser.close();
  srv.close();

  console.log("\n===== NOVA LANCE FLOW / BALANCE TEST =====");
  for (const c of checks) console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.extra ? "  " + JSON.stringify(c.extra) : ""}`);
  console.log("console errors:", errors.length);
  errors.forEach((e) => console.log("   !", e));
  const pass = errors.length === 0 && checks.every((c) => c.ok);
  console.log("FLOW PASS:", pass);
  process.exit(pass ? 0 : 1);
})();
