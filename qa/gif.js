#!/usr/bin/env node
/* qa/gif.js : capture a gameplay clip as PNG frames for the demo GIF.
   Drives real input (move + fire), grabs frames across title ->
   stage 1 action -> boss, then hands the frames to make_gif.py. */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");
const { start } = require("../tools/serve.js");

const FRAMES = path.join(__dirname, "frames");
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = "/opt/pw-browsers";
  if (fs.existsSync(base)) {
    const dir = fs.readdirSync(base).find((d) => d.startsWith("chromium-") && fs.existsSync(path.join(base, d, "chrome-linux/chrome")));
    if (dir) return path.join(base, dir, "chrome-linux/chrome");
  }
}

(async () => {
  const srv = await start(0);
  const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ["--no-sandbox", "--disable-gpu", "--use-gl=swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://localhost:${port}/index.html`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__NL_READY === true, { timeout: 15000 });

  let n = 0;
  const grab = async () => { await page.screenshot({ path: path.join(FRAMES, String(n).padStart(3, "0") + ".png") }); n++; };
  const wait = (ms) => page.waitForTimeout(ms);

  // title beat
  await wait(400); await grab(); await grab();

  // start + stage 1, give powerful loadout for a flashy demo
  await page.evaluate(() => { window.__NL.start(); });
  await page.evaluate(() => { window.__NL.gotoStage(0); window.__NL.invincible(true); });
  // build a nice loadout: spread + missiles + options + speed
  await page.evaluate(() => {
    const g = window.NL.game, p = g.player;
    p.weapon = "spread"; p.missile = true; p.speedLv = 2; p.applySpeed();
    p.addOption(); p.addOption(); p.shield = 3; p.shieldMax = 3;
  });
  await page.keyboard.down("Space");

  // weave the ship while capturing stage action
  const moves = ["ArrowUp", "ArrowDown", "ArrowUp", "ArrowDown"];
  for (let k = 0; k < 26; k++) {
    if (k % 6 === 0) { await page.keyboard.down(moves[(k / 6) % moves.length]); }
    if (k % 6 === 3) { await page.keyboard.up(moves[Math.floor(k / 6) % moves.length]); }
    await wait(90); await grab();
  }
  // switch to laser for variety
  await page.evaluate(() => { window.NL.game.player.weapon = "laser"; });
  for (let k = 0; k < 8; k++) { await wait(90); await grab(); }

  // boss encounter
  await page.evaluate(() => window.__NL.jumpToBoss());
  await page.waitForFunction(() => window.__NL.bossEntering === false, { timeout: 8000 });
  for (let k = 0; k < 22; k++) {
    if (k === 6) await page.evaluate(() => { window.NL.game.player.weapon = "spread"; });
    await wait(95); await grab();
  }
  await page.keyboard.up("Space");

  await browser.close();
  srv.close();
  console.log("captured", n, "frames ->", FRAMES);

  // assemble GIF
  execFileSync("python3", [path.join(__dirname, "make_gif.py"), FRAMES, path.join(__dirname, "..", "demo.gif")], { stdio: "inherit" });
})();
