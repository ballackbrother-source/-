/* ============================================================
   input.js : keyboard, mouse, touch. Exposes a unified state.
   ============================================================ */
(function () {
  "use strict";
  const NL = window.NL;
  const I = (NL.input = {});

  I.up = false; I.down = false; I.left = false; I.right = false;
  I.fire = false; I.power = false;
  I.firePressed = false;   // edge
  I.powerPressed = false;  // edge
  I.upPressed = false; I.downPressed = false; I.leftPressed = false; I.rightPressed = false; // edges (menus)
  I.anyPressed = false;    // edge (start/continue)
  I.pausePressed = false;
  I.mutePressed = false;

  // Pointer based aiming/move target (mouse + touch drag). null when none.
  I.moveTarget = null; // {x,y} in canvas logical coords
  I.isTouch = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;

  const held = {};
  const edge = {};

  function setKey(code, val) {
    const map = {
      ArrowUp: "up", KeyW: "up",
      ArrowDown: "down", KeyS: "down",
      ArrowLeft: "left", KeyA: "left",
      ArrowRight: "right", KeyD: "right",
      KeyZ: "fire", Space: "fire", KeyJ: "fire",
      KeyX: "power", ShiftLeft: "power", KeyK: "power",
      Enter: "confirm", NumpadEnter: "confirm",
      KeyP: "pause", KeyM: "mute"
    };
    const a = map[code];
    if (!a) return false;
    if (val && !held[a]) edge[a] = true;
    held[a] = val;
    return true;
  }

  window.addEventListener("keydown", (e) => {
    if (setKey(e.code, true)) e.preventDefault();
    // any key for start screens
    if (!e.repeat) edge.any = true;
  }, { passive: false });
  window.addEventListener("keyup", (e) => { if (setKey(e.code, false)) e.preventDefault(); }, { passive: false });

  // ---- Canvas mapping ----
  let canvas = null, rect = null;
  I.attach = function (cv) {
    canvas = cv;
    const upd = () => { rect = canvas.getBoundingClientRect(); };
    upd();
    window.addEventListener("resize", upd);
    window.addEventListener("scroll", upd, true);
    I._updRect = upd;

    // Mouse: hold to move ship toward cursor, left button = fire.
    canvas.addEventListener("mousemove", (e) => {
      I.moveTarget = toLogical(e.clientX, e.clientY);
    });
    canvas.addEventListener("mousedown", (e) => {
      I.moveTarget = toLogical(e.clientX, e.clientY);
      if (e.button === 0) { held.fire = true; edge.fire = true; }
      if (e.button === 2) { held.power = true; edge.power = true; }
      edge.any = true; edge.pointer = true; I.tapPoint = I.moveTarget;
    });
    // taps directly on the canvas (used by the title menu; during play the
    // touch-pad overlay sits on top so these only fire on uncovered areas)
    canvas.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      I.moveTarget = toLogical(t.clientX, t.clientY);
      I.tapPoint = I.moveTarget; edge.any = true; edge.pointer = true;
    }, { passive: true });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) held.fire = false;
      if (e.button === 2) held.power = false;
    });
    canvas.addEventListener("mouseleave", () => { I.moveTarget = null; });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  };

  function toLogical(cx, cy) {
    if (!rect) rect = canvas.getBoundingClientRect();
    const x = ((cx - rect.left) / rect.width) * NL.W;
    const y = ((cy - rect.top) / rect.height) * NL.H;
    return { x: NL.util.clamp(x, 0, NL.W), y: NL.util.clamp(y, 0, NL.H) };
  }
  I.toLogical = toLogical;

  // ---- Touch controls ----
  I.bindTouch = function (pad, fireBtn, powerBtn) {
    let padId = null, padStart = null, padTargetStart = null;

    function getRect() { if (!rect) rect = canvas.getBoundingClientRect(); return rect; }

    pad.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      padId = t.identifier;
      padStart = { x: t.clientX, y: t.clientY };
      edge.any = true;
      // initialise move target at current ship pos handled by game; we set relative
      I._touchActive = true;
    }, { passive: false });
    pad.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === padId) {
          I.touchDelta = { dx: t.clientX - padStart.x, dy: t.clientY - padStart.y };
          padStart = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: false });
    const endPad = (e) => {
      for (const t of e.changedTouches) if (t.identifier === padId) { padId = null; I.touchDelta = null; }
    };
    pad.addEventListener("touchend", endPad);
    pad.addEventListener("touchcancel", endPad);

    const bindBtn = (btn, name) => {
      btn.addEventListener("touchstart", (e) => { e.preventDefault(); held[name] = true; edge[name] = true; edge.any = true; }, { passive: false });
      const up = (e) => { e.preventDefault(); held[name] = false; };
      btn.addEventListener("touchend", up); btn.addEventListener("touchcancel", up);
    };
    bindBtn(fireBtn, "fire");
    bindBtn(powerBtn, "power");
  };

  I.touchDelta = null;

  // Called once per frame by the game to latch edges.
  I.poll = function () {
    I.up = !!held.up; I.down = !!held.down; I.left = !!held.left; I.right = !!held.right;
    I.fire = !!held.fire; I.power = !!held.power;
    I.firePressed = !!edge.fire; I.powerPressed = !!edge.power;
    I.upPressed = !!edge.up; I.downPressed = !!edge.down; I.leftPressed = !!edge.left; I.rightPressed = !!edge.right;
    I.anyPressed = !!edge.any; I.pausePressed = !!edge.pause; I.mutePressed = !!edge.mute;
    I.pointerPressed = !!edge.pointer; I.confirmPressed = !!edge.confirm;
    // clear edges
    edge.fire = edge.power = edge.any = edge.pause = edge.mute = edge.pointer = edge.confirm = false;
    edge.up = edge.down = edge.left = edge.right = false;
  };

})();
