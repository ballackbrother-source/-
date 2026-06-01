/* ============================================================
   powerup.js : Gradius-style power meter + capsule pickups.
   Collecting a capsule advances the cursor; pressing POWER
   activates the highlighted slot.
   ============================================================ */
(function () {
  "use strict";
  const NL = window.NL;
  const U = NL.util;
  const FX = NL.fx;

  const P = (NL.powerups = {});

  // Slot order on the bottom meter (classic Gradius feel).
  P.SLOTS = ["SPEED", "MISSILE", "DOUBLE", "SPREAD", "LASER", "OPTION", "SHIELD"];

  P.capsules = new U.Pool(() => ({}));

  P.reset = function () { P.capsules.clear(); };

  // spawn a capsule (or a disguised "fake" trap capsule)
  P.spawn = function (x, y, fake) {
    const c = P.capsules.spawn();
    c.x = x; c.y = y; c.vx = -1.6 - Math.random() * 0.8; c.vy = (Math.random() - 0.5) * 0.5;
    c.r = 18; c.fake = !!fake; c.life = 800; c.bob = Math.random() * 7; c.armed = !!fake ? 30 : 0;
    return c;
  };

  P.update = function (game) {
    const player = game.player;
    P.capsules.forEach((c) => {
      c.x += c.vx; c.y += c.vy; c.bob += 0.08; c.life--;
      c.vy += Math.sin(c.bob) * 0.02;
      if (c.armed > 0) c.armed--;
      if (c.life <= 0 || c.x < -40) { c._dead = true; return; }
      // collect
      if (player && player.alive && U.circleHit(c.x, c.y, c.r, player.x, player.y, player.r)) {
        if (c.fake) {
          // TRAP: damage player. Mark learned so future ones get a warning.
          game.learn("fakeCapsule");
          NL.audio.sfx.playerHit();
          FX.explode(c.x, c.y, 0.8);
          player.hit(game);
          c._dead = true;
        } else {
          NL.audio.sfx.capsule();
          P.advance(player);
          FX.spark(c.x, c.y, 10, "255,210,120", 5);
          c._dead = true;
        }
      }
    });
    P.capsules.sweep();
  };

  P.advance = function (player) {
    player.meter = (player.meter + 1) % (P.SLOTS.length + 1);
    if (player.meter === 0) player.meter = 1; // skip "none" after first
    player.meterArmed = true;
  };

  // Activate the currently highlighted slot.
  P.activate = function (player, game) {
    if (!player.meterArmed || player.meter === 0) return;
    const slot = P.SLOTS[player.meter - 1];
    let used = true;
    switch (slot) {
      case "SPEED":
        if (player.speedLv < 4) { player.speedLv++; player.applySpeed(); } else used = false;
        break;
      case "MISSILE":
        player.missile = true; break;
      case "DOUBLE":
        player.weapon = "double"; break;
      case "SPREAD":
        player.weapon = "spread"; break;
      case "LASER":
        player.weapon = "laser"; break;
      case "OPTION":
        if (player.options.length < 3) player.addOption(); else used = false;
        break;
      case "SHIELD":
        player.shield = 3; player.shieldMax = 3; break;
    }
    if (used) {
      NL.audio.sfx.powerup();
      FX.flashScreen(6, "120,220,255");
      FX.spark(player.x, player.y, 16, "150,230,255", 6);
      player.meter = 0; player.meterArmed = false;
      if (game) game.toast(slot + "!");
    } else {
      NL.audio.sfx.select();
    }
  };

  P.draw = function (g) {
    const real = NL.assets.images.capsule;
    const fakeImg = NL.assets.images.capsuleFake;
    P.capsules.forEach((c) => {
      const img = c.fake ? fakeImg : real;
      const y = c.y + Math.sin(c.bob) * 3;
      // glow
      g.globalCompositeOperation = "lighter";
      const grd = g.createRadialGradient(c.x, y, 0, c.x, y, c.r * 1.6);
      const gc = c.fake ? "255,70,70" : "255,170,50";
      grd.addColorStop(0, `rgba(${gc},0.5)`); grd.addColorStop(1, `rgba(${gc},0)`);
      g.fillStyle = grd; g.beginPath(); g.arc(c.x, y, c.r * 1.6, 0, 7); g.fill();
      g.globalCompositeOperation = "source-over";
      if (img) g.drawImage(img, c.x - img.width / 2, y - img.height / 2);
    });
  };

})();
