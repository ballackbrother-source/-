/* ============================================================
   effects.js : particles, multi-layer explosions, trails,
   muzzle flashes, shockwave rings, screen shake, hit-stop.
   All additive-glow where it matters.
   ============================================================ */
(function () {
  "use strict";
  const NL = window.NL;
  const U = NL.util;

  const FX = (NL.fx = {});

  const parts = new U.Pool(
    () => ({}),
    (o) => {}
  );
  const rings = new U.Pool(() => ({}));
  const flashes = new U.Pool(() => ({}));
  const trails = []; // lightweight trail segments {x,y,life,max,r,col}

  FX.shake = 0;
  FX.shakeMax = 0;
  FX.hitStop = 0; // frames of freeze
  FX._flashScreen = 0; FX._flashCol = "255,255,255";

  FX.reset = function () {
    parts.clear(); rings.clear(); flashes.clear(); trails.length = 0;
    FX.shake = 0; FX.hitStop = 0; FX._flashScreen = 0;
  };

  FX.addShake = function (amt) { FX.shake = Math.max(FX.shake, amt); FX.shakeMax = Math.max(FX.shakeMax, FX.shake); };
  FX.addHitStop = function (f) { FX.hitStop = Math.max(FX.hitStop, f); };
  FX.flashScreen = function (n, col) { FX._flashScreen = n; FX._flashCol = col || "255,255,255"; };

  // generic particle
  function particle(x, y, vx, vy, life, r0, r1, col, additive, grav, drag) {
    const p = parts.spawn();
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.max = life; p.r0 = r0; p.r1 = r1;
    p.col = col; p.add = additive !== false; p.grav = grav || 0; p.drag = drag == null ? 0.98 : drag;
    return p;
  }
  FX.particle = particle;

  // muzzle flash at gun tip
  FX.muzzle = function (x, y, dir, col) {
    const f = flashes.spawn();
    f.x = x; f.y = y; f.dir = dir == null ? 0 : dir; f.life = 6; f.max = 6;
    f.col = col || "120,220,255"; f.size = 16 + Math.random() * 6;
    // sparks
    for (let i = 0; i < 4; i++) {
      const a = f.dir + (Math.random() - 0.5) * 0.7;
      particle(x, y, Math.cos(a) * (4 + Math.random() * 4), Math.sin(a) * (4 + Math.random() * 4),
        8 + Math.random() * 6, 2, 0, f.col, true, 0, 0.9);
    }
  };

  FX.spark = function (x, y, n, col, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 7;
      const s = (spd || 4) * (0.4 + Math.random());
      particle(x, y, Math.cos(a) * s, Math.sin(a) * s, 10 + Math.random() * 10, 2.4, 0, col || "255,200,120", true, 0.05, 0.9);
    }
  };

  FX.shockwave = function (x, y, r1, col, lw) {
    const r = rings.spawn();
    r.x = x; r.y = y; r.r = 4; r.r1 = r1; r.life = 18; r.max = 18; r.col = col || "180,230,255"; r.lw = lw || 4;
  };

  // small enemy explosion
  FX.explode = function (x, y, scale) {
    scale = scale || 1;
    FX.flashScreen(0, ""); // nothing global
    FX.shockwave(x, y, 40 * scale, "255,200,120", 3);
    // fireball
    for (let i = 0; i < 14 * scale; i++) {
      const a = Math.random() * 7, s = (1 + Math.random() * 4) * scale;
      const col = Math.random() < 0.5 ? "255,180,70" : "255,90,40";
      particle(x, y, Math.cos(a) * s, Math.sin(a) * s, 16 + Math.random() * 14, 6 * scale, 0, col, true, 0.02, 0.92);
    }
    // debris
    for (let i = 0; i < 8 * scale; i++) {
      const a = Math.random() * 7, s = (2 + Math.random() * 5) * scale;
      particle(x, y, Math.cos(a) * s, Math.sin(a) * s, 24 + Math.random() * 18, 3, 0, "200,210,220", false, 0.18, 0.96);
    }
    // smoke
    for (let i = 0; i < 6 * scale; i++) {
      const a = Math.random() * 7, s = (0.4 + Math.random() * 1.4) * scale;
      const p = particle(x, y, Math.cos(a) * s, Math.sin(a) * s - 0.4, 40 + Math.random() * 30, 8 * scale, 22 * scale, "60,60,70", false, -0.01, 0.95);
      p.smoke = true;
    }
    FX.addShake(4 * scale);
  };

  // huge boss explosion (multi-stage handled by caller spamming this)
  FX.bigExplode = function (x, y, scale) {
    scale = scale || 2;
    FX.flashScreen(8, "255,240,210");
    FX.shockwave(x, y, 120 * scale, "255,230,160", 7);
    FX.shockwave(x, y, 70 * scale, "255,255,255", 4);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * 7, s = (2 + Math.random() * 7) * scale;
      const col = Math.random() < 0.4 ? "255,255,210" : (Math.random() < 0.6 ? "255,170,60" : "255,80,30");
      particle(x, y, Math.cos(a) * s, Math.sin(a) * s, 24 + Math.random() * 26, 10 * scale, 0, col, true, 0.02, 0.93);
    }
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * 7, s = (3 + Math.random() * 8) * scale;
      particle(x, y, Math.cos(a) * s, Math.sin(a) * s, 40 + Math.random() * 30, 4, 0, "210,220,230", false, 0.2, 0.97);
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * 7, s = (0.5 + Math.random() * 2) * scale;
      const p = particle(x, y, Math.cos(a) * s, Math.sin(a) * s - 0.5, 60 + Math.random() * 40, 14 * scale, 40 * scale, "50,50,60", false, -0.02, 0.96);
      p.smoke = true;
    }
    FX.addShake(14); FX.addHitStop(4);
  };

  FX.engineTrail = function (x, y, col) {
    trails.push({ x, y, life: 10, max: 10, r: 5 + Math.random() * 3, col: col || "120,200,255" });
    if (trails.length > 600) trails.splice(0, 200);
  };
  FX.smokeTrail = function (x, y) {
    const p = particle(x + (Math.random()-0.5)*4, y, (Math.random()-0.5)*0.4, (Math.random()-0.5)*0.4, 28, 4, 12, "90,90,100", false, -0.01, 0.95);
    p.smoke = true;
  };

  FX.update = function () {
    parts.forEach((p) => {
      p.life--;
      if (p.life <= 0) { p._dead = true; return; }
      p.vx *= p.drag; p.vy *= p.drag; p.vy += p.grav;
      p.x += p.vx; p.y += p.vy;
    });
    parts.sweep();
    rings.forEach((r) => { r.life--; if (r.life <= 0) r._dead = true; });
    rings.sweep();
    flashes.forEach((f) => { f.life--; if (f.life <= 0) f._dead = true; });
    flashes.sweep();
    for (let i = trails.length - 1; i >= 0; i--) { if (--trails[i].life <= 0) trails.splice(i, 1); }
    if (FX.shake > 0) FX.shake *= 0.86; if (FX.shake < 0.2) FX.shake = 0;
    if (FX._flashScreen > 0) FX._flashScreen--;
  };

  FX.draw = function (g) {
    // trails (additive)
    g.globalCompositeOperation = "lighter";
    for (const t of trails) {
      const a = t.life / t.max;
      const grd = g.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r * (0.6 + a));
      grd.addColorStop(0, `rgba(${t.col},${0.5 * a})`);
      grd.addColorStop(1, `rgba(${t.col},0)`);
      g.fillStyle = grd; g.beginPath(); g.arc(t.x, t.y, t.r * (0.6 + a), 0, 7); g.fill();
    }

    // particles
    parts.forEach((p) => {
      const t = 1 - p.life / p.max;
      const r = U.lerp(p.r0, p.r1, t);
      const a = p.smoke ? (1 - t) * 0.5 : (1 - t);
      if (p.add) {
        g.globalCompositeOperation = "lighter";
        const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        grd.addColorStop(0, `rgba(${p.col},${a})`);
        grd.addColorStop(0.5, `rgba(${p.col},${a * 0.6})`);
        grd.addColorStop(1, `rgba(${p.col},0)`);
        g.fillStyle = grd;
      } else {
        g.globalCompositeOperation = "source-over";
        if (p.smoke) {
          const grd = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          grd.addColorStop(0, `rgba(${p.col},${a})`);
          grd.addColorStop(1, `rgba(${p.col},0)`);
          g.fillStyle = grd;
        } else {
          g.fillStyle = `rgba(${p.col},${a})`;
        }
      }
      g.beginPath(); g.arc(p.x, p.y, Math.max(0.5, r), 0, 7); g.fill();
    });

    // shockwave rings
    g.globalCompositeOperation = "lighter";
    rings.forEach((r) => {
      const t = 1 - r.life / r.max;
      const rad = U.lerp(r.r, r.r1, t);
      g.strokeStyle = `rgba(${r.col},${(1 - t) * 0.8})`;
      g.lineWidth = r.lw * (1 - t * 0.7);
      g.beginPath(); g.arc(r.x, r.y, rad, 0, 7); g.stroke();
    });

    // muzzle flashes
    flashes.forEach((f) => {
      const a = f.life / f.max;
      g.save(); g.translate(f.x, f.y); g.rotate(f.dir);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, f.size * (0.7 + a));
      grd.addColorStop(0, `rgba(255,255,255,${a})`);
      grd.addColorStop(0.4, `rgba(${f.col},${a * 0.9})`);
      grd.addColorStop(1, `rgba(${f.col},0)`);
      g.fillStyle = grd; g.beginPath(); g.arc(0, 0, f.size * (0.7 + a), 0, 7); g.fill();
      // star spike
      g.fillStyle = `rgba(255,255,255,${a})`;
      g.beginPath(); g.moveTo(0, -2); g.lineTo(f.size * (1 + a), 0); g.lineTo(0, 2); g.lineTo(-f.size * 0.4, 0); g.closePath(); g.fill();
      g.restore();
    });

    g.globalCompositeOperation = "source-over";
  };

  FX.drawScreenFlash = function (g) {
    if (FX._flashScreen > 0) {
      g.fillStyle = `rgba(${FX._flashCol},${FX._flashScreen / 14})`;
      g.fillRect(0, 0, NL.W, NL.H);
    }
  };

})();
