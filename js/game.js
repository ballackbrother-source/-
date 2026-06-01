/* ============================================================
   game.js : state machine, main loop, collisions, scoring,
   stage flow, lives + infinite continues, the "learn a trap ->
   get warned next time" system, and test hooks for QA.
   ============================================================ */
(function () {
  "use strict";
  const NL = window.NL;
  const U = NL.util;
  const FX = NL.fx;
  const WP = NL.weapons;
  const E = NL.enemies;

  const STATE = { TITLE: "title", PLAY: "play", DEATH: "death", CLEAR: "clear", CONTINUE: "continue", GAMEOVER: "gameover", VICTORY: "victory", PAUSE: "pause" };

  const G = {
    state: STATE.TITLE,
    frame: 0,
    score: 0, hiScore: 0,
    lives: 3,
    stageIdx: 0,
    stageTimer: 0,
    scroll: 0, scrollSpeed: 3,
    boss: null,
    player: null,
    schedule: [],
    toastText: "", toastTimer: 0,
    warnText: "", warnTimer: 0,
    stageName: "",
    bg: null,
    learned: {},
    flagsThisStage: {},
    deathTimer: 0,
    clearTimer: 0,
    continueCount: 0, continueTimer: 0,
    bossDefeatedFlag: false,
    input: NL.input,
    paused: false
  };
  NL.game = G;

  G.init = function (canvas) {
    G.canvas = canvas;
    G.ctx = canvas.getContext("2d");
    G.player = new NL.Player();
    const save = U.load();
    G.hiScore = save.hi || 0;
    G.learned = save.learned || {};
    G.bg = NL.stages.list[0].bg();
    G.state = STATE.TITLE;
    NL.audio.playMusic("title");
  };

  // ---- scheduling (frames relative to "now") ----
  G.delay = function (frames, fn) { G.schedule.push({ at: G.frame + frames, fn }); };
  function runSchedule() {
    if (!G.schedule.length) return;
    const keep = [];
    for (const s of G.schedule) { if (G.frame >= s.at) { try { s.fn(); } catch (e) { console.error(e); } } else keep.push(s); }
    G.schedule = keep;
  }

  // ---- toasts / warnings ----
  G.toast = function (s) { G.toastText = s; G.toastTimer = 90; };
  G.learn = function (id) { if (!G.learned[id]) { G.learned[id] = true; persist(); } };
  G.warnIfLearned = function (id, text) { if (G.learned[id]) { G.warnText = text; G.warnTimer = 110; NL.audio.sfx.warn(); } };

  function persist() { U.save({ hi: G.hiScore, learned: G.learned }); }

  G.addScore = function (n) { G.score += n; if (G.score > G.hiScore) { G.hiScore = G.score; } };

  // ---- drops ----
  G.maybeDrop = function (e) {
    if (e.dropAlways) { NL.powerups.spawn(e.x, e.y, false); return; }
    // frequent early drops so the arsenal varies fast
    const early = G.stageTimer < 1800;
    const p = early ? 0.22 : 0.12;
    if (U.chance(p)) NL.powerups.spawn(e.x, e.y, false);
  };

  // ---- queries used by weapons / AI ----
  G.nearestEnemy = function (x, y) {
    let best = null, bd = Infinity;
    E.pool.forEach((e) => { if (!e.hittable || e.invincible) return; const d = U.dist2(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; } });
    if (G.boss && !G.boss.entering && !G.boss.dead) { const c = G.boss.core; if (c) { const cp = G.boss.partPos(c); const d = U.dist2(x, y, cp.x, cp.y); if (d < bd) best = { x: cp.x, y: cp.y, _dead: false, hp: 1 }; } }
    return best;
  };

  // laser: find nearest obstacle along horizontal beam from (x0,y)
  function findLaserHit(x0, y) {
    let hx = NL.W + 20, obj = null, kind = null, part = null;
    E.pool.forEach((e) => {
      if (!e.hittable) return;
      if (Math.abs(e.y - y) <= e.r && e.x >= x0) {
        const dx = Math.sqrt(Math.max(0, e.r * e.r - (e.y - y) * (e.y - y)));
        const ex = e.x - dx;
        if (ex < hx) { hx = ex; obj = e; kind = "enemy"; }
      }
    });
    if (G.boss && !G.boss.entering && !G.boss.dead) {
      const bx = G.boss.laserCast(x0, y);
      if (bx != null && bx < hx) { hx = bx; obj = G.boss; kind = "boss"; }
    }
    return { hx: obj ? hx : null, obj, kind };
  }
  G.laserCast = function (x0, y) { return findLaserHit(x0, y).hx; };

  // ---- collisions ----
  function collisions() {
    const pl = G.player;

    // player shots vs enemies + boss
    WP.playerShots.forEach((b) => {
      // enemies
      let hit = false;
      E.pool.forEach((e) => {
        if (hit || !e.hittable) return;
        if (U.circleHit(b.x, b.y, b.r, e.x, e.y, e.r)) {
          const consumed = E.damage(e, b.dmg, G);
          FX.spark(b.x, b.y, 3, "255,230,180", 3);
          if (consumed) { if (b.pierce > 0) b.pierce--; else { b._dead = true; hit = true; } }
        }
      });
      if (hit) return;
      // boss
      if (G.boss && !G.boss.dead) {
        const part = G.boss.hitTest(b.x, b.y, b.r);
        if (part) { G.boss.damagePart(part, b.dmg, G); FX.spark(b.x, b.y, 3, "255,230,180", 3); if (b.pierce > 0) b.pierce--; else b._dead = true; }
      }
    });

    // missiles vs enemies + boss
    WP.missiles.forEach((m) => {
      let hit = false;
      E.pool.forEach((e) => { if (hit || !e.hittable) return; if (U.circleHit(m.x, m.y, m.r, e.x, e.y, e.r)) { E.damage(e, m.dmg, G); FX.explode(m.x, m.y, 0.7); m._dead = true; hit = true; } });
      if (hit) return;
      if (G.boss && !G.boss.dead) { const part = G.boss.hitTest(m.x, m.y, m.r); if (part) { G.boss.damagePart(part, m.dmg, G); FX.explode(m.x, m.y, 0.7); m._dead = true; } }
    });

    // laser continuous damage
    if (pl.alive && pl.laserActive) {
      const beams = [{ x: pl._laserX, y: pl._laserY }].concat((pl._optionLasers || []).map((o) => ({ x: o.x, y: o.y })));
      if (G.frame % 3 === 0) {
        for (const beam of beams) {
          const r = findLaserHit(beam.x, beam.y);
          if (r.obj) {
            if (r.kind === "enemy") E.damage(r.obj, 1, G);
            else if (G.boss) { const part = G.boss.hitTest(r.hx, beam.y, 6); if (part) G.boss.damagePart(part, 1, G); }
            FX.spark(r.hx, beam.y, 2, "200,240,255", 3);
          }
        }
      }
    }

    // enemy bullets vs player
    if (pl.alive && pl.invuln <= 0) {
      WP.enemyBullets.forEach((b) => {
        if (U.circleHit(b.x, b.y, b.r * 0.7, pl.x, pl.y, pl.r)) { b._dead = true; pl.hit(G); }
      });
    }
    // enemy/boss contact handled within their update via pl.hit
    if (G.boss) G.boss.checkPlayer(G);
  }

  // ---- stage flow ----
  G.startStage = function (idx) {
    G.stageIdx = idx;
    const st = NL.stages.list[idx];
    G.stageName = st.name;
    G.bg = st.bg();
    G.stageTimer = 0; G.scroll = 0; G.scrollSpeed = 3;
    G.boss = null; G.bossDefeatedFlag = false;
    G.schedule = [];
    E.reset(); WP.reset(); NL.powerups.reset(); FX.reset();
    st.build(G);
    G.bossAt = (st.duration || 64) * 60;
    NL.audio.playMusic(st.music);
    G.toast(st.name);
  };

  G.spawnBoss = function () {
    if (G.boss) return;
    G.boss = NL.bosses.make(G.stageIdx, G);
    G.scrollSpeed = 0;
    NL.audio.playMusic("boss");
    G.toast("WARNING — BOSS APPROACHING");
    NL.audio.sfx.warn();
  };

  G.onBossDead = function () {
    G.addScore(10000);
    G.state = STATE.CLEAR; G.clearTimer = 200;
    NL.audio.stopMusic(); NL.audio.sfx.clear();
    persist();
  };

  G.onPlayerDeath = function () {
    G.deathTimer = 90;
    G.state = STATE.DEATH;
  };

  function afterDeath() {
    G.lives--;
    if (G.lives < 0) {
      G.state = STATE.CONTINUE; G.continueTimer = 9 * 60;
      NL.audio.stopMusic(); NL.audio.sfx.gameover();
    } else {
      G.player.onRespawn();
      G.state = STATE.PLAY;
      // resume appropriate music
      NL.audio.playMusic(G.boss ? "boss" : NL.stages.list[G.stageIdx].music);
    }
  }

  // ---- main update ----
  function update() {
    G.frame++;
    NL.input.poll();
    const In = NL.input;

    if (In.mutePressed) NL.audio.toggleMute();

    switch (G.state) {
      case STATE.TITLE:
        if (In.anyPressed || In.firePressed) { NL.audio.resume(); NL.audio.sfx.start(); startNewGame(); }
        break;

      case STATE.PLAY:
        if (In.pausePressed) { G.state = STATE.PAUSE; break; }
        stepPlay();
        break;

      case STATE.PAUSE:
        if (In.pausePressed) G.state = STATE.PLAY;
        break;

      case STATE.DEATH:
        stepWorld(true); // keep effects/enemies moving, no player fire
        if (--G.deathTimer <= 0) afterDeath();
        break;

      case STATE.CLEAR:
        FX.update();
        if (--G.clearTimer <= 0) {
          if (G.stageIdx >= NL.stages.list.length - 1) { G.state = STATE.VICTORY; G.clearTimer = 100000; }
          else G.startStage(G.stageIdx + 1), (G.state = STATE.PLAY);
        }
        break;

      case STATE.CONTINUE:
        G.continueTimer--;
        if (In.firePressed || In.anyPressed) { G.continueCount++; G.lives = 3; G.player.reset(); G.startStage(G.stageIdx); G.state = STATE.PLAY; }
        else if (G.continueTimer <= 0) { G.state = STATE.GAMEOVER; G.clearTimer = 240; persist(); }
        break;

      case STATE.GAMEOVER:
        if (--G.clearTimer <= 0 || In.anyPressed) { G.state = STATE.TITLE; NL.audio.playMusic("title"); }
        break;

      case STATE.VICTORY:
        FX.update();
        if (In.anyPressed && G.frame % 1 === 0 && G._victoryReady) { G.state = STATE.TITLE; NL.audio.playMusic("title"); }
        if (!G._victoryReady) { G._vReadyT = (G._vReadyT || 0) + 1; if (G._vReadyT > 120) G._victoryReady = true; }
        break;
    }

    // hi-score persistence opportunistic
    if (G.frame % 120 === 0 && G.score >= G.hiScore) persist();
  }

  function startNewGame() {
    G.score = 0; G.lives = 3; G.continueCount = 0;
    G.player.reset();
    G._victoryReady = false; G._vReadyT = 0;
    G.startStage(0);
    G.state = STATE.PLAY;
  }

  function stepPlay() {
    stepWorld(false);
    // power activation
    if (NL.input.powerPressed) NL.powerups.activate(G.player, G);
    // boss trigger
    if (!G.boss && G.stageTimer >= G.bossAt && E.pool.count < 3) G.spawnBoss();
  }

  // advance world (player optional fire). Used by PLAY and DEATH.
  function stepWorld(deathMode) {
    if (G.toastTimer > 0) G.toastTimer--;
    if (G.warnTimer > 0) G.warnTimer--;
    if (!deathMode) { G.stageTimer++; runSchedule(); }
    G.scroll += G.scrollSpeed;

    if (!deathMode) G.player.update(G);
    NL.powerups.update(G);
    E.update(G);
    if (G.boss) G.boss.update(G);
    WP.update(G);
    FX.update();
    if (!deathMode) collisions();
  }

  // ---- render ----
  function render() {
    const g = G.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, NL.W, NL.H);

    // screen shake
    let sx = 0, sy = 0;
    if (FX.shake > 0.2) { sx = (Math.random() - 0.5) * FX.shake; sy = (Math.random() - 0.5) * FX.shake; }
    g.save();
    g.translate(sx, sy);

    if (G.state === STATE.TITLE) { NL.ui.drawTitle(g, G); g.restore(); return; }

    // world
    G.bg.draw(g, G.scroll, G.frame);
    NL.powerups.draw(g);
    E.draw(g);
    if (G.boss) G.boss.draw(g);

    // laser beams (under bullets glow ok)
    if (G.player.alive && G.player.laserActive) {
      WP.drawLaser(g, G.player._laserX, G.player._laserY, G.player.laserEnd.x, G.player._laserY, WP.laser.power, G.frame);
      for (const o of (G.player._optionLasers || [])) WP.drawLaser(g, o.x, o.y, o.end, o.y, WP.laser.power * 0.8, G.frame);
    }
    WP.draw(g);
    G.player.draw(g);
    FX.draw(g);
    FX.drawScreenFlash(g);

    g.restore();

    // HUD (no shake)
    NL.ui.drawHUD(g, G);

    // overlays
    if (G.state === STATE.PAUSE) NL.ui.drawCenterPanel(g, [{ s: "PAUSED", size: 48 }, { s: "P で再開", size: 20, col: "#9fc4dd" }]);
    if (G.state === STATE.CONTINUE) {
      const sec = Math.ceil(G.continueTimer / 60);
      NL.ui.drawCenterPanel(g, [
        { s: "CONTINUE?", size: 52, col: "#ffd070", glow: "rgba(255,160,40,.8)" },
        { s: sec + "", size: 64, col: "#ff5a4a", glow: "rgba(255,80,40,.8)" },
        { s: (NL.input.isTouch ? "TAP" : "PRESS Z / ENTER") + " で続行 (無限コンティニュー)", size: 18, col: "#cfe9ff" }
      ]);
    }
    if (G.state === STATE.GAMEOVER) NL.ui.drawCenterPanel(g, [{ s: "GAME OVER", size: 56, col: "#ff5a4a", glow: "rgba(255,80,40,.8)" }, { s: "SCORE " + G.score, size: 22, col: "#cfe9ff" }]);
    if (G.state === STATE.CLEAR) NL.ui.drawCenterPanel(g, [{ s: "STAGE CLEAR", size: 52, col: "#aef0ff", glow: "rgba(54,224,255,.9)" }, { s: "+10000", size: 24, col: "#ffd070" }]);
    if (G.state === STATE.VICTORY) NL.ui.drawCenterPanel(g, [
      { s: "ALL CLEAR", size: 64, col: "#ffd070", glow: "rgba(255,180,60,.9)" },
      { s: "地球圏は守られた。", size: 24, col: "#aef0ff" },
      { s: "FINAL SCORE " + G.score, size: 26, col: "#eaf6ff" },
      { s: G._victoryReady ? "PRESS ANY KEY" : "", size: 18, col: "#9fc4dd" }
    ]);
  }

  // ---- loop ----
  let acc = 0, last = 0; const STEP = 1000 / 60;
  G.loop = function (ts) {
    if (!last) last = ts;
    let dt = ts - last; last = ts;
    if (dt > 250) dt = 250; // clamp after tab-out
    acc += dt;
    let steps = 0;
    // hit-stop freezes logic briefly
    if (FX.hitStop > 0) { FX.hitStop--; acc = 0; }
    else { while (acc >= STEP && steps < 5) { update(); acc -= STEP; steps++; } }
    render();
    requestAnimationFrame(G.loop);
  };

  // ---- TEST HOOKS (used by Playwright QA) ----
  window.__NL = {
    get state() { return G.state; },
    get score() { return G.score; },
    get lives() { return G.lives; },
    get bossHp() { return G.boss ? G.boss.hp : null; },
    get bossName() { return G.boss ? G.boss.name : null; },
    get bossEntering() { return G.boss ? G.boss.entering : true; },
    get stageIdx() { return G.stageIdx; },
    start() { if (G.state === STATE.TITLE) { NL.audio.resume(); startNewGame(); } },
    setState(s) { G.state = s; },
    jumpToBoss() { G.stageTimer = G.bossAt + 1; E.reset(); G.spawnBoss(); },
    gotoStage(i) { startNewGame(); G.startStage(i); G.state = STATE.PLAY; },
    // probe: directly damage boss core and report hp delta (collision validity)
    probeBossCore(dmg) {
      if (!G.boss) return null;
      const before = G.boss.hp;
      const c = G.boss.core; const cp = G.boss.partPos(c);
      const part = G.boss.hitTest(cp.x, cp.y, 6);
      if (part) G.boss.damagePart(part, dmg || 5, G);
      return { hitPart: part ? part.type : null, before, after: G.boss.hp, delta: before - G.boss.hp };
    },
    // probe: fire a player shot at boss core position and run one collision pass
    probeShotAtCore() {
      if (!G.boss) return null;
      const c = G.boss.core; const cp = G.boss.partPos(c);
      const before = G.boss.hp;
      WP.spawnShot(cp.x - 30, cp.y, 30, 0, { r: 6, dmg: 4 });
      // advance a few frames so the shot reaches the core
      for (let i = 0; i < 6; i++) { WP.update(G); collisions(); }
      return { before, after: G.boss.hp, delta: before - G.boss.hp };
    },
    killBoss() { if (G.boss) G.boss.beginDeath(G); },
    addCapsule() { NL.powerups.spawn(G.player.x + 200, G.player.y, false); },
    invincible(v) { G.player.invuln = v ? 1e9 : 0; }
  };

})();
