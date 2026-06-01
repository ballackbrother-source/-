/* ============================================================
   NOVA LANCE — Burning Skies
   util.js : global namespace, math, RNG, helpers
   ============================================================ */
(function () {
  "use strict";

  const NL = (window.NL = window.NL || {});

  // Logical resolution (game world). Canvas is scaled to fit the window.
  NL.W = 1280;
  NL.H = 720;

  const U = (NL.util = {});

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.rad = (d) => (d * Math.PI) / 180;
  U.dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };
  U.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  U.angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

  // Mulberry32 seeded RNG for reproducible level generation / tests.
  U.makeRng = function (seed) {
    let s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  // default global rng
  let _rng = U.makeRng(0x9e3779b9);
  U.rng = () => _rng();
  U.seed = (n) => { _rng = U.makeRng(n >>> 0); };
  U.rand = (a, b) => a + (_rng()) * (b - a);
  U.randInt = (a, b) => Math.floor(a + _rng() * (b - a + 1));
  U.pick = (arr) => arr[Math.floor(_rng() * arr.length)];
  U.chance = (p) => _rng() < p;

  // AABB / circle overlap helpers
  U.circleHit = (ax, ay, ar, bx, by, br) => {
    const r = ar + br;
    return U.dist2(ax, ay, bx, by) <= r * r;
  };
  U.aabb = (ax, ay, aw, ah, bx, by, bw, bh) =>
    ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

  // Simple object pool to avoid GC churn for bullets / particles.
  U.Pool = class {
    constructor(factory, reset) {
      this.factory = factory;
      this.reset = reset;
      this.free = [];
      this.active = [];
    }
    spawn() {
      const o = this.free.pop() || this.factory();
      o._dead = false;
      this.active.push(o);
      return o;
    }
    sweep() {
      const a = this.active;
      let w = 0;
      for (let i = 0; i < a.length; i++) {
        const o = a[i];
        if (o._dead) { if (this.reset) this.reset(o); this.free.push(o); }
        else a[w++] = o;
      }
      a.length = w;
    }
    forEach(fn) {
      const a = this.active;
      for (let i = 0; i < a.length; i++) if (!a[i]._dead) fn(a[i], i);
    }
    clear() {
      for (const o of this.active) { o._dead = true; if (this.reset) this.reset(o); this.free.push(o); }
      this.active.length = 0;
    }
    get count() { return this.active.length; }
  };

  // Color helpers
  U.rgba = (r, g, b, a) => `rgba(${r|0},${g|0},${b|0},${a})`;

  // Persistent state (warnings learned across deaths, settings).
  const KEY = "novalance.save.v1";
  U.load = function () {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  };
  U.save = function (obj) {
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) {}
  };

})();
