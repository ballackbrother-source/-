/* ============================================================
   stages.js : 3 stages (~2 min each) with parallax landscape
   backgrounds (no mechs / no people, per spec) and scripted
   spawn timelines that ramp difficulty and place the traps.
   ============================================================ */
(function () {
  "use strict";
  const NL = window.NL;
  const U = NL.util;
  const E = NL.enemies;

  const S = (NL.stages = {});

  // ---------- background rendering ----------
  function makeStars(n, seed) {
    const rng = U.makeRng(seed);
    const a = [];
    for (let i = 0; i < n; i++) a.push({ x: rng() * NL.W, y: rng() * NL.H, z: 0.2 + rng() * 1.6, s: 0.6 + rng() * 1.8 });
    return a;
  }

  // each stage gets a bg object with {draw(g, scroll, frame)}
  function bgStage1() {
    const stars = makeStars(90, 11);
    const clouds = [];
    const rng = U.makeRng(7);
    for (let i = 0; i < 10; i++) clouds.push({ x: rng() * NL.W * 2, y: 120 + rng() * 360, s: 0.4 + rng() * 1.0, w: 160 + rng() * 220 });
    return {
      draw(g, scroll, frame) {
        // sky gradient (dawn)
        const sky = g.createLinearGradient(0, 0, 0, NL.H);
        sky.addColorStop(0, "#1b2b4a"); sky.addColorStop(0.45, "#2e4a6e");
        sky.addColorStop(0.7, "#6a5a7a"); sky.addColorStop(1, "#caa07a");
        g.fillStyle = sky; g.fillRect(0, 0, NL.W, NL.H);
        // sun glow
        g.globalCompositeOperation = "lighter";
        const sg = g.createRadialGradient(NL.W * 0.78, NL.H * 0.7, 0, NL.W * 0.78, NL.H * 0.7, 360);
        sg.addColorStop(0, "rgba(255,210,150,.5)"); sg.addColorStop(1, "rgba(255,210,150,0)");
        g.fillStyle = sg; g.fillRect(0, 0, NL.W, NL.H);
        g.globalCompositeOperation = "source-over";
        // stars (upper)
        for (const s of stars) { const x = (s.x - scroll * s.z * 0.3) % NL.W; const xx = x < 0 ? x + NL.W : x; g.fillStyle = `rgba(220,235,255,${0.5})`; g.fillRect(xx, s.y * 0.5, s.s, s.s); }
        // far mountains
        drawRidge(g, scroll * 0.08, NL.H * 0.72, 70, "#34405e", 9);
        drawRidge(g, scroll * 0.16, NL.H * 0.8, 100, "#283450", 7);
        // distant city silhouette
        drawCity(g, scroll * 0.28, NL.H * 0.86, "#1a2236");
        // clouds (soft wispy puffs, not hard ellipses)
        for (const c of clouds) {
          const x = ((c.x - scroll * c.s * 0.5) % (NL.W + 600)); const xx = x < -300 ? x + NL.W + 600 : x;
          softCloud(g, xx, c.y, c.w, 0.16 + c.s * 0.05);
        }
        // sea
        const sea = g.createLinearGradient(0, NL.H * 0.86, 0, NL.H);
        sea.addColorStop(0, "#6a6a7a"); sea.addColorStop(1, "#2a3a4a");
        g.fillStyle = sea; g.fillRect(0, NL.H * 0.86, NL.W, NL.H * 0.14);
      }
    };
  }

  function bgStage2() {
    const stars = makeStars(140, 23);
    return {
      draw(g, scroll, frame) {
        const sky = g.createLinearGradient(0, 0, 0, NL.H);
        sky.addColorStop(0, "#0a0612"); sky.addColorStop(1, "#1a0f1a");
        g.fillStyle = sky; g.fillRect(0, 0, NL.W, NL.H);
        // nebula
        g.globalCompositeOperation = "lighter";
        for (let i = 0; i < 3; i++) {
          const nx = ((i * 500 - scroll * 0.05) % (NL.W + 600)) - 100;
          const ng = g.createRadialGradient(nx, 180 + i * 120, 0, nx, 180 + i * 120, 320);
          ng.addColorStop(0, i % 2 ? "rgba(120,40,90,.18)" : "rgba(60,40,120,.18)"); ng.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = ng; g.fillRect(0, 0, NL.W, NL.H);
        }
        g.globalCompositeOperation = "source-over";
        for (const s of stars) { const x = (s.x - scroll * s.z * 0.4) % NL.W; const xx = x < 0 ? x + NL.W : x; g.fillStyle = `rgba(220,225,255,${0.4 + 0.4 * Math.sin(frame * 0.05 + s.x)})`; g.fillRect(xx, s.y, s.s, s.s); }
        // asteroid canyon walls (top & bottom)
        drawCanyon(g, scroll * 0.5, true);
        drawCanyon(g, scroll * 0.5, false);
        // floating asteroids midground
        const rng = U.makeRng(99);
        for (let i = 0; i < 6; i++) {
          const bx = ((i * 280 + 100 - scroll * 0.3) % (NL.W + 400)) - 100;
          const by = 160 + rng() * 380; const r = 24 + rng() * 40;
          g.fillStyle = "#3a3030"; g.beginPath(); g.arc(bx, by, r, 0, 7); g.fill();
          g.fillStyle = "#241c1c"; g.beginPath(); g.arc(bx - r * 0.3, by + r * 0.3, r * 0.5, 0, 7); g.fill();
        }
      }
    };
  }

  function bgStage3() {
    return {
      draw(g, scroll, frame) {
        g.fillStyle = "#06070d"; g.fillRect(0, 0, NL.W, NL.H);
        // mechanical corridor: receding panels
        const cx = NL.W / 2, cy = NL.H / 2;
        g.strokeStyle = "rgba(60,90,120,.25)"; g.lineWidth = 1;
        const off = (scroll * 0.4) % 80;
        for (let d = 0; d < 14; d++) {
          const k = (d * 80 - off) / (14 * 80);
          const s = 1 - k;
          const w = NL.W * s, h = NL.H * s;
          g.strokeRect(cx - w / 2, cy - h / 2, w, h);
        }
        // top/bottom conduit walls
        const grdT = g.createLinearGradient(0, 0, 0, 120);
        grdT.addColorStop(0, "#1a2230"); grdT.addColorStop(1, "rgba(10,14,20,0)");
        g.fillStyle = grdT; g.fillRect(0, 0, NL.W, 120);
        g.fillStyle = grdT; g.save(); g.translate(0, NL.H); g.scale(1, -1); g.fillRect(0, 0, NL.W, 120); g.restore();
        // energy conduits (animated)
        g.globalCompositeOperation = "lighter";
        for (let i = 0; i < 5; i++) {
          const y = 60 + i * (NL.H - 120) / 4;
          const a = 0.15 + 0.12 * Math.sin(frame * 0.08 + i);
          g.strokeStyle = `rgba(255,90,40,${a})`; g.lineWidth = 3;
          g.beginPath();
          for (let x = 0; x <= NL.W; x += 40) g.lineTo(x, y + Math.sin((x - scroll) * 0.02 + i) * 10);
          g.stroke();
        }
        g.globalCompositeOperation = "source-over";
        // scrolling pipes
        const off2 = (scroll * 0.8) % 200;
        g.fillStyle = "rgba(40,55,72,.5)";
        for (let x = -200 + off2; x < NL.W; x += 200) { g.fillRect(x, 0, 14, NL.H); }
      }
    };
  }

  // soft cloud = several overlapping radial-gradient puffs along a low arc
  function softCloud(g, x, y, w, alpha) {
    const rng = U.makeRng(Math.floor(x * 0.13 + y));
    const puffs = 5 + Math.floor(rng() * 3);
    for (let i = 0; i < puffs; i++) {
      const px = x + (i - puffs / 2) * (w * 0.32) + (rng() - 0.5) * 20;
      const py = y + Math.sin(i * 1.1) * (w * 0.08) + (rng() - 0.5) * 12;
      const pr = w * (0.28 + rng() * 0.22);
      const grd = g.createRadialGradient(px, py - pr * 0.2, 0, px, py, pr);
      grd.addColorStop(0, `rgba(244,224,212,${alpha})`);
      grd.addColorStop(0.5, `rgba(228,200,196,${alpha * 0.55})`);
      grd.addColorStop(1, "rgba(228,200,196,0)");
      g.fillStyle = grd; g.beginPath(); g.arc(px, py, pr, 0, 7); g.fill();
    }
  }

  function drawRidge(g, off, baseY, amp, col, seedN) {
    const rng = U.makeRng(seedN);
    g.fillStyle = col; g.beginPath(); g.moveTo(0, NL.H);
    for (let x = -50; x <= NL.W + 50; x += 40) {
      const y = baseY - Math.abs(Math.sin((x + off) * 0.004 + rng() * 0.1)) * amp - rng() * 14;
      g.lineTo(x, y);
    }
    g.lineTo(NL.W, NL.H); g.closePath(); g.fill();
  }
  function drawCity(g, off, baseY, col) {
    g.fillStyle = col;
    const rng = U.makeRng(55);
    for (let x = -off % 60; x < NL.W; x += 30) {
      const h = 20 + rng() * 90; g.fillRect(x, baseY - h, 22, h);
      if (rng() < 0.4) { g.fillStyle = "rgba(255,210,150,.5)"; g.fillRect(x + 6, baseY - h + 8, 3, 3); g.fillStyle = col; }
    }
  }
  function drawCanyon(g, off, top) {
    const rng = U.makeRng(top ? 3 : 4);
    const grd = g.createLinearGradient(0, top ? 0 : NL.H, 0, top ? 160 : NL.H - 160);
    grd.addColorStop(0, "#3a2c28"); grd.addColorStop(1, "#1c1614");
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, top ? 0 : NL.H);
    for (let x = -50; x <= NL.W + 50; x += 36) {
      const base = top ? 60 : NL.H - 60;
      const y = base + (top ? 1 : -1) * (Math.abs(Math.sin((x + off) * 0.01)) * 60 + rng() * 30);
      g.lineTo(x, y);
    }
    g.lineTo(NL.W, top ? 0 : NL.H); g.closePath(); g.fill();
  }

  // ---------- spawn timelines ----------
  // helper builders
  function squad(game, y, n, gap, type, opt) {
    for (let i = 0; i < n; i++) game.delay(i * gap, () => E.pool && spawnE(type, NL.W + 40, y, opt));
  }
  function spawnE(type, x, y, opt) { return NL.enemies[type](type === "ambush" ? y : x, type === "ambush" ? undefined : y, opt) || null; }

  // each stage: {name, duration(sec), music, build(game)->events}
  // events scheduled via game.delay relative to stage start (in frames).
  S.list = [
    {
      name: "STAGE 1 — DAWN ASSAULT", duration: 64, music: "stage1", bg: bgStage1,
      build(game) {
        // early frequent capsule carriers + simple waves (teach controls)
        for (let i = 0; i < 6; i++) game.delay(60 + i * 90, () => { const e = NL.enemies.drone(NL.W + 40, 150 + (i % 3) * 120); });
        game.delay(180, () => { const e = NL.enemies.fighter(NL.W + 40, 220); e.dropAlways = true; });
        for (let w = 0; w < 8; w++) {
          const base = 300 + w * 300;
          game.delay(base, () => { for (let k = 0; k < 5; k++) game.delay(k * 12, () => NL.enemies.drone(NL.W + 40, 120 + k * 90 + (w % 2) * 30)); });
          game.delay(base + 120, () => { NL.enemies.fighter(NL.W + 40, 180); NL.enemies.fighter(NL.W + 40, 480); });
          if (w % 2 === 1) game.delay(base + 160, () => { const e = NL.enemies.fighter(NL.W + 40, 320); e.dropAlways = true; });
        }
        // weaver flight (figure-8 interceptors)
        game.delay(1100, () => { for (let k = 0; k < 3; k++) game.delay(k * 28, () => NL.enemies.weaver(NL.W + 40, 220 + k * 120)); });
        // FIRST TRAP: rear ambush (teaches "watch your back")
        game.delay(900, () => { game.warnIfLearned("ambush", "敵機 後方より接近!"); NL.enemies.ambush(NL.H * 0.5); });
        // MINI-BOSS
        game.delay(1750, () => { game.toast("WARNING"); NL.audio.sfx.warn(); NL.enemies.miniboss(NL.H / 2, { name: "GR-04 RAVAGER" }); });
        // drone carrier mini-threat
        game.delay(2600, () => { const c = NL.enemies.carrier(NL.W + 70, 300); c.dropAlways = true; });
        game.delay(1500, () => { game.warnIfLearned("ambush", "後方 警戒!"); NL.enemies.ambush(220); NL.enemies.ambush(500); });
        // mid enemy mini-fight
        game.delay(2100, () => { const m = NL.enemies.mid(NL.W + 60, 300); m.dropAlways = true; });
        // falling debris field
        game.delay(2700, () => { game.warnIfLearned("debris", "上空より落下物!"); for (let k = 0; k < 6; k++) game.delay(k * 26, () => NL.enemies.debris(NL.W * (0.4 + Math.random() * 0.5))); });
        // final pre-boss swarm
        game.delay(3300, () => { for (let k = 0; k < 8; k++) game.delay(k * 10, () => NL.enemies.drone(NL.W + 40, 100 + k * 60)); });
      }
    },
    {
      name: "STAGE 2 — ASTEROID GAUNTLET", duration: 66, music: "stage2", bg: bgStage2,
      build(game) {
        // terrain turrets top & bottom
        for (let i = 0; i < 10; i++) {
          game.delay(120 + i * 200, () => NL.enemies.turret(NL.W + 30, 110));
          game.delay(220 + i * 200, () => { const t = NL.enemies.turret(NL.W + 30, NL.H - 110); t.flip = true; });
        }
        // PRESS MACHINES (signature trap of this stage)
        const pressTimes = [600, 1200, 1700, 2300, 3000];
        pressTimes.forEach((t, i) => game.delay(t, () => {
          game.warnIfLearned("press", "プレス機 作動!");
          NL.enemies.press(NL.W + 80, i % 2 === 0);
          if (i >= 2) game.delay(40, () => NL.enemies.press(NL.W + 80, i % 2 === 1));
        }));
        // fighter squads weaving through canyon
        for (let w = 0; w < 7; w++) game.delay(400 + w * 380, () => { for (let k = 0; k < 4; k++) game.delay(k * 14, () => { const e = NL.enemies.fighter(NL.W + 40, 200 + k * 80); e.amp = 90; }); });
        // FAKE CAPSULE trap appears here
        game.delay(1500, () => { game.warnIfLearned("fakeCapsule", "偽カプセル 注意!"); NL.powerups.spawn(NL.W + 30, 300, true); });
        game.delay(2600, () => { game.warnIfLearned("fakeCapsule", "偽カプセル 注意!"); NL.powerups.spawn(NL.W + 30, 250, true); NL.powerups.spawn(NL.W + 30, 450, false); });
        // weavers threading the canyon
        game.delay(1000, () => { for (let k = 0; k < 3; k++) game.delay(k * 24, () => NL.enemies.weaver(NL.W + 40, 200 + k * 110)); });
        game.delay(2800, () => { for (let k = 0; k < 4; k++) game.delay(k * 20, () => NL.enemies.weaver(NL.W + 40, 160 + k * 100)); });
        // MINI-BOSS
        game.delay(2000, () => { game.toast("WARNING"); NL.audio.sfx.warn(); NL.enemies.miniboss(NL.H / 2, { name: "BX-03 SHREDDER" }); });
        // drone carrier
        game.delay(2300, () => { const c = NL.enemies.carrier(NL.W + 70, 360); c.dropAlways = true; });
        // mid gunships
        game.delay(2000, () => { const m = NL.enemies.mid(NL.W + 60, 360); m.dropAlways = true; });
        game.delay(3200, () => { NL.enemies.mid(NL.W + 60, 240); NL.enemies.mid(NL.W + 60, 480); });
      }
    },
    {
      name: "STAGE 3 — OVERLORD'S MAW", duration: 68, music: "stage3", bg: bgStage3,
      build(game) {
        // dense mixed assault, all mechanics combined
        for (let w = 0; w < 9; w++) {
          const base = 150 + w * 330;
          game.delay(base, () => { for (let k = 0; k < 6; k++) game.delay(k * 9, () => NL.enemies.drone(NL.W + 40, 90 + k * 90)); });
          game.delay(base + 100, () => { NL.enemies.fighter(NL.W + 40, 200); NL.enemies.fighter(NL.W + 40, 520); });
          if (w % 3 === 2) game.delay(base + 150, () => { const m = NL.enemies.mid(NL.W + 60, 360); m.dropAlways = true; });
        }
        // combined traps
        game.delay(900, () => { game.warnIfLearned("ambush", "後方 警戒!"); NL.enemies.ambush(200); NL.enemies.ambush(520); });
        game.delay(1500, () => { game.warnIfLearned("press", "プレス機 作動!"); NL.enemies.press(NL.W + 80, true); NL.enemies.press(NL.W + 80, false); });
        game.delay(2100, () => { game.warnIfLearned("debris", "落下物!"); for (let k = 0; k < 8; k++) game.delay(k * 20, () => NL.enemies.debris(NL.W * (0.3 + Math.random() * 0.6))); });
        game.delay(2700, () => { game.warnIfLearned("fakeCapsule", "偽カプセル 注意!"); NL.powerups.spawn(NL.W + 30, 200, true); NL.powerups.spawn(NL.W + 30, 360, false); NL.powerups.spawn(NL.W + 30, 520, true); });
        game.delay(3300, () => { for (let k = 0; k < 5; k++) game.delay(k * 16, () => { const e = NL.enemies.fighter(NL.W + 40, 140 + k * 100); e.amp = 70; }); });
        // weaver swarms + twin carriers (final gauntlet)
        game.delay(1200, () => { for (let k = 0; k < 4; k++) game.delay(k * 20, () => NL.enemies.weaver(NL.W + 40, 140 + k * 110)); });
        // MINI-BOSS
        game.delay(1850, () => { game.toast("WARNING"); NL.audio.sfx.warn(); NL.enemies.miniboss(NL.H / 2, { name: "OV-02 SENTINEL" }); });
        game.delay(2600, () => { NL.enemies.carrier(NL.W + 70, 230); NL.enemies.carrier(NL.W + 70, 500); });
        game.delay(3000, () => { for (let k = 0; k < 3; k++) game.delay(k * 24, () => NL.enemies.weaver(NL.W + 40, 220 + k * 130)); });
      }
    }
  ];

})();
