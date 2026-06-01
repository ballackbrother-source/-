/* ============================================================
   weapons.js : projectile pools (player shots, missiles, enemy
   bullets) + the multi-layer LASER beam. Firing logic lives in
   player.js which calls these spawners.
   ============================================================ */
(function () {
  "use strict";
  const NL = window.NL;
  const U = NL.util;
  const FX = NL.fx;

  const W = (NL.weapons = {});

  W.playerShots = new U.Pool(() => ({}));
  W.missiles = new U.Pool(() => ({}));
  W.enemyBullets = new U.Pool(() => ({}));

  W.laser = { on: false, power: 0, ticks: 0 }; // continuous beam state

  W.reset = function () {
    W.playerShots.clear(); W.missiles.clear(); W.enemyBullets.clear();
    W.laser.on = false; W.laser.power = 0;
  };

  // ---- player shot ----
  W.spawnShot = function (x, y, vx, vy, opt) {
    opt = opt || {};
    const b = W.playerShots.spawn();
    b.x = x; b.y = y; b.vx = vx; b.vy = vy;
    b.r = opt.r || 6; b.dmg = opt.dmg || 1;
    b.col = opt.col || "120,220,255";
    b.core = opt.core || "255,255,255";
    b.life = opt.life || 90; b.pierce = opt.pierce || 0;
    b.kind = opt.kind || "bullet";
    b.len = opt.len || 0; // for streak bullets
    return b;
  };

  // ---- homing-ish missile ----
  W.spawnMissile = function (x, y, dir) {
    const m = W.missiles.spawn();
    m.x = x; m.y = y; m.dir = dir == null ? -0.5 : dir;
    m.vx = Math.cos(m.dir) * 3; m.vy = Math.sin(m.dir) * 3;
    m.spd = 8; m.dmg = 2; m.r = 7; m.life = 120; m.target = null; m.armed = 6;
    return m;
  };

  // ---- enemy bullet ----
  W.spawnEnemyBullet = function (x, y, vx, vy, opt) {
    opt = opt || {};
    const b = W.enemyBullets.spawn();
    const sp = (NL.diff && NL.diff.bulletSpd) || 1; // difficulty: bullet speed
    b.x = x; b.y = y; b.vx = vx * sp; b.vy = vy * sp;
    b.r = opt.r || 7; b.dmg = opt.dmg || 1;
    b.col = opt.col || "255,120,90"; b.core = opt.core || "255,240,200";
    b.life = opt.life || 360; b.kind = opt.kind || "orb";
    b.spin = 0;
    return b;
  };

  W.update = function (game) {
    const SW = NL.W, SH = NL.H;
    W.playerShots.forEach((b) => {
      b.x += b.vx; b.y += b.vy; b.life--;
      if (b.life <= 0 || b.x > SW + 40 || b.x < -40 || b.y < -40 || b.y > SH + 40) b._dead = true;
    });
    W.playerShots.sweep();

    W.missiles.forEach((m) => {
      m.life--; if (m.armed > 0) m.armed--;
      // Re-acquire the nearest target EVERY frame. Caching a target is unsafe:
      // the boss is returned as a fresh fixed-position literal (would freeze the
      // aim point), and enemy objects are recycled through the pool (a killed-
      // then-respawned object would read as still-alive). Recomputing is cheap
      // (few targets) and always tracks the live position.
      if (m.armed <= 0) {
        const tgt = game.nearestEnemy(m.x, m.y);
        if (tgt) {
          const a = U.angleTo(m.x, m.y, tgt.x, tgt.y);
          let da = a - m.dir;
          while (da > Math.PI) da -= 2 * Math.PI;
          while (da < -Math.PI) da += 2 * Math.PI;
          m.dir += U.clamp(da, -0.13, 0.13);
        }
      }
      m.vx = Math.cos(m.dir) * m.spd; m.vy = Math.sin(m.dir) * m.spd;
      m.x += m.vx; m.y += m.vy;
      FX.smokeTrail(m.x - Math.cos(m.dir) * 12, m.y - Math.sin(m.dir) * 12);
      FX.particle(m.x - Math.cos(m.dir) * 14, m.y - Math.sin(m.dir) * 14,
        -Math.cos(m.dir) * 1.5, -Math.sin(m.dir) * 1.5, 8, 5, 0,
        Math.random() < 0.5 ? "255,180,80" : "255,90,40", true, 0, 0.9);
      if (m.life <= 0 || m.x > SW + 60 || m.x < -60 || m.y < -60 || m.y > SH + 60) { FX.explode(m.x, m.y, 0.6); m._dead = true; }
    });
    W.missiles.sweep();

    W.enemyBullets.forEach((b) => {
      b.x += b.vx; b.y += b.vy; b.life--; b.spin += 0.3;
      if (b.life <= 0 || b.x < -40 || b.x > SW + 40 || b.y < -40 || b.y > SH + 40) b._dead = true;
    });
    W.enemyBullets.sweep();

    // laser cosmetic ticks
    if (W.laser.on) W.laser.ticks++;
  };

  W.draw = function (g) {
    // player shots
    g.globalCompositeOperation = "lighter";
    W.playerShots.forEach((b) => {
      if (b.kind === "streak") {
        const ang = Math.atan2(b.vy, b.vx);
        g.save(); g.translate(b.x, b.y); g.rotate(ang);
        const L = b.len || 26;
        const grd = g.createLinearGradient(-L, 0, b.r + 2, 0);
        grd.addColorStop(0, `rgba(${b.col},0)`);
        grd.addColorStop(1, `rgba(${b.col},0.9)`);
        g.fillStyle = grd; g.fillRect(-L, -b.r * 0.5, L, b.r);
        g.fillStyle = `rgba(${b.core},1)`; g.beginPath(); g.arc(0, 0, b.r * 0.6, 0, 7); g.fill();
        g.restore();
      } else {
        const grd = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2.2);
        grd.addColorStop(0, `rgba(${b.core},1)`);
        grd.addColorStop(0.35, `rgba(${b.col},0.9)`);
        grd.addColorStop(1, `rgba(${b.col},0)`);
        g.fillStyle = grd; g.beginPath(); g.arc(b.x, b.y, b.r * 2.2, 0, 7); g.fill();
      }
    });

    // missiles (drawn with sprite + glow)
    g.globalCompositeOperation = "source-over";
    const mImg = NL.assets.images.missile;
    W.missiles.forEach((m) => {
      g.save(); g.translate(m.x, m.y); g.rotate(m.dir);
      if (mImg) g.drawImage(mImg, -mImg.width * 0.7, -mImg.height / 2);
      g.restore();
    });

    // enemy bullets
    g.globalCompositeOperation = "lighter";
    W.enemyBullets.forEach((b) => {
      const grd = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2.2);
      grd.addColorStop(0, `rgba(${b.core},1)`);
      grd.addColorStop(0.4, `rgba(${b.col},0.95)`);
      grd.addColorStop(1, `rgba(${b.col},0)`);
      g.fillStyle = grd; g.beginPath(); g.arc(b.x, b.y, b.r * 2.2, 0, 7); g.fill();
    });
    g.globalCompositeOperation = "source-over";
    // solid core for readability of enemy bullets
    W.enemyBullets.forEach((b) => {
      g.fillStyle = `rgba(${b.core},0.95)`;
      g.beginPath(); g.arc(b.x, b.y, b.r * 0.55, 0, 7); g.fill();
    });
  };

  // ---- LASER beam: drawn separately (origin + endpoint computed by player) ----
  W.drawLaser = function (g, x0, y0, x1, y1, power, t) {
    if (!W.laser.on) return;
    const flick = 0.75 + 0.25 * Math.sin(t * 0.9);
    const base = 4 + power * 2;
    g.globalCompositeOperation = "lighter";
    // outer glow
    g.strokeStyle = `rgba(120,230,255,${0.22 * flick})`; g.lineWidth = base * 4;
    g.lineCap = "round";
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    // mid
    g.strokeStyle = `rgba(120,220,255,${0.55 * flick})`; g.lineWidth = base * 2;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    // core
    g.strokeStyle = `rgba(235,255,255,${0.95})`; g.lineWidth = base * 0.7;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    // muzzle
    NL.fx.muzzle && (Math.random() < 0.5) && NL.fx.muzzle(x0, y0, 0, "150,230,255");
    g.globalCompositeOperation = "source-over";
  };

})();
