/* ============================================================
   assets.js : procedural "mecha-SF" sprite baking + optional
   external image loading (AI-generated PNGs under assets/).

   If assets/manifest.json exists and lists a key, that PNG is used.
   Otherwise a detailed procedural sprite is baked on an offscreen
   canvas. The rest of the game does not care which it gets.
   ============================================================ */
(function () {
  "use strict";
  const NL = window.NL;
  const U = NL.util;
  const AS = (NL.assets = {});

  AS.images = {};   // key -> HTMLCanvasElement | HTMLImageElement
  AS.ready = false;

  function mk(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }

  // ---------- shared drawing helpers ----------
  function panelLines(g, x, y, w, h, n, col) {
    g.save();
    g.strokeStyle = col || "rgba(0,0,0,0.35)";
    g.lineWidth = 1;
    for (let i = 1; i < n; i++) {
      const yy = y + (h * i) / n;
      g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke();
    }
    g.restore();
  }
  function metalGrad(g, x0, y0, x1, y1, c1, c2, c3) {
    const grd = g.createLinearGradient(x0, y0, x1, y1);
    grd.addColorStop(0, c1); grd.addColorStop(0.5, c2); grd.addColorStop(1, c3);
    return grd;
  }
  function glowDot(g, x, y, r, col) {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, col); grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }

  // ---------- PLAYER SHIP (faces right) ----------
  function bakePlayer() {
    const W = 150, H = 84, c = mk(W, H), g = c.getContext("2d");
    const cx = W * 0.42, cy = H / 2;
    // rear wings
    g.fillStyle = metalGrad(g, 0, 0, 0, H, "#3a5570", "#22394f", "#16242f");
    g.beginPath();
    g.moveTo(20, cy); g.lineTo(2, 10); g.lineTo(40, cy - 8);
    g.lineTo(40, cy + 8); g.lineTo(2, H - 10); g.closePath(); g.fill();
    g.strokeStyle = "rgba(120,200,255,.35)"; g.lineWidth = 1.5; g.stroke();

    // main fuselage
    const body = metalGrad(g, 0, cy - 24, 0, cy + 24, "#9fc4dd", "#4f7390", "#243747");
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(W - 6, cy);                 // nose tip
    g.quadraticCurveTo(W - 40, cy - 20, cx, cy - 22);
    g.lineTo(28, cy - 16);
    g.quadraticCurveTo(14, cy, 28, cy + 16);
    g.lineTo(cx, cy + 22);
    g.quadraticCurveTo(W - 40, cy + 20, W - 6, cy);
    g.closePath(); g.fill();
    g.strokeStyle = "rgba(10,20,30,.6)"; g.lineWidth = 2; g.stroke();

    // top highlight
    g.fillStyle = "rgba(220,245,255,.25)";
    g.beginPath();
    g.moveTo(W - 12, cy - 2); g.quadraticCurveTo(W - 50, cy - 14, cx, cy - 15);
    g.lineTo(40, cy - 11); g.quadraticCurveTo(cx, cy - 9, W - 20, cy - 2); g.closePath(); g.fill();

    // canopy
    const cg = g.createLinearGradient(cx - 6, cy - 12, cx + 30, cy + 4);
    cg.addColorStop(0, "#bff4ff"); cg.addColorStop(0.5, "#2aa8d6"); cg.addColorStop(1, "#0b2a3a");
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(cx + 30, cy - 2); g.quadraticCurveTo(cx + 18, cy - 13, cx - 4, cy - 9);
    g.quadraticCurveTo(cx - 12, cy, cx - 4, cy + 7); g.quadraticCurveTo(cx + 18, cy + 9, cx + 30, cy - 2);
    g.closePath(); g.fill();
    g.strokeStyle = "rgba(180,240,255,.7)"; g.lineWidth = 1; g.stroke();

    // wing struts / detail lines
    g.strokeStyle = "rgba(10,20,30,.45)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx, cy - 18); g.lineTo(W - 24, cy - 6);
    g.moveTo(cx, cy + 18); g.lineTo(W - 24, cy + 6); g.stroke();

    // accent stripes
    g.fillStyle = "#ff8a3c";
    g.fillRect(cx + 6, cy + 12, 30, 3);
    g.fillStyle = "#36e0ff";
    g.fillRect(cx + 6, cy - 15, 26, 2);

    // cannon tips
    g.fillStyle = "#cdd9e2";
    g.fillRect(W - 18, cy - 18, 14, 4);
    g.fillRect(W - 18, cy + 14, 14, 4);

    // engine nozzles (left)
    g.fillStyle = "#1a2630";
    g.fillRect(20, cy - 12, 12, 8);
    g.fillRect(20, cy + 4, 12, 8);
    AS.images.player = c;
  }

  // ---------- OPTION drone ----------
  function bakeOption() {
    const S = 42, c = mk(S, S), g = c.getContext("2d");
    const cx = S / 2, cy = S / 2;
    glowDot(g, cx, cy, S * 0.55, "rgba(90,200,255,.5)");
    const grd = g.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, S * 0.4);
    grd.addColorStop(0, "#dffbff"); grd.addColorStop(0.4, "#39b9e6"); grd.addColorStop(1, "#0c3a52");
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, S * 0.34, 0, 7); g.fill();
    g.strokeStyle = "rgba(190,245,255,.8)"; g.lineWidth = 2; g.stroke();
    g.fillStyle = "#ffd070"; g.beginPath(); g.arc(cx, cy, 4, 0, 7); g.fill();
    AS.images.option = c;
  }

  // ---------- ENEMIES ----------
  function bakeEnemyFighter() { // small, faces left
    const W = 96, H = 60, c = mk(W, H), g = c.getContext("2d");
    const cy = H / 2;
    g.fillStyle = metalGrad(g, 0, cy - 20, 0, cy + 20, "#b06a6a", "#7a3636", "#3a1818");
    g.beginPath();
    g.moveTo(6, cy); g.quadraticCurveTo(40, cy - 18, W - 20, cy - 16);
    g.quadraticCurveTo(W - 4, cy, W - 20, cy + 16); g.quadraticCurveTo(40, cy + 18, 6, cy);
    g.closePath(); g.fill();
    g.strokeStyle = "rgba(0,0,0,.5)"; g.lineWidth = 2; g.stroke();
    // wings
    g.fillStyle = "#5a2828";
    g.beginPath(); g.moveTo(W - 26, cy - 6); g.lineTo(W - 4, cy - 26); g.lineTo(W - 40, cy - 12); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(W - 26, cy + 6); g.lineTo(W - 4, cy + 26); g.lineTo(W - 40, cy + 12); g.closePath(); g.fill();
    // eye/sensor
    glowDot(g, 18, cy, 12, "rgba(255,90,60,.8)");
    g.fillStyle = "#ffd0c0"; g.beginPath(); g.arc(16, cy, 4, 0, 7); g.fill();
    panelLines(g, 30, cy - 14, 50, 28, 3, "rgba(0,0,0,.3)");
    AS.images.enemyFighter = c;
  }
  function bakeEnemyDrone() { // round popcorn
    const S = 56, c = mk(S, S), g = c.getContext("2d");
    const cx = S / 2, cy = S / 2;
    const grd = g.createRadialGradient(cx - 6, cy - 6, 3, cx, cy, S * 0.45);
    grd.addColorStop(0, "#d8e4ee"); grd.addColorStop(0.5, "#7e93a6"); grd.addColorStop(1, "#2a3a48");
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, S * 0.4, 0, 7); g.fill();
    g.strokeStyle = "rgba(0,0,0,.5)"; g.lineWidth = 2; g.stroke();
    glowDot(g, cx, cy, 16, "rgba(255,160,40,.85)");
    g.fillStyle = "#ffe6b0"; g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.fill();
    // bolts
    g.fillStyle = "#1c2830";
    for (let a = 0; a < 6; a++) { const an = a / 6 * 7; g.beginPath(); g.arc(cx + Math.cos(an) * S * 0.34, cy + Math.sin(an) * S * 0.34, 2.4, 0, 7); g.fill(); }
    AS.images.enemyDrone = c;
  }
  function bakeTurret() {
    const W = 70, H = 56, c = mk(W, H), g = c.getContext("2d");
    // base
    g.fillStyle = metalGrad(g, 0, 0, 0, H, "#7c8a96", "#46555f", "#222d34");
    g.beginPath(); g.moveTo(8, H); g.lineTo(W - 8, H); g.lineTo(W - 16, H - 22); g.lineTo(16, H - 22); g.closePath(); g.fill();
    g.strokeStyle = "rgba(0,0,0,.5)"; g.stroke();
    // dome
    const grd = g.createRadialGradient(W / 2 - 6, H - 28, 3, W / 2, H - 24, 22);
    grd.addColorStop(0, "#c9d6df"); grd.addColorStop(1, "#3a4750");
    g.fillStyle = grd; g.beginPath(); g.arc(W / 2, H - 24, 18, Math.PI, 0); g.fill();
    // barrel
    g.fillStyle = "#1c262c"; g.fillRect(W / 2 - 4, H - 50, 8, 26);
    glowDot(g, W / 2, H - 50, 8, "rgba(255,120,40,.7)");
    AS.images.turret = c;
  }
  function bakeMidEnemy() { // bigger gunship, faces left
    const W = 150, H = 96, c = mk(W, H), g = c.getContext("2d");
    const cy = H / 2;
    g.fillStyle = metalGrad(g, 0, cy - 40, 0, cy + 40, "#8a8f9a", "#4a525d", "#262c34");
    g.beginPath();
    g.moveTo(8, cy); g.lineTo(34, cy - 34); g.lineTo(W - 28, cy - 32);
    g.quadraticCurveTo(W - 2, cy, W - 28, cy + 32); g.lineTo(34, cy + 34); g.closePath(); g.fill();
    g.strokeStyle = "rgba(0,0,0,.55)"; g.lineWidth = 2; g.stroke();
    panelLines(g, 40, cy - 28, W - 80, 56, 4, "rgba(0,0,0,.3)");
    // armor plates
    g.fillStyle = "#5a6470"; g.fillRect(40, cy - 30, 26, 60);
    g.fillStyle = "#3a424c"; g.fillRect(W - 70, cy - 26, 24, 52);
    // sensor cluster
    glowDot(g, 26, cy, 16, "rgba(255,70,50,.8)");
    g.fillStyle = "#ffd0c0"; g.beginPath(); g.arc(22, cy, 5, 0, 7); g.fill();
    // gun ports
    g.fillStyle = "#11181d"; g.fillRect(8, cy - 22, 10, 6); g.fillRect(8, cy + 16, 10, 6);
    g.fillStyle = "#ff8a3c"; g.fillRect(70, cy - 33, 30, 3);
    AS.images.midEnemy = c;
  }

  // ---------- POWER CAPSULE & fake ----------
  function bakeCapsule(fake) {
    const S = 40, c = mk(S, S), g = c.getContext("2d");
    const cx = S / 2, cy = S / 2;
    const col = fake ? ["#ff9a9a", "#c83838", "#4a0e0e"] : ["#ffe9a0", "#ff8a2c", "#7a3000"];
    glowDot(g, cx, cy, S * 0.5, fake ? "rgba(255,60,60,.5)" : "rgba(255,160,40,.55)");
    const grd = g.createLinearGradient(cx - 12, cy - 12, cx + 12, cy + 12);
    grd.addColorStop(0, col[0]); grd.addColorStop(0.5, col[1]); grd.addColorStop(1, col[2]);
    g.fillStyle = grd;
    g.beginPath();
    const r = 12;
    g.moveTo(cx - r, cy); g.lineTo(cx, cy - r); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r); g.closePath();
    g.fill();
    g.strokeStyle = fake ? "#ffd0d0" : "#fff2c0"; g.lineWidth = 2; g.stroke();
    g.fillStyle = "#1a0f04"; g.font = "bold 14px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(fake ? "?" : "P", cx, cy + 1);
    AS.images[fake ? "capsuleFake" : "capsule"] = c;
  }

  // ---------- MISSILE ----------
  function bakeMissile() {
    const W = 28, H = 12, c = mk(W, H), g = c.getContext("2d");
    g.fillStyle = metalGrad(g, 0, 0, 0, H, "#e8eef2", "#9aa6b0", "#5a646e");
    g.beginPath(); g.moveTo(W, H / 2); g.lineTo(W - 10, 1); g.lineTo(2, 2);
    g.lineTo(2, H - 2); g.lineTo(W - 10, H - 1); g.closePath(); g.fill();
    g.fillStyle = "#ff5a2c"; g.fillRect(0, 2, 4, H - 4);
    g.fillStyle = "#ffcf6a"; g.fillRect(W - 12, H / 2 - 1, 8, 2);
    AS.images.missile = c;
  }

  // ---------- expose procedural background painters (used by stages) ----------
  AS.bakeAll = function () {
    bakePlayer(); bakeOption(); bakeEnemyFighter(); bakeEnemyDrone();
    bakeTurret(); bakeMidEnemy(); bakeCapsule(false); bakeCapsule(true); bakeMissile();
  };

  // ---------- external asset loading ----------
  function loadImage(src) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = src;
    });
  }

  AS.load = async function (onProgress) {
    AS.bakeAll(); // procedural first (always available, instant)
    if (onProgress) onProgress(0.5, "baked procedural sprites");

    // Try optional external AI art (generated on the user's machine).
    // Only attempt to load PNGs when the manifest is flagged "generated"
    // — otherwise we'd 404 on every missing sprite and pollute the console.
    let manifest = null;
    try {
      const r = await fetch("assets/manifest.json", { cache: "no-store" });
      if (r.ok) manifest = await r.json();
    } catch (e) { /* file:// or missing -> ignore */ }

    if (manifest && manifest.generated && manifest.sprites) {
      const keys = Object.keys(manifest.sprites);
      let done = 0;
      await Promise.all(keys.map(async (k) => {
        const img = await loadImage("assets/" + manifest.sprites[k]);
        if (img) AS.images[k] = img; // override procedural with real art
        done++;
        if (onProgress) onProgress(0.5 + 0.5 * (done / keys.length), "loaded " + k);
      }));
      AS.externalManifest = manifest;
    }
    AS.ready = true;
    if (onProgress) onProgress(1, "ready");
  };

})();
