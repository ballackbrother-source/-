/* ============================================================
   enemies.js : enemy types + hazards. Hazards include the
   "first-time-kill" traps (rear ambush, ceiling press, falling
   debris) that become survivable once learned (game shows a
   warning the next time after you die to one).
   ============================================================ */
(function () {
  "use strict";
  const NL = window.NL;
  const U = NL.util;
  const FX = NL.fx;
  const WP = NL.weapons;

  const E = (NL.enemies = {});
  // Wipe every field when an enemy returns to the pool, so a recycled object
  // never carries stale flags from its previous life (e.g. a press machine's
  // `invincible`/`scroll`, an ambush's `flipX`, a carrier's `dropAlways`).
  E.pool = new U.Pool(() => ({}), (o) => { for (const k in o) if (k !== "_dead") delete o[k]; });

  E.reset = function () { E.pool.clear(); };

  function base(type, x, y, opt) {
    const e = E.pool.spawn();
    // Full default set — every optional flag is given a value so the object is
    // fully defined regardless of what type previously occupied this slot.
    Object.assign(e, {
      type, x, y, vx: 0, vy: 0, t: 0, hp: 1, maxhp: 1, r: 22,
      flash: 0, shootCd: 60, score: 100, touch: 1, hittable: true,
      img: null, w: 0, h: 0, phase: opt && opt.phase || 0, trap: false,
      warned: false, ax: x, ay: y,
      invincible: false, scroll: false, flip: false, flipX: false,
      dropAlways: false, fromTop: false, state: null, timer: 0,
      baseY: y, amp: 0, freq: 0, spin: 0, spinV: 0, stopX: 0, slamY: 0, restY: 0,
      trapId: null
    });
    if (opt) Object.assign(e, opt);
    return e;
  }

  const IMG = () => NL.assets.images;

  // ---- factories ----
  E.fighter = function (x, y, opt) {
    const e = base("fighter", x, y, opt);
    e.hp = e.maxhp = 3; e.r = 24; e.vx = -2.4; e.score = 120;
    e.img = IMG().enemyFighter; e.amp = (opt && opt.amp) || 60; e.freq = 0.03;
    e.baseY = y; e.shootCd = 70 + Math.random() * 40;
    return e;
  };
  E.drone = function (x, y, opt) {
    const e = base("drone", x, y, opt);
    e.hp = e.maxhp = 1; e.r = 18; e.vx = -3.4; e.score = 60;
    e.img = IMG().enemyDrone; e.baseY = y; e.amp = 0; e.shootCd = 9999;
    return e;
  };
  E.turret = function (x, y, opt) {
    const e = base("turret", x, y, opt);
    e.hp = e.maxhp = 6; e.r = 22; e.vx = 0; e.score = 200; e.scroll = true;
    e.img = IMG().turret; e.shootCd = 90; e.flip = !!(opt && opt.flip);
    return e;
  };
  E.mid = function (x, y, opt) {
    const e = base("mid", x, y, opt);
    e.hp = e.maxhp = 16; e.r = 44; e.vx = -1.2; e.score = 600;
    e.img = IMG().midEnemy; e.baseY = y; e.amp = 50; e.freq = 0.012;
    e.shootCd = 80; e.stopX = (opt && opt.stopX) || NL.W - 280;
    return e;
  };
  // rear ambush (comes from the LEFT, behind the player)
  E.ambush = function (y, opt) {
    const e = base("ambush", -60, y, opt);
    e.hp = e.maxhp = 3; e.r = 22; e.vx = 4.2; e.score = 300;
    e.img = IMG().enemyFighter; e.flipX = true; e.trap = true; e.trapId = "ambush";
    e.shootCd = 40;
    return e;
  };
  // ceiling/floor press machine (telegraphed slam)
  E.press = function (x, fromTop, opt) {
    const e = base("press", x, fromTop ? -40 : NL.H + 40, opt);
    e.hp = e.maxhp = 99999; e.r = 70; e.invincible = true; e.scroll = true;
    e.fromTop = fromTop; e.state = "wait"; e.timer = 50; e.touch = 99;
    e.trap = true; e.trapId = "press"; e.score = 0; e.w = 150; e.h = 90;
    e.restY = fromTop ? -40 : NL.H + 40;
    e.slamY = fromTop ? 250 : NL.H - 250;
    return e;
  };
  // falling debris
  E.debris = function (x, opt) {
    const e = base("debris", x, -40, opt);
    e.hp = e.maxhp = 4; e.r = 26; e.vy = 2 + Math.random() * 2; e.vx = -1.2;
    e.score = 80; e.trap = true; e.trapId = "debris"; e.spin = Math.random() * 7; e.spinV = (Math.random() - 0.5) * 0.2;
    return e;
  };

  // ---- update ----
  E.update = function (game) {
    const player = game.player;
    E.pool.forEach((e) => {
      e.t++;
      if (e.flash > 0) e.flash--;

      switch (e.type) {
        case "fighter":
          e.x += e.vx; e.y = e.baseY + Math.sin(e.t * e.freq) * e.amp;
          if (--e.shootCd <= 0 && e.x < NL.W - 40 && player.alive) { aimShot(e, player, 4.4, "255,120,90"); e.shootCd = 90 + Math.random() * 50; }
          break;
        case "drone":
          e.x += e.vx; e.y = e.baseY + Math.sin(e.t * 0.06 + e.phase) * (e.amp || 0);
          break;
        case "turret":
          // ride the terrain; keep drifting even when the boss freezes the
          // parallax scroll (scrollSpeed -> 0) so it always clears the screen
          if (e.scroll) e.x -= (game.scrollSpeed || 3);
          if (--e.shootCd <= 0 && e.x < NL.W && e.x > 0 && player.alive) { fan(e, player, 3, 3.6, "255,150,80"); e.shootCd = 120; }
          break;
        case "mid":
          if (e.x > e.stopX) e.x += e.vx; else e.x += game.scrollSpeed * -0.15;
          e.y = e.baseY + Math.sin(e.t * e.freq) * e.amp;
          if (--e.shootCd <= 0 && player.alive) { fan(e, player, 5, 3.4, "255,120,150"); e.shootCd = 70; }
          break;
        case "ambush":
          e.x += e.vx; e.vx *= 0.995;
          if (--e.shootCd <= 0 && player.alive) { aimShot(e, player, 5, "255,90,160"); e.shootCd = 60; }
          if (e.x > NL.W + 60) e._dead = true;
          break;
        case "press":
          updatePress(e, game, player); break;
        case "debris":
          e.x += e.vx; e.y += e.vy; e.vy += 0.05; e.spin += e.spinV;
          if (e.y > NL.H + 50) e._dead = true;
          break;
      }

      // cull off the left except scroll-anchored
      if (e.x < -120 && e.type !== "press") e._dead = true;

      // contact damage to player
      if (e.touch && player.alive && player.invuln <= 0) {
        for (const b of player.bodies()) {
          if (U.circleHit(e.x, e.y, e.r * 0.8, b.x, b.y, b.r)) {
            if (e.trap) game.learn(e.trapId);
            player.hit(game);
            if (!e.invincible) { e.hp = 0; FX.explode(e.x, e.y, 1); }
            break;
          }
        }
      }
      if (e.hp <= 0 && e.type !== "press") {
        E.kill(e, game);
      }
    });
    E.pool.sweep();
  };

  function aimShot(e, player, spd, col) {
    const a = U.angleTo(e.x, e.y, player.x, player.y);
    WP.spawnEnemyBullet(e.x, e.y, Math.cos(a) * spd, Math.sin(a) * spd, { col, r: 7 });
    FX.muzzle(e.x, e.y, a, "255,140,90");
  }
  function fan(e, player, n, spd, col) {
    const a0 = U.angleTo(e.x, e.y, player.x, player.y);
    for (let i = 0; i < n; i++) {
      const a = a0 + (i - (n - 1) / 2) * 0.22;
      WP.spawnEnemyBullet(e.x, e.y, Math.cos(a) * spd, Math.sin(a) * spd, { col, r: 7 });
    }
    FX.muzzle(e.x, e.y, a0, "255,140,90");
  }

  function updatePress(e, game, player) {
    // keep scrolling off even when the boss sets scrollSpeed to 0, otherwise a
    // lingering press would freeze on screen and never cull
    e.x -= (game.scrollSpeed || 3);
    if (e.x < -120) { e._dead = true; return; }
    // telegraph then slam then retract
    switch (e.state) {
      case "wait":
        if (e.x < NL.W - 60) e.state = "ready";
        break;
      case "ready":
        e.timer--;
        // warning glow handled in draw
        if (e.timer <= 0) { e.state = "slam"; NL.audio.sfx.warn(); }
        break;
      case "slam": {
        const dy = e.slamY - e.y;
        e.y += Math.sign(dy) * 26;
        if (Math.abs(e.slamY - e.y) < 26) { e.y = e.slamY; e.state = "hold"; e.timer = 18; FX.addShake(10); FX.shockwave(e.x, e.fromTop ? e.y + 40 : e.y - 40, 80, "200,180,140", 5); }
        break;
      }
      case "hold":
        if (--e.timer <= 0) e.state = "retract";
        break;
      case "retract": {
        const dy = e.restY - e.y;
        e.y += Math.sign(dy) * 8;
        if (Math.abs(e.restY - e.y) < 8) { e.y = e.restY; e.state = "done"; }
        break;
      }
    }
  }

  E.kill = function (e, game) {
    if (e._dead) return;
    e._dead = true;
    game.addScore(e.score);
    if (e.score > 0) FX.floatText(e.x, e.y, "+" + e.score, "255,230,150", e.type === "mid" ? 22 : 16);
    NL.audio.sfx.enemyDie();
    FX.explode(e.x, e.y, e.type === "mid" ? 1.8 : 1);
    game.maybeDrop(e);
  };

  // damage from a player projectile; returns true if it consumed the hit
  E.damage = function (e, dmg, game) {
    if (e.invincible) { FX.spark(e.x, e.y, 4, "200,220,255", 3); return false; }
    e.hp -= dmg; e.flash = 4;
    NL.audio.sfx.hit();
    if (e.hp <= 0) E.kill(e, game);
    return true;
  };

  E.draw = function (g) {
    E.pool.forEach((e) => {
      if (e.type === "press") { drawPress(g, e); return; }
      g.save();
      g.translate(e.x, e.y);
      if (e.type === "debris") g.rotate(e.spin);
      if (e.flipX) g.scale(-1, 1);
      const img = e.img;
      if (img) {
        if (e.flash > 0) {
          // hit flash: draw white-tinted copy
          g.drawImage(img, -img.width / 2, -img.height / 2);
          g.globalCompositeOperation = "lighter";
          g.globalAlpha = 0.8;
          g.drawImage(img, -img.width / 2, -img.height / 2);
          g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
        } else {
          g.drawImage(img, -img.width / 2, -img.height / 2);
        }
      } else if (e.type === "debris") {
        g.fillStyle = "#6b5a4a"; g.beginPath(); g.arc(0, 0, e.r, 0, 7); g.fill();
        g.fillStyle = "#3a2f26"; g.beginPath(); g.arc(-6, 4, e.r * 0.5, 0, 7); g.fill();
      } else {
        g.fillStyle = "#b55"; g.fillRect(-e.r, -e.r, e.r * 2, e.r * 2);
      }
      g.restore();

      // HP pip for mid enemies
      if (e.type === "mid" && e.hp < e.maxhp) {
        g.fillStyle = "rgba(0,0,0,.5)"; g.fillRect(e.x - 30, e.y - e.r - 14, 60, 5);
        g.fillStyle = "#ff5a4a"; g.fillRect(e.x - 30, e.y - e.r - 14, 60 * (e.hp / e.maxhp), 5);
      }
    });
  };

  function drawPress(g, e) {
    const w = e.w, h = e.h;
    // warning telegraph
    if (e.state === "ready") {
      const a = 0.4 + 0.4 * Math.sin(NL.game.frame * 0.4);
      g.fillStyle = `rgba(255,80,40,${a})`;
      g.fillRect(e.x - w / 2, e.fromTop ? e.y : e.y - h, w, e.fromTop ? NL.H : -NL.H);
      g.save(); g.globalAlpha = a;
      g.strokeStyle = "rgba(255,180,60,1)"; g.lineWidth = 3;
      g.strokeRect(e.x - w / 2, e.fromTop ? e.y - 6 : e.y - h + 6, w, h);
      g.restore();
    }
    // the press block: heavy metal
    g.save(); g.translate(e.x, e.y);
    const grd = g.createLinearGradient(0, -h / 2, 0, h / 2);
    grd.addColorStop(0, "#7a828c"); grd.addColorStop(0.5, "#444c55"); grd.addColorStop(1, "#23292f");
    g.fillStyle = grd;
    const top = e.fromTop ? -h : 0;
    g.fillRect(-w / 2, top, w, h);
    g.strokeStyle = "#11161a"; g.lineWidth = 3; g.strokeRect(-w / 2, top, w, h);
    // hydraulic piston
    g.fillStyle = "#2a3138";
    g.fillRect(-12, e.fromTop ? -h - 60 : h, 24, 60);
    // teeth
    g.fillStyle = "#1c2228";
    const ty = e.fromTop ? 0 : -10;
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 28 - 8, ty); g.lineTo(i * 28 + 8, ty); g.lineTo(i * 28, ty + (e.fromTop ? 16 : -16)); g.closePath(); g.fill(); }
    // hazard stripes
    g.fillStyle = "#ffcf3a";
    g.fillRect(-w / 2, e.fromTop ? -14 : 8, w, 6);
    g.restore();
  }

})();
