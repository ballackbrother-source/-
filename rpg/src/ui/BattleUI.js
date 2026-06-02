/**
 * ui/BattleUI.js
 * @layer presentation(ui)
 * 戦闘画面の描画ヘルパー：敵の配置・パーティ状態パネル・メッセージログ。
 */
import { VIEW_W, VIEW_H, COLORS } from '../config/constants.js';
import { StatusEffectSystem as SES } from '../domain/systems/StatusEffectSystem.js';

export class BattleUI {
  constructor(assets) { this.assets = assets; this.shakeT = 0; }

  /** 敵を上半分に配置して描画。flashTarget=被弾点滅対象 */
  drawEnemies(r, enemies, flashTarget, tick) {
    const live = enemies;
    const n = live.length;
    live.forEach((e, i) => {
      if (e.isDead) return;
      const cx = (VIEW_W / (n + 1)) * (i + 1);
      const cy = 150 + (i % 2) * 24;
      const s = e.isBoss ? 1.8 : 1.0;
      r.save();
      if (flashTarget === e && tick % 6 < 3) r.alpha(0.35);
      const col = this._famColor(e.family);
      this.assets.drawMonster(r.ctx, cx, cy, e.family, col, s);
      r.restore();
    });
  }

  _famColor(family) {
    return ({
      beast: '#b9783f', plant: '#4caf50', insect: '#9ccc3f', undead: '#c8d0d8',
      machine: '#9aa6b8', aqua: '#3fa9d8', flying: '#d8c23f', dragon: '#c0392b',
      elemental: '#e0533f', demon: '#7e57c2', boss: '#b03060', slime: '#5fd38a',
    })[family] || '#aa6cc8';
  }

  /** 下部のパーティ状態パネル（4人横並び） */
  drawPartyStatus(r, party, activeChar) {
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
      // 状態異常
      if (c.statusEffects?.length) {
        r.text(c.statusEffects.map((s) => SES.label(s.id)).join(','), x + w - 70, y + 8, { size: 11, color: '#e0a93f' });
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
