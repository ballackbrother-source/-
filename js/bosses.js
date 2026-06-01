/* ============================================================
   bosses.js : three stage bosses. Design rule (per spec):
   the CORE weak point is ALWAYS hittable — armour parts never
   occupy the core's hit region, and core hit-tests take priority
   over armour, so a shot on the core ALWAYS deals damage.
   ============================================================ */
(function () {
  "use strict";
  const NL = window.NL;
  const U = NL.util;
  const FX = NL.fx;
  const WP = NL.weapons;

  // ---------- procedural boss body drawing ----------
  function drawHull(g, w, h, c1, c2, accent) {
    const grd = g.createLinearGradient(0, -h / 2, 0, h / 2);
    grd.addColorStop(0, c1); grd.addColorStop(0.5, c2); grd.addColorStop(1, "#10161c");
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(-w / 2, -h / 2 + 20);
    g.lineTo(w / 2 - 30, -h / 2);
    g.lineTo(w / 2, 0);
    g.lineTo(w / 2 - 30, h / 2);
    g.lineTo(-w / 2, h / 2 - 20);
    g.lineTo(-w / 2 - 18, 0);
    g.closePath(); g.fill();
    g.strokeStyle = "rgba(0,0,0,.6)"; g.lineWidth = 3; g.stroke();
    // panel lines
    g.strokeStyle = "rgba(0,0,0,.3)"; g.lineWidth = 1;
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(-w / 2, i * h / 6); g.lineTo(w / 2 - 20, i * h / 6); g.stroke(); }
    // accent stripe
    g.fillStyle = accent; g.fillRect(-w / 2, h / 2 - 24, w * 0.7, 6);
  }

  class Boss {
    constructor(cfg, game) {
      this.cfg = cfg;
      this.name = cfg.name;
      this.x = NL.W + 220; this.y = NL.H / 2;
      this.tx = cfg.tx || NL.W - 260; this.ty = NL.H / 2;
      this.w = cfg.w; this.h = cfg.h;
      const hpMul = (NL.diff && NL.diff.bossHp) || 1; // difficulty: boss durability
      this.maxhp = Math.round(cfg.hp * hpMul); this.hp = this.maxhp;
      this.t = 0; this.flash = 0; this.entering = true;
      this.dead = false; this.dying = 0;
      this.bob = 0;
      this.phase = 0;       // escalates as HP drops
      this.patIdx = 0; this.patT = 0;
      this.game = game;
      // parts: core(s) + armour, positions relative to boss center
      this.parts = cfg.parts.map((p) => Object.assign({ hp: p.maxhp || 9999, destroyed: false, flash: 0 }, p));
      this.warnedRush = false;
    }

    get core() { return this.parts.find((p) => p.type === "core"); }

    update(game) {
      this.t++;
      if (this.flash > 0) this.flash--;
      for (const p of this.parts) if (p.flash > 0) p.flash--;

      if (this.dying > 0) { this.updateDying(game); return; }

      // entrance
      if (this.entering) {
        this.x += (this.tx - this.x) * 0.04;
        if (Math.abs(this.x - this.tx) < 4) { this.x = this.tx; this.entering = false; }
        return;
      }

      this.bob += 0.02;
      this.y = this.ty + Math.sin(this.bob) * 70;

      // phase escalation
      const frac = this.hp / this.maxhp;
      const newPhase = frac < 0.33 ? 2 : frac < 0.66 ? 1 : 0;
      if (newPhase !== this.phase) { this.phase = newPhase; this.patT = 0; this.patIdx = 0; if (newPhase === 2) { game.toast("BERSERK!"); NL.audio.sfx.warn(); } }

      // run attack pattern
      this.patT++;
      this.cfg.ai(this, game);
    }

    updateDying(game) {
      this.dying--;
      // wandering death throes with explosions
      this.x += Math.sin(this.t * 0.2) * 0.6;
      if (this.dying % 4 === 0) {
        const ex = this.x + (Math.random() - 0.5) * this.w;
        const ey = this.y + (Math.random() - 0.5) * this.h;
        FX.explode(ex, ey, 1.4);
        NL.audio.sfx.enemyDie();
      }
      if (this.dying === 1) {
        FX.bigExplode(this.x, this.y, 3.2);
        NL.audio.sfx.bigBoom();
        this.dead = true;
        game.onBossDead();
      }
    }

    // world-space part position
    partPos(p) { return { x: this.x + p.ox, y: this.y + p.oy }; }

    // Hit test for a projectile at (x,y,r). Core takes PRIORITY so it is
    // never blocked by armour. Returns the part hit or null.
    hitTest(x, y, r) {
      const core = this.core;
      if (core && !this.entering) {
        const cp = this.partPos(core);
        if (U.circleHit(x, y, r, cp.x, cp.y, core.r)) return core;
      }
      for (const p of this.parts) {
        if (p.type === "core" || p.destroyed) continue;
        const pp = this.partPos(p);
        if (U.circleHit(x, y, r, pp.x, pp.y, p.r)) return p;
      }
      return null;
    }

    // ray (laser) cast: returns x of first hit along horizontal beam at y
    laserCast(x0, y) {
      let best = null;
      const test = (px, py, pr, isCore) => {
        if (Math.abs(py - y) <= pr) {
          const dx = Math.sqrt(Math.max(0, pr * pr - (py - y) * (py - y)));
          const hx = px - dx;
          if (hx >= x0 && (best == null || hx < best)) best = hx;
        }
      };
      const core = this.core;
      if (core && !this.entering) { const cp = this.partPos(core); test(cp.x, cp.y, core.r, true); }
      for (const p of this.parts) { if (p.type === "core" || p.destroyed) continue; const pp = this.partPos(p); test(pp.x, pp.y, p.r); }
      return best;
    }

    damagePart(part, dmg, game) {
      if (this.entering || this.dying > 0) return;
      if (part.type === "core") {
        this.hp -= dmg; this.flash = 3; if (this.core) this.core.flash = 3;
        NL.audio.sfx.bossHit();
        const cp = this.partPos(this.core);
        FX.spark(cp.x + (Math.random() - .5) * 20, cp.y + (Math.random() - .5) * 20, 3, "255,240,180", 4);
        if (this.hp <= 0) this.beginDeath(game);
      } else {
        part.hp -= dmg; part.flash = 3;
        NL.audio.sfx.hit();
        if (part.hp <= 0 && !part.destroyed) {
          part.destroyed = true;
          const pp = this.partPos(part);
          FX.explode(pp.x, pp.y, 1.4);
          game.addScore(500);
          FX.floatText(pp.x, pp.y, "+500", "255,200,120", 20);
        }
      }
    }

    beginDeath(game) {
      this.hp = 0; this.dying = 120; this.entering = false;
      FX.flashScreen(12, "255,240,210");
      game.bossDefeatedFlag = true;
    }

    // contact damage check vs player
    checkPlayer(game) {
      if (this.entering || this.dying > 0) return;
      const pl = game.player; if (!pl.alive || pl.invuln > 0) return;
      for (const p of this.parts) {
        if (p.destroyed) continue;
        const pp = this.partPos(p);
        for (const b of pl.bodies()) if (U.circleHit(pp.x, pp.y, p.r * 0.85, b.x, b.y, b.r)) { pl.hit(game); return; }
      }
    }

    draw(g) {
      if (this.dead) return;
      g.save();
      g.translate(this.x, this.y);
      // hit flash tint via global
      const fl = this.flash > 0;
      // body
      this.cfg.drawBody(g, this);
      g.restore();

      // parts overlay (armour + glowing core)
      for (const p of this.parts) {
        if (p.destroyed) continue;
        const pp = this.partPos(p);
        if (p.type === "core") {
          // exposed glowing weak point
          g.globalCompositeOperation = "lighter";
          const pulse = 0.6 + 0.4 * Math.sin(this.t * 0.12);
          const col = this.phase === 2 ? "255,120,60" : "120,230,255";
          const grd = g.createRadialGradient(pp.x, pp.y, 0, pp.x, pp.y, p.r * 1.8);
          grd.addColorStop(0, `rgba(255,255,255,${0.9})`);
          grd.addColorStop(0.4, `rgba(${col},${0.9 * pulse})`);
          grd.addColorStop(1, `rgba(${col},0)`);
          g.fillStyle = grd; g.beginPath(); g.arc(pp.x, pp.y, p.r * 1.8, 0, 7); g.fill();
          g.globalCompositeOperation = "source-over";
          g.fillStyle = p.flash > 0 ? "#fff" : `rgba(${col},1)`;
          g.beginPath(); g.arc(pp.x, pp.y, p.r * 0.6, 0, 7); g.fill();
          // iris ring
          g.strokeStyle = "rgba(20,30,40,.9)"; g.lineWidth = 4;
          g.beginPath(); g.arc(pp.x, pp.y, p.r, 0, 7); g.stroke();
        } else {
          // armour plate
          g.save(); g.translate(pp.x, pp.y);
          const grd = g.createLinearGradient(0, -p.r, 0, p.r);
          grd.addColorStop(0, "#8a929c"); grd.addColorStop(0.5, "#4a525c"); grd.addColorStop(1, "#222831");
          g.fillStyle = p.flash > 0 ? "#dfe9f2" : grd;
          g.beginPath(); g.arc(0, 0, p.r, 0, 7); g.fill();
          g.strokeStyle = "rgba(0,0,0,.6)"; g.lineWidth = 3; g.stroke();
          // gun port
          g.fillStyle = "#11161b"; g.fillRect(-p.r - 4, -5, 8, 10);
          // hp pip
          if (p.maxhp && p.hp < p.maxhp) {
            g.fillStyle = "rgba(0,0,0,.5)"; g.fillRect(-20, -p.r - 12, 40, 4);
            g.fillStyle = "#ffb02a"; g.fillRect(-20, -p.r - 12, 40 * (p.hp / p.maxhp), 4);
          }
          g.restore();
        }
      }
      if (fl) { /* extra: core flash already handled */ }
    }

    // ---- pattern helpers exposed to ai() ----
    aimAt(px, py, spd, col) {
      const cp = this.partPos(this.core);
      const a = U.angleTo(cp.x, cp.y, px, py);
      WP.spawnEnemyBullet(cp.x, cp.y, Math.cos(a) * spd, Math.sin(a) * spd, { col: col || "255,120,90", r: 8 });
    }
    ring(n, spd, off, col) {
      const cp = this.partPos(this.core);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (off || 0);
        WP.spawnEnemyBullet(cp.x, cp.y, Math.cos(a) * spd, Math.sin(a) * spd, { col: col || "255,150,90", r: 7 });
      }
    }
    fanAt(px, py, n, spread, spd, col) {
      const cp = this.partPos(this.core);
      const a0 = U.angleTo(cp.x, cp.y, px, py);
      for (let i = 0; i < n; i++) {
        const a = a0 + (i - (n - 1) / 2) * spread;
        WP.spawnEnemyBullet(cp.x, cp.y, Math.cos(a) * spd, Math.sin(a) * spd, { col: col || "255,120,150", r: 7 });
      }
    }
    fromPart(part, vx, vy, col) {
      const pp = this.partPos(part);
      WP.spawnEnemyBullet(pp.x, pp.y, vx, vy, { col: col || "255,150,80", r: 7 });
      FX.muzzle(pp.x, pp.y, Math.atan2(vy, vx), "255,150,90");
    }
  }

  // =========================================================
  //  BOSS CONFIGS
  // =========================================================
  const CFG = {};

  // --- Stage 1: GUARDIAN — heavy gunship, two destructible turrets ---
  CFG[0] = {
    name: "GA-01 GUARDIAN", hp: 220, w: 200, h: 220, tx: NL.W - 240,
    parts: [
      { type: "core", ox: -60, oy: 0, r: 30 },
      { type: "armor", ox: 40, oy: -90, r: 36, maxhp: 30 },
      { type: "armor", ox: 40, oy: 90, r: 36, maxhp: 30 }
    ],
    drawBody(g, b) { drawHull(g, b.w, b.h, "#6f7c88", "#3c4651", "#36e0ff"); },
    ai(b, game) {
      const pl = game.player, p = b.phase;
      const period = p === 2 ? 26 : p === 1 ? 36 : 50;
      if (b.patT % period === 0) {
        b.fanAt(pl.x, pl.y, 3 + p, 0.18, 3.4 + p * 0.5, "255,150,80");
      }
      // turret aimed shots
      for (const part of b.parts) if (part.type === "armor" && !part.destroyed && b.patT % (70 - p * 12) === 0) {
        const pp = b.partPos(part); const a = U.angleTo(pp.x, pp.y, pl.x, pl.y);
        b.fromPart(part, Math.cos(a) * 4.2, Math.sin(a) * 4.2, "255,120,90");
      }
      if (p >= 1 && b.patT % 160 === 0) for (let k = 0; k < 18; k++) b.ring(18, 2.6, b.patT * 0.02, "255,170,90");
    }
  };

  // --- Stage 2: BISECTOR — rotating ring guns, exposed core ---
  CFG[1] = {
    name: "BX-07 BISECTOR", hp: 300, w: 220, h: 200, tx: NL.W - 260,
    parts: [
      { type: "core", ox: -50, oy: 0, r: 32 },
      { type: "armor", ox: 60, oy: 0, r: 44, maxhp: 40 },
      { type: "armor", ox: 10, oy: -80, r: 28, maxhp: 22 },
      { type: "armor", ox: 10, oy: 80, r: 28, maxhp: 22 }
    ],
    drawBody(g, b) { drawHull(g, b.w, b.h, "#7c6f88", "#46384f", "#c060ff"); },
    ai(b, game) {
      const pl = game.player, p = b.phase;
      // rotating rings
      if (b.patT % (10 - p * 2) === 0) b.ring(8, 3 + p * 0.4, b.t * 0.04, "200,120,255");
      // aimed bursts
      if (b.patT % (90 - p * 20) === 0) b.fanAt(pl.x, pl.y, 5 + p * 2, 0.14, 4, "255,120,200");
      // side spirals on phase 2
      if (p === 2 && b.patT % 4 === 0) { b.ring(2, 4, b.t * 0.18, "255,160,220"); }
    }
  };

  // --- Stage 3: OVERLORD CORE — final, multi-armour, escalating ---
  CFG[2] = {
    name: "OV-00 OVERLORD CORE", hp: 420, w: 260, h: 280, tx: NL.W - 300,
    parts: [
      { type: "core", ox: -70, oy: 0, r: 30 },
      { type: "armor", ox: 50, oy: -110, r: 34, maxhp: 45 },
      { type: "armor", ox: 50, oy: 110, r: 34, maxhp: 45 },
      { type: "armor", ox: 90, oy: 0, r: 50, maxhp: 70 }
    ],
    drawBody(g, b) { drawHull(g, b.w, b.h, "#88706f", "#4f3838", "#ff5a2c"); },
    ai(b, game) {
      const pl = game.player, p = b.phase;
      // wall of bullets with a gap (learnable)
      if (b.patT % (70 - p * 14) === 0) {
        const gap = U.randInt(1, 5);
        const cp = b.partPos(b.core);
        for (let i = 0; i < 7; i++) { if (i === gap) continue; const yy = -240 + i * 80; WP.spawnEnemyBullet(cp.x, cp.y, -3.4 - p * 0.4, yy * 0.012, { col: "255,140,80", r: 8 }); }
      }
      // aimed needles
      if (b.patT % (40 - p * 8) === 0) b.fanAt(pl.x, pl.y, 3, 0.1, 5 + p, "255,90,90");
      // ring nova
      if (b.patT % (120 - p * 20) === 0) for (let k = 0; k < 2; k++) b.ring(24, 2.4 + k, b.t * 0.03 + k, "255,170,90");
      // berserk spiral
      if (p === 2 && b.patT % 3 === 0) b.ring(3, 3.6, b.t * 0.22, "255,80,40");
    }
  };

  NL.bosses = {
    make(stageIdx, game) { return new Boss(CFG[stageIdx], game); },
    CFG
  };
})();
