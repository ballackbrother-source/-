/* ============================================================
   main.js : bootstrap — responsive canvas scaling, touch UI,
   loading splash, orientation hint, and kick off the loop.
   ============================================================ */
(function () {
  "use strict";
  const NL = window.NL;

  const canvas = document.getElementById("game");
  const stage = document.getElementById("stage");
  const loading = document.getElementById("loading");
  const ldBar = loading.querySelector(".ld-bar i");
  const ldMsg = loading.querySelector(".ld-msg");
  const touchUI = document.getElementById("touch-ui");
  const rotateHint = document.getElementById("rotate-hint");

  // ---- responsive scaling (letterbox, preserve 16:9) ----
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const scale = Math.min(vw / NL.W, vh / NL.H);
    const w = Math.round(NL.W * scale), h = Math.round(NL.H * scale);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    if (NL.input._updRect) NL.input._updRect();
    checkOrientation();
  }
  function checkOrientation() {
    if (NL.input.isTouch && window.innerHeight > window.innerWidth) rotateHint.classList.remove("hidden");
    else rotateHint.classList.add("hidden");
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 200));

  // ---- touch UI ----
  if (NL.input.isTouch) {
    touchUI.classList.remove("hidden");
    NL.input.bindTouch(
      document.getElementById("tpad"),
      document.getElementById("btn-fire"),
      document.getElementById("btn-power")
    );
    const pb = document.getElementById("btn-pause");
    if (pb) pb.addEventListener("touchstart", (e) => { e.preventDefault(); NL.input.virtualPress("pause"); }, { passive: false });
  }

  NL.input.attach(canvas);

  // unlock audio on first user gesture (mobile policy)
  function unlock() { NL.audio.resume(); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); }
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);

  // ---- boot ----
  async function boot() {
    NL.audio.init();
    await NL.assets.load((p, msg) => {
      ldBar.style.width = Math.round(p * 100) + "%";
      if (msg) ldMsg.textContent = msg;
    });
    NL.game.init(canvas);
    resize();
    setTimeout(() => { loading.classList.add("gone"); }, 300);
    requestAnimationFrame(NL.game.loop);
    window.__NL_READY = true;
  }

  boot();
})();
