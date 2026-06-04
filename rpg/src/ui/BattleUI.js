/**
 * ui/BattleUI.js
 * @layer presentation(ui)
 * 戦闘画面の描画ヘルパー：敵の配置・パーティ状態パネル・メッセージログ。
 */
import { VIEW_W, VIEW_H, COLORS } from '../config/constants.js';
import { StatusEffectSystem as SES } from '../domain/systems/StatusEffectSystem.js';

// 状態異常の見た目（字・色）
const STATUS_FX = {
  poison:   ['毒', '#7fd96b'], sleep: ['Z', '#bfe0ff'], paralyze: ['雷', '#ffe24a'],
  silence:  ['黙', '#c9b6ff'], confuse: ['?', '#ff9ad2'], blind: ['暗', '#9aa6b8'],
};

export class BattleUI {
  constructor(assets) { this.assets = assets; this.shakeT = 0; }

  /** 敵を上半分に配置して描画。flashTarget=被弾点滅対象 */
  drawEnemies(r, enemies, flashTarget, tick) {
    const live = enemies;
    const n = live.length;
    const tk = tick || 0;
    live.forEach((e, i) => {
      if (e.isDead) return;
      const cx = (VIEW_W / (n + 1)) * (i + 1);
      const cy = 150 + (i % 2) * 24;
      const s = e.isBoss ? 1.8 : 1.0;
      // 待機アニメ：ゆっくりした呼吸（上下＋わずかな伸縮）。個体ごとに位相をずらす
      const t = tk * 0.05 + i * 1.7;
      const bob = Math.sin(t) * (e.isBoss ? 2.4 : 1.6);
      const breath = 1 + Math.sin(t * 1.2) * 0.018;
      // 被弾モーション：上へのけぞり＋横揺れ＋少し縮む
      let dx = 0, dy = 0, sc = 1;
      const HIT = 14, ATK = 16;
      const ha = tk - (e._hitTick ?? -999);
      if (ha >= 0 && ha < HIT) { const k = 1 - ha / HIT; dx += Math.sin(ha * 1.7) * 7 * k; dy -= 5 * k; sc *= 1 - 0.1 * k; }
      // 攻撃モーション：パーティ方向（下）へ踏み込み、少し大きく
      const aa = tk - (e._atkTick ?? -999);
      if (aa >= 0 && aa < ATK) { const k = Math.sin((aa / ATK) * Math.PI); dy += 12 * k; sc *= 1 + 0.06 * k; }
      r.save();
      if (flashTarget === e && tk % 6 < 3) r.alpha(0.35);
      r.ctx.translate(cx + dx, cy + bob + dy);
      r.ctx.scale(breath * sc, breath * sc);
      const col = this._famColor(e.family);
      this.assets.drawMonster(r.ctx, 0, 0, e.family, col, s, tk);
      r.restore();
      // 状態異常マーカー＋演出（スプライト上）
      if (e.statusEffects?.length) this._drawStatusFx(r, cx, cy - (e.isBoss ? 60 : 40), e.statusEffects, tk);
    });
  }

  /** 状態異常の演出：頭上のバッジ＋署名エフェクト（毒の泡・睡眠のZ・まひの火花） */
  _drawStatusFx(r, cx, ay, statuses, tk) {
    const c = r.ctx;
    const ids = statuses.map((s) => s.id).filter((id) => STATUS_FX[id]);
    if (!ids.length) return;
    const bw = 17, bx0 = cx - (ids.length - 1) * bw / 2;
    ids.forEach((id, i) => {
      const [glyph, col] = STATUS_FX[id];
      const bx = bx0 + i * bw, by = ay + Math.sin(tk * 0.1 + i) * 1.6;
      const a = id === 'poison' ? 0.45 + 0.55 * Math.abs(Math.sin(tk * 0.16)) : 1; // 毒は点滅
      c.save(); c.globalAlpha = a;
      c.fillStyle = 'rgba(8,12,24,0.72)'; c.beginPath(); c.arc(bx, by, 7.5, 0, 7); c.fill();
      c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath(); c.arc(bx, by, 7.5, 0, 7); c.stroke();
      c.restore();
      r.text(glyph, bx, by - 6, { size: 10, align: 'center', color: col });
    });
    if (ids.includes('sleep')) { // 漂うZ
      for (let k = 0; k < 3; k++) { const ph = (tk * 0.018 + k / 3) % 1; c.save(); c.globalAlpha = 1 - ph; r.text('Z', cx + 12 + ph * 18, ay - 8 - ph * 22, { size: 8 + k * 3, align: 'center', color: '#cfeaff' }); c.restore(); }
    }
    if (ids.includes('poison')) { // 立ちのぼる毒の泡
      for (let k = 0; k < 4; k++) { const ph = (tk * 0.028 + k / 4) % 1; c.save(); c.globalAlpha = 0.7 * (1 - ph); c.fillStyle = '#8fe07a'; c.beginPath(); c.arc(cx - 14 + k * 9 + Math.sin(tk * 0.1 + k) * 3, ay + 10 - ph * 20, 2 + ph * 1.4, 0, 7); c.fill(); c.restore(); }
    }
    if (ids.includes('paralyze') && tk % 38 < 6) { // まひの火花
      c.save(); c.strokeStyle = '#ffe24a'; c.lineWidth = 2; c.beginPath();
      c.moveTo(cx + 15, ay - 5); c.lineTo(cx + 21, ay + 1); c.lineTo(cx + 17, ay + 3); c.lineTo(cx + 23, ay + 10); c.stroke(); c.restore();
    }
  }

  _famColor(family) {
    return ({
      beast: '#b9783f', plant: '#4caf50', insect: '#9ccc3f', undead: '#c8d0d8',
      machine: '#9aa6b8', aqua: '#3fa9d8', flying: '#d8c23f', dragon: '#c0392b',
      elemental: '#e0533f', demon: '#7e57c2', boss: '#b03060', slime: '#5fd38a',
      mage: '#6a5acd', spirit: '#6fd0ff',
    })[family] || '#aa6cc8';
  }

  /** 下部のパーティ状態パネル（4人横並び） */
  drawPartyStatus(r, party, activeChar, tk = 0) {
    const y = VIEW_H - 92, h = 84;
    const w = VIEW_W / party.length;
    party.forEach((c, i) => {
      const x = i * w;
      const sel = c === activeChar;
      r.window(x + 4, y, w - 8, h);
      if (sel) r.strokeRect(x + 4, y, w - 8, h, COLORS.selected, 2);
      const name = c.name + (c.isDead ? '(戦闘不能)' : '');
      r.text(name, x + 14, y + 8, { size: 15, color: c.isDead ? '#e06666' : COLORS.text });
      // HP
      r.text(`HP`, x + 14, y + 30, { size: 12, color: COLORS.textDim });
      r.gauge(x + 40, y + 31, w - 56, 9, c.curHp / c.maxHp, COLORS.hp);
      r.text(`${c.curHp}/${c.maxHp}`, x + 40, y + 41, { size: 11, color: COLORS.textDim });
      // MP
      r.text(`MP`, x + 14, y + 56, { size: 12, color: COLORS.textDim });
      r.gauge(x + 40, y + 57, w - 56, 9, c.maxMp ? c.curMp / c.maxMp : 0, COLORS.mp);
      r.text(`${c.curMp}/${c.maxMp}`, x + 40, y + 67, { size: 11, color: COLORS.textDim });
      // 状態異常：色付きバッジ（毒は点滅）
      if (c.statusEffects?.length) {
        const ctx = r.ctx;
        c.statusEffects.forEach((sefx, k) => {
          const [glyph, col] = STATUS_FX[sefx.id] || ['?', '#e0a93f'];
          const bx = x + w - 16 - k * 16, by = y + 15;
          const a = sefx.id === 'poison' ? 0.45 + 0.55 * Math.abs(Math.sin(tk * 0.16)) : 1;
          ctx.save(); ctx.globalAlpha = a;
          ctx.fillStyle = 'rgba(8,12,24,0.7)'; ctx.beginPath(); ctx.arc(bx, by, 7, 0, 7); ctx.fill();
          ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(bx, by, 7, 0, 7); ctx.stroke();
          ctx.restore();
          r.text(glyph, bx, by - 6, { size: 10, align: 'center', color: col });
        });
      }
    });
  }

  /** 1行のメッセージログ（上部の帯） */
  drawLog(r, line) {
    if (!line) return;
    r.window(24, 16, VIEW_W - 48, 44);
    r.text(line, 40, 28, { size: 17 });
  }
}
