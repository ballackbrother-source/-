# CLAUDE.md — NOVA LANCE — Burning Skies

Guidance for AI/code agents and contributors working in this repo.

## What this is
A self-contained browser **horizontal shoot-'em-up** (Gradius-style), written in
**vanilla JS + Canvas 2D**, no framework and **no build step**. It runs straight from
`index.html` (works on `file://`) or via the bundled static server.

## Run it
- Play: open `index.html`, or `node tools/serve.js 8080` (or `python3 -m http.server 8080`) then visit `/`.
- Launcher: `start.command` (macOS/Linux) starts the server, opens a browser, and prints a LAN URL for phones.

## QA (always run before considering a change done)
```
node qa/qa.js     # screenshots (qa/shots/), fails on ANY console error, verifies boss & mini-boss take damage, recycle regression
node qa/flow.js   # full state-machine flow: stage clears -> VICTORY, continue/game-over, 1UP extend, boss-kill balance
node qa/gif.js    # records a real playthrough -> demo.gif
```
Headless Chromium is taken from `/opt/pw-browsers` (see `findChrome()` in the qa scripts) since the
Playwright CDN is blocked in the sandbox. The QA must stay at **0 console errors**.

## Architecture (load order matters — classic scripts, global `NL` namespace)
`util → audio → assets → input → effects → weapons → powerup → player → enemies → bosses → stages → ui → game → main`

- **util.js** — math, seeded RNG, `Pool` (object pool with a reset fn), localStorage save/load.
- **audio.js** — Web Audio synth: sequenced chiptune BGM (per-track timbres) + SFX. No files.
- **assets.js** — bakes detailed procedural "mecha-SF" sprites; optionally overrides them with
  AI PNGs listed in `assets/manifest.json` (only when `"generated": true`).
- **input.js** — keyboard / mouse / touch, edge-latched each frame in `poll()`. `virtualPress()` for on-screen buttons.
- **effects.js** — particles, multi-layer explosions, trails, shockwaves, muzzle flashes, shake,
  hit-stop, floating score text. `FX.quality` / `FX.scanlines` are auto-scaled for weak devices; particle count is capped.
- **weapons.js** — pooled projectiles (player shots, homing missiles, enemy bullets) + the laser beam.
- **powerup.js** — Gradius power meter + capsules (incl. the fake-capsule trap).
- **player.js** — ship: movement/banking/afterimage, all weapons, OPTION drones, SHIELD, hitbox marker.
- **enemies.js** — enemy roster (fighter/drone/weaver/turret/mid/carrier), **mini-boss**, and traps
  (ambush/press/debris). `heavy` enemies survive a ram; pooled objects are fully reset on free.
- **bosses.js** — 3 bosses. **Design rule: the core weak point is ALWAYS hittable** — `hitTest`/`laserCast`
  test the core first; armour never occupies/blocks the core's hit region. Don't break this.
- **stages.js** — parallax **landscape-only** backgrounds + scripted spawn timelines (`game.delay`).
- **ui.js** — HUD, power meter, boss/mini-boss bars, title + difficulty menu, pause menu, warnings,
  stage cards, boss WARNING intro, vignette/scanline post.
- **game.js** — state machine, fixed-timestep loop, collisions, scoring + 1UP extends, lives + infinite
  continues, difficulty, the "learn-a-trap → get-warned" system, and `window.__NL` test hooks.
- **main.js** — bootstrap: responsive letterbox scaling, touch UI wiring, loading splash.

## Conventions / gotchas
- Keep everything loadable as **classic scripts** (no ES modules) so `file://` keeps working.
- New enemies: add a baked sprite in `assets.js` (+ `bakeAll`), give `base()` defaults for any new
  flags, and remember the pool reset wipes fields — fully define state in the factory.
- New enemy bullets: use `WP.spawnEnemyBullet` with a valid `"r,g,b"` colour string (a bad colour
  throws in canvas every frame and freezes the loop — the QA now spawns every enemy firing to catch this).
- After any change: run `qa/qa.js` AND `qa/flow.js`; both must pass with 0 console errors.
- `window.__NL` exposes test hooks (start, gotoStage, jumpToBoss, probeBossCore, probeMiniboss, …) — extend it when you add verifiable systems.

## Optional AI art
`tools/generate_assets.py` uses OpenAI **gpt-image-2** (green-screen → chroma-key to transparent PNG;
landscape-only backgrounds), writes `assets/*.png`, and flips `manifest.generated=true`. Needs an API
key with billing + Verified Org and network access to `api.openai.com`. Until then the game runs in
procedural-art mode.
