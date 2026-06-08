/**
 * ui/MenuUI.js
 * @layer presentation(ui)
 * メニュー用の描画ヘルパー（キャラ状態パネル等）。
 */
import { COLORS, ELEMENT_LABEL } from '../config/constants.js';
import { needExp, totalExpFor } from '../domain/systems/LevelSystem.js';

export const MenuUI = {
  /** パーティ概要（縦並びの小カード） */
  partyList(r, party, x, y, w, selectedIdx = -1) {
    party.forEach((c, i) => {
      const cy = y + i * 64;
      r.window(x, cy, w, 58);
      if (i === selectedIdx) r.strokeRect(x, cy, w, 58, COLORS.selected, 2);
      r.text(`${c.name}`, x + 12, cy + 6, { size: 16 });
      r.text(`Lv${c.lv}`, x + w - 70, cy + 6, { size: 15, color: COLORS.selected });
      r.text(`HP`, x + 12, cy + 30, { size: 11, color: COLORS.textDim });
      r.gauge(x + 36, cy + 31, w - 120, 8, c.curHp / c.maxHp, COLORS.hp);
      r.text(`${c.curHp}/${c.maxHp}`, x + w - 78, cy + 28, { size: 11, color: COLORS.textDim });
      r.text(`MP`, x + 12, cy + 44, { size: 11, color: COLORS.textDim });
      r.gauge(x + 36, cy + 45, w - 120, 8, c.maxMp ? c.curMp / c.maxMp : 0, COLORS.mp);
      r.text(`${c.curMp}/${c.maxMp}`, x + w - 78, cy + 42, { size: 11, color: COLORS.textDim });
    });
  },

  /** 1キャラの詳細ステータス */
  detail(r, c, x, y, w, h, assets) {
    r.window(x, y, w, h);
    r.text(c.name, x + 16, y + 14, { size: 22, color: COLORS.selected });
    r.text(`${c.db.getCharacter(c.id).title || ''}`, x + 16, y + 42, { size: 13, color: COLORS.textDim });
    r.text(`Lv ${c.lv}`, x + w - 90, y + 16, { size: 18 });
    // 武器属性アイコン
    const wpId = c.member?.equip?.weapon;
    const wEl = wpId ? c.db.getItem(wpId)?.element : null;
    if (assets && wEl && wEl !== 'none') {
      assets.drawIcon(r.ctx, x + w - 150, y + 50, 7, wEl);
      r.text(`武器属性 ${ELEMENT_LABEL[wEl] || ''}`, x + w - 138, y + 44, { size: 12, color: COLORS.textDim });
    }

    const s = c.stats;
    const expNext = totalExpFor(c.lv + 1) - c.exp;
    const rows = [
      ['HP', `${c.curHp}/${c.maxHp}`], ['MP', `${c.curMp}/${c.maxMp}`],
      ['つぎのLvまで', `${Math.max(0, expNext)}`],
      ['ちから', s.str], ['みのまもり', s.vit], ['すばやさ', s.agi],
      ['きようさ', s.dex], ['かしこさ', s.int], ['せいしん', s.spi], ['うん', s.luk],
      ['こうげき力', s.atk], ['しゅび力', s.def], ['まこうげき', s.mat], ['まぼうぎょ', s.mdf],
    ];
    rows.forEach((row, i) => {
      const col = i < 3 ? 0 : (i - 3) % 2;
      const rowY = i < 3 ? y + 78 + i * 24 : y + 78 + 3 * 24 + Math.floor((i - 3) / 2) * 24;
      const rx = x + 20 + col * (w / 2 - 10);
      r.text(row[0], rx, rowY, { size: 14, color: COLORS.textDim });
      r.text(`${row[1]}`, rx + (w / 2 - 90), rowY, { size: 14, color: COLORS.text });
    });
  },
};
