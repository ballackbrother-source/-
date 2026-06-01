/* ============================================================
   player.js : the player fighter. Movement w/ banking + afterimage,
   pulsing engine flame, all weapon modes, trailing OPTIONs,
   front SHIELD, hit / death / respawn.
   ============================================================ */
(function () {
  "use strict";
  const NL = window.NL;
  const U = NL.util;
  const FX = NL.fx;
  const WP = NL.weapons;

  class Player {
    constructor() { this.reset(); }

    reset() {
      this.x = 180; this.y = NL.H / 2;
      this.r = 16;
      this.alive = true;
      this.baseSpeed = 4.4;
      this.speedLv = 0;
      this.applySpeed();
      this.weapon = "vulcan";
      this.missile = false;
      this.options = [];
      this.shield = 0; this.shieldMax = 0;
      this.meter = 0; this.meterArmed = false;
      this.invuln = 120;
      this.fireCd = 0; this.missileCd = 0;
      this.bank = 0;
      this.history = [];     // for option following & afterimage
      this.enginePhase = 0;
      this.laserActive = false;
      this.laserEnd = { x: 0, y: 0 };
    }

    // called after losing a life: keep some upgrades? Classic = lose all.
    onRespawn() {
      this.alive = true;
      this.x = 180; this.y = NL.H / 2;
      this.invuln = 150;
      this.weapon = "vulcan"; this.missile = false;
      this.options = []; this.shield = 0;
      this.speedLv = 0; this.applySpeed();
      this.meter = 0; this.meterArmed = false;
      this.history = [];
    }

    applySpeed() { this.speed = this.baseSpeed + this.speedLv * 1.0; }

    addOption() {
      this.options.push({ x: this.x, y: this.y, delay: 12 * (this.options.length + 1) });
    }

    update(game) {
      const In = NL.input;
      if (!this.alive) return;

      // ---- movement ----
      let dx = 0, dy = 0;
      if (In.up) dy -= 1; if (In.down) dy += 1;
      if (In.left) dx -= 1; if (In.right) dx += 1;

      // pointer / touch movement
      if (In.isTouch && In.touchDelta) {
        this.x += In.touchDelta.dx * 1.4;
        this.y += In.touchDelta.dy * 1.4;
        In.touchDelta = null;
      } else if (!In.isTouch && In.moveTarget && (In.fire || In.moveActive)) {
        // mouse steering: glide toward cursor
        const a = U.angleTo(this.x, this.y, In.moveTarget.x, In.moveTarget.y);
        const d = U.dist(this.x, this.y, In.moveTarget.x, In.moveTarget.y);
        if (d > 4) { const s = Math.min(this.speed, d); this.x += Math.cos(a) * s; this.y += Math.sin(a) * s; }
      }
      if (dx || dy) {
        const len = Math.hypot(dx, dy) || 1;
        this.x += (dx / len) * this.speed;
        this.y += (dy / len) * this.speed;
      }

      // banking from vertical velocity input
      const targetBank = dy * 0.5 + (In.touchDelta ? 0 : 0);
      this.bank = U.lerp(this.bank, targetBank, 0.2);

      this.x = U.clamp(this.x, 40, NL.W - 40);
      this.y = U.clamp(this.y, 30, NL.H - 30);

      // history for options & afterimage
      this.history.unshift({ x: this.x, y: this.y });
      if (this.history.length > 80) this.history.pop();

      // options follow older positions
      for (let i = 0; i < this.options.length; i++) {
        const o = this.options[i];
        const h = this.history[Math.min(this.history.length - 1, o.delay)];
        if (h) { o.x = h.x; o.y = h.y; }
      }

      // ---- engine / idle life ----
      this.enginePhase += 0.3;
      const ex = this.x - 60, ey = this.y + this.bank * 6;
      if (game.frame % 2 === 0) FX.engineTrail(ex, ey, "90,190,255");
      FX.particle(ex - 4, ey, -2 - Math.random() * 2, (Math.random() - 0.5) * 0.6,
        10, 4 + Math.sin(this.enginePhase) * 1.5, 0, "120,210,255", true, 0, 0.9);

      // ---- firing ----
      this.laserActive = false;
      if (this.fireCd > 0) this.fireCd--;
      if (this.missileCd > 0) this.missileCd--;

      if (In.fire) this.fire(game);

      if (this.invuln > 0) this.invuln--;
    }

    fire(game) {
      const gunX = this.x + 58, gunY = this.y;
      if (this.weapon === "laser") {
        this.fireLaser(game, gunX, gunY);
      } else if (this.fireCd <= 0) {
        switch (this.weapon) {
          case "vulcan": this.shootVulcan(gunX, gunY); this.fireCd = 7; break;
          case "double": this.shootDouble(gunX, gunY); this.fireCd = 8; break;
          case "spread": this.shootSpread(gunX, gunY); this.fireCd = 9; break;
        }
        NL.audio.sfx[this.weapon === "spread" ? "spread" : this.weapon === "double" ? "double" : "shot"]();
        FX.muzzle(gunX + 4, gunY, 0, "150,230,255");
      }
      // missiles
      if (this.missile && this.missileCd <= 0) {
        WP.spawnMissile(this.x + 20, this.y + 10, 0.6);
        NL.audio.sfx.missile();
        this.missileCd = 26;
      }
    }

    optionGuns(cb) {
      for (const o of this.options) cb(o.x + 30, o.y);
    }

    shootVulcan(x, y) {
      WP.spawnShot(x, y, 17, 0, { r: 5, dmg: 1, kind: "streak", len: 26, col: "120,220,255" });
      this.optionGuns((ox, oy) => WP.spawnShot(ox, oy, 17, 0, { r: 4, dmg: 1, kind: "streak", len: 20 }));
    }
    shootDouble(x, y) {
      WP.spawnShot(x, y, 17, 0, { r: 5, dmg: 1, kind: "streak", len: 24 });
      WP.spawnShot(x, y, 14, -8, { r: 5, dmg: 1, kind: "streak", len: 22, col: "150,230,255" });
      this.optionGuns((ox, oy) => { WP.spawnShot(ox, oy, 17, 0, { r: 4, dmg: 1, kind: "streak" }); WP.spawnShot(ox, oy, 14, -8, { r: 4, dmg: 1, kind: "streak" }); });
    }
    shootSpread(x, y) {
      for (const ang of [-0.32, 0, 0.32]) WP.spawnShot(x, y, Math.cos(ang) * 16, Math.sin(ang) * 16, { r: 5, dmg: 1, col: "150,255,200" });
      this.optionGuns((ox, oy) => { for (const ang of [-0.32, 0, 0.32]) WP.spawnShot(ox, oy, Math.cos(ang) * 16, Math.sin(ang) * 16, { r: 4, dmg: 1, col: "150,255,200" }); });
    }

    fireLaser(game, x, y) {
      WP.laser.on = true; WP.laser.power = 1 + this.speedLv * 0.4;
      this.laserActive = true;
      // raycast to first enemy / boss hit, else screen edge
      let end = NL.W + 20;
      const hit = game.laserCast(x, y);
      if (hit != null) end = hit;
      this.laserEnd = { x: end, y: y };
      this._laserY = y; this._laserX = x;
      if (game.frame % 4 === 0) NL.audio.sfx.laser();
      // option lasers
      this._optionLasers = this.options.map((o) => ({ x: o.x + 30, y: o.y, end: game.laserCast(o.x + 30, o.y) || NL.W + 20 }));
    }

    // damage / death
    hit(game) {
      if (this.invuln > 0 || !this.alive) return false;
      if (this.shield > 0) {
        this.shield--; NL.audio.sfx.shieldHit();
        FX.shockwave(this.x, this.y, 50, "120,220,255", 4);
        this.invuln = 30;
        return false;
      }
      this.alive = false;
      FX.bigExplode(this.x, this.y, 1.4);
      NL.audio.sfx.playerHit();
      game.onPlayerDeath();
      return true;
    }

    draw(g) {
      if (!this.alive) return;
      const img = NL.assets.images.player;
      const blink = this.invuln > 0 && (Math.floor(this.invuln / 4) % 2 === 0);

      // afterimage
      g.globalCompositeOperation = "lighter";
      for (let i = 6; i < 26; i += 6) {
        const h = this.history[i]; if (!h) continue;
        g.globalAlpha = 0.10 * (1 - i / 30);
        this.drawShip(g, img, h.x, h.y, this.bank * 0.6);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";

      // options (drawn behind/around)
      const oimg = NL.assets.images.option;
      for (const o of this.options) {
        if (oimg) g.drawImage(oimg, o.x - oimg.width / 2, o.y - oimg.height / 2);
      }

      // shield
      if (this.shield > 0) {
        g.globalCompositeOperation = "lighter";
        const t = NL.game.frame * 0.1;
        for (let k = 0; k < this.shield; k++) {
          const rr = this.r + 16 + k * 6;
          g.strokeStyle = `rgba(120,220,255,${0.35 + 0.2 * Math.sin(t + k)})`;
          g.lineWidth = 2.5; g.beginPath(); g.arc(this.x, this.y, rr, 0, 7); g.stroke();
        }
        g.globalCompositeOperation = "source-over";
      }

      if (!blink) this.drawShip(g, img, this.x, this.y, this.bank);

      // engine flame glow (pulsing)
      g.globalCompositeOperation = "lighter";
      const fp = 1 + 0.3 * Math.sin(this.enginePhase);
      const ex = this.x - 58, ey = this.y + this.bank * 6;
      const grd = g.createRadialGradient(ex, ey, 0, ex, ey, 26 * fp);
      grd.addColorStop(0, "rgba(220,245,255,0.9)");
      grd.addColorStop(0.4, "rgba(90,190,255,0.6)");
      grd.addColorStop(1, "rgba(90,190,255,0)");
      g.fillStyle = grd; g.beginPath(); g.arc(ex, ey, 26 * fp, 0, 7); g.fill();
      g.globalCompositeOperation = "source-over";
    }

    drawShip(g, img, x, y, bank) {
      g.save();
      g.translate(x, y);
      g.rotate(bank * 0.18);
      if (img) {
        const w = 100, h = w * (img.height / img.width);
        g.drawImage(img, -w * 0.55, -h / 2, w, h);
      } else {
        g.fillStyle = "#8cf"; g.fillRect(-20, -10, 40, 20);
      }
      g.restore();
    }

    // damage hitbox = main body only. OPTIONs are invincible (Gradius rule),
    // so they never trigger the player's death.
    bodies() {
      return [{ x: this.x, y: this.y, r: this.r }];
    }
  }

  NL.Player = Player;
})();
