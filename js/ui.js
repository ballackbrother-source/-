/* ============================================================
   ui.js : HUD (score, lives, power meter, boss HP), title screen,
   pause / continue / game-over / stage-clear overlays, toasts and
   "learned trap" warning banners.
   ============================================================ */
(function () {
  "use strict";
  const NL = window.NL;
  const U = NL.util;
  const UI = (NL.ui = {});

  function txt(g, s, x, y, size, col, align, weight) {
    g.font = `${weight || 700} ${size}px "Segoe UI", Roboto, sans-serif`;
    g.textAlign = align || "left"; g.textBaseline = "alphabetic";
    g.fillStyle = col; g.fillText(s, x, y);
  }
  function glowTxt(g, s, x, y, size, col, glow, align) {
    g.save(); g.shadowColor = glow; g.shadowBlur = 18;
    txt(g, s, x, y, size, col, align, 800); g.restore();
  }

  UI.drawHUD = function (g, game) {
    // top bar
    g.fillStyle = "rgba(4,8,16,0.55)"; g.fillRect(0, 0, NL.W, 46);
    g.strokeStyle = "rgba(80,160,220,.3)"; g.beginPath(); g.moveTo(0, 46); g.lineTo(NL.W, 46); g.stroke();

    glowTxt(g, "SCORE", 22, 22, 13, "#7fb8e0", "rgba(54,224,255,.5)");
    glowTxt(g, String(game.score).padStart(8, "0"), 22, 40, 20, "#eaf6ff", "rgba(54,224,255,.6)");

    // hi-score
    glowTxt(g, "HI " + String(game.hiScore).padStart(8, "0"), NL.W / 2, 30, 16, "#ffd070", "rgba(255,180,60,.4)", "center");

    // lives
    const img = NL.assets.images.player;
    for (let i = 0; i < game.lives; i++) {
      if (img) { const w = 30, h = w * img.height / img.width; g.drawImage(img, NL.W - 40 - i * 40, 12, w, h); }
    }
    txt(g, "x" + game.lives, NL.W - 150, 32, 16, "#cfe9ff", "right");

    // stage label
    glowTxt(g, game.stageName, NL.W - 22, 40, 13, "#9fd0ff", "rgba(54,224,255,.4)", "right");

    // power meter
    UI.drawMeter(g, game);

    // boss bar
    if (game.boss && !game.boss.dead) UI.drawBossBar(g, game.boss);

    // mini-boss bar (scan active enemies for one flagged isMiniboss)
    if (!game.boss) {
      let mb = null;
      NL.enemies.pool.forEach((e) => { if (e.isMiniboss && !e.leaving) mb = e; });
      if (mb) UI.drawMiniBossBar(g, mb);
    }

    // warning banner
    if (game.warnTimer > 0) {
      const a = Math.min(1, game.warnTimer / 30) * (0.6 + 0.4 * Math.sin(game.frame * 0.4));
      g.fillStyle = `rgba(120,20,10,${0.5 * a})`; g.fillRect(0, NL.H * 0.32, NL.W, 60);
      glowTxt(g, "⚠ " + game.warnText + " ⚠", NL.W / 2, NL.H * 0.32 + 40, 30, "#ffd23a", "rgba(255,120,40,.8)", "center");
    }

    // toast
    if (game.toastTimer > 0) {
      const a = Math.min(1, game.toastTimer / 20);
      g.globalAlpha = a;
      glowTxt(g, game.toastText, NL.W / 2, NL.H * 0.24, 34, "#aef0ff", "rgba(54,224,255,.9)", "center");
      g.globalAlpha = 1;
    }
  };

  UI.drawMeter = function (g, game) {
    const slots = NL.powerups.SLOTS;
    const n = slots.length;
    const w = 92, h = 26, gap = 6;
    const total = n * w + (n - 1) * gap;
    const x0 = (NL.W - total) / 2, y0 = NL.H - 40;
    const cur = game.player.meter; // 1..n, 0 = none
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (w + gap);
      const active = (i + 1) === cur;
      g.fillStyle = active ? "rgba(54,224,255,.85)" : "rgba(10,24,40,.7)";
      g.strokeStyle = active ? "#eaffff" : "rgba(90,150,200,.5)";
      g.lineWidth = active ? 2.5 : 1;
      roundRect(g, x, y0, w, h, 5); g.fill(); g.stroke();
      txt(g, slots[i], x + w / 2, y0 + 17, 12, active ? "#03121e" : "#9fc4dd", "center", 800);
    }
    if (game.player.meterArmed && cur > 0) {
      glowTxt(g, "▲ POWER で発動", x0 + total / 2, y0 - 8, 12, "#ffd070", "rgba(255,180,60,.6)", "center");
    }
  };

  UI.drawBossBar = function (g, boss) {
    const w = NL.W * 0.6, x = (NL.W - w) / 2, y = 58;
    g.fillStyle = "rgba(0,0,0,.5)"; roundRect(g, x - 2, y - 2, w + 4, 22, 4); g.fill();
    const frac = Math.max(0, boss.hp / boss.maxhp);
    const grd = g.createLinearGradient(x, 0, x + w, 0);
    grd.addColorStop(0, "#ff3a2a"); grd.addColorStop(0.5, "#ff7a2a"); grd.addColorStop(1, "#ffd23a");
    g.fillStyle = grd; roundRect(g, x, y, w * frac, 18, 4); g.fill();
    if (boss.flash > 0) { g.fillStyle = "rgba(255,255,255,.6)"; roundRect(g, x, y, w * frac, 18, 4); g.fill(); }
    g.strokeStyle = "rgba(255,200,160,.7)"; g.lineWidth = 1.5; roundRect(g, x, y, w, 18, 4); g.stroke();
    glowTxt(g, boss.name, NL.W / 2, y - 6, 14, "#ffd6c0", "rgba(255,80,40,.7)", "center");
  };

  UI.drawMiniBossBar = function (g, e) {
    const w = NL.W * 0.42, x = (NL.W - w) / 2, y = 84;
    g.fillStyle = "rgba(0,0,0,.45)"; roundRect(g, x - 2, y - 2, w + 4, 16, 3); g.fill();
    const frac = Math.max(0, e.hp / e.maxhp);
    const grd = g.createLinearGradient(x, 0, x + w, 0);
    grd.addColorStop(0, "#ff8a2a"); grd.addColorStop(1, "#ffd23a");
    g.fillStyle = grd; roundRect(g, x, y, w * frac, 12, 3); g.fill();
    if (e.flash > 0) { g.fillStyle = "rgba(255,255,255,.6)"; roundRect(g, x, y, w * frac, 12, 3); g.fill(); }
    g.strokeStyle = "rgba(255,200,160,.6)"; g.lineWidth = 1; roundRect(g, x, y, w, 12, 3); g.stroke();
    glowTxt(g, "◈ " + (e.name || "MINI-BOSS"), NL.W / 2, y - 4, 12, "#ffe0c0", "rgba(255,120,40,.6)", "center");
  };

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  UI.roundRect = roundRect;

  // ---------- TITLE ----------
  UI.drawTitle = function (g, game) {
    const t = game.frame;
    // animated bg
    game.bg.draw(g, t * 1.2, t);
    g.fillStyle = "rgba(2,6,14,0.35)"; g.fillRect(0, 0, NL.W, NL.H);

    // title
    glowTxt(g, "NOVA LANCE", NL.W / 2, NL.H * 0.36, 86, "#eaf6ff", "rgba(54,224,255,.9)", "center");
    glowTxt(g, "B U R N I N G   S K I E S", NL.W / 2, NL.H * 0.45, 26, "#36e0ff", "rgba(54,224,255,.7)", "center");

    // difficulty selector
    UI.drawDiffMenu(g, game);

    // prompt blink
    if (Math.floor(t / 30) % 2 === 0) {
      glowTxt(g, game.input.isTouch ? "難易度をタップ → 画面タップでSTART" : "← → で難易度選択    ENTER / Z / CLICK で START",
        NL.W / 2, NL.H * 0.74, 20, "#ffd070", "rgba(255,180,60,.7)", "center");
    }
    txt(g, "ARROWS / WASD 移動    Z / SPACE FIRE    X / SHIFT POWER    P 一時停止    M ミュート", NL.W / 2, NL.H * 0.84, 14, "#9fc4dd", "center");
    glowTxt(g, "HI-SCORE  " + String(game.hiScore).padStart(8, "0"), NL.W / 2, NL.H * 0.90, 16, "#ffd070", "rgba(255,180,60,.4)", "center");

    if (NL.assets.externalManifest) txt(g, "AI ART: ON", 20, NL.H - 20, 12, "#6e90b0", "left");
    else txt(g, "PROCEDURAL ART MODE", 20, NL.H - 20, 12, "#6e90b0", "left");
  };

  // difficulty buttons; also stores hit-test rects for pointer/touch selection
  const DIFF_LABELS = [["EASY", "やさしい"], ["NORMAL", "ふつう"], ["HARD", "むずかしい"]];
  const DIFF_TIPS = ["弾は遅め・残機5。はじめての方に。", "ちょうどいい歯ごたえ。残機3。", "弾は速く残機2。腕に自信のある方へ。"];
  UI.titleRects = null;
  UI.drawDiffMenu = function (g, game) {
    const n = 3, w = 200, h = 54, gap = 24;
    const total = n * w + (n - 1) * gap;
    const x0 = (NL.W - total) / 2, y = NL.H * 0.555;
    const rects = { diffs: [] };
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (w + gap);
      const sel = game.menuSel === i;
      rects.diffs.push({ x, y, w, h });
      g.fillStyle = sel ? "rgba(54,224,255,.85)" : "rgba(10,24,40,.7)";
      g.strokeStyle = sel ? "#eaffff" : "rgba(90,150,200,.5)";
      g.lineWidth = sel ? 3 : 1.5;
      roundRect(g, x, y, w, h, 8); g.fill(); g.stroke();
      glowTxt(g, DIFF_LABELS[i][0], x + w / 2, y + 26, 24, sel ? "#03121e" : "#cfe9ff", sel ? "rgba(255,255,255,.4)" : "rgba(0,0,0,0)", "center");
      txt(g, DIFF_LABELS[i][1], x + w / 2, y + 44, 13, sel ? "#063042" : "#7fa8c8", "center", 600);
    }
    // tip for the selected difficulty
    txt(g, DIFF_TIPS[game.menuSel] || "", NL.W / 2, y + h + 24, 15, "#9fd0ff", "center");
    UI.titleRects = rects;
  };

  // friendly control tutorial shown at the start of stage 1
  UI.drawTutorial = function (g, game) {
    const a = Math.min(1, game.tutorialTimer / 40) * Math.min(1, (360 - game.tutorialTimer) / 20);
    g.save(); g.globalAlpha = a;
    const lines = game.input.isTouch
      ? ["左側をドラッグで移動", "FIREボタンで攻撃", "光るカプセルを取り → POWERで強化"]
      : ["矢印 / WASD で移動", "Z または SPACE で攻撃", "カプセルを取り → X / SHIFT で強化"];
    const bx = NL.W / 2, by = NL.H * 0.7;
    g.fillStyle = "rgba(2,8,16,0.5)"; roundRect(g, bx - 250, by - 28, 500, 86, 10); g.fill();
    g.strokeStyle = "rgba(54,224,255,.4)"; g.lineWidth = 1.5; g.stroke();
    glowTxt(g, "HOW TO PLAY", bx, by - 6, 16, "#ffd070", "rgba(255,180,60,.5)", "center");
    for (let i = 0; i < lines.length; i++) txt(g, lines[i], bx, by + 18 + i * 18, 14, "#cfe9ff", "center");
    g.restore();
  };

  // ---------- cinematic post-processing: vignette + subtle scanlines ----------
  let _vig = null, _scan = null;
  UI.drawPost = function (g) {
    if (!_vig) {
      _vig = g.createRadialGradient(NL.W / 2, NL.H / 2, NL.H * 0.35, NL.W / 2, NL.H / 2, NL.W * 0.62);
      _vig.addColorStop(0, "rgba(0,0,0,0)");
      _vig.addColorStop(1, "rgba(0,0,0,0.42)");
      const c = document.createElement("canvas"); c.width = 3; c.height = 3;
      const x = c.getContext("2d"); x.fillStyle = "rgba(0,0,0,0.07)"; x.fillRect(0, 2, 3, 1);
      _scan = g.createPattern(c, "repeat");
    }
    g.fillStyle = _vig; g.fillRect(0, 0, NL.W, NL.H);
    g.fillStyle = _scan; g.fillRect(0, 0, NL.W, NL.H);
  };

  // ---------- stage-intro card ----------
  UI.drawStageCard = function (g, game) {
    const t = game.cardTimer, max = 170;
    if (t <= 0) return;
    // fade in (first 25) / hold / fade out (last 40)
    let a = 1;
    if (max - t < 25) a = (max - t) / 25;
    else if (t < 40) a = t / 40;
    const parts = game.stageName.split("—");
    const big = (parts[0] || game.stageName).trim();
    const sub = (parts[1] || "").trim();
    g.save(); g.globalAlpha = a;
    // letterbox bars sliding feel
    g.fillStyle = "rgba(2,6,14,0.55)"; g.fillRect(0, NL.H * 0.38, NL.W, 130);
    g.strokeStyle = "rgba(54,224,255,0.5)"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(NL.W * 0.2, NL.H * 0.38); g.lineTo(NL.W * 0.8, NL.H * 0.38);
    g.moveTo(NL.W * 0.2, NL.H * 0.38 + 130); g.lineTo(NL.W * 0.8, NL.H * 0.38 + 130); g.stroke();
    glowTxt(g, big, NL.W / 2, NL.H * 0.48, 54, "#eaf6ff", "rgba(54,224,255,.9)", "center");
    if (sub) glowTxt(g, sub, NL.W / 2, NL.H * 0.55, 24, "#9fd0ff", "rgba(54,224,255,.6)", "center");
    g.restore();
  };

  UI.drawCenterPanel = function (g, lines, accent) {
    g.fillStyle = "rgba(2,6,14,0.72)"; g.fillRect(0, 0, NL.W, NL.H);
    let y = NL.H / 2 - (lines.length * 30);
    for (const ln of lines) {
      glowTxt(g, ln.s, NL.W / 2, y, ln.size || 28, ln.col || "#eaf6ff", ln.glow || "rgba(54,224,255,.6)", "center");
      y += (ln.gap || 50);
    }
  };

})();
