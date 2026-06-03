/**
 * scenes/ForgeScene.js
 * @layer presentation(scene)
 * 改造屋：キャラ→装備スロットを選び、ゴールドで装備を +N 強化する。
 * 強化値は member.enhById に保存（キャラ×アイテムごと）。
 */
import { Scene } from '../core/Scene.js';
import { VIEW_W, VIEW_H, COLORS, EQUIP_SLOTS } from '../config/constants.js';
import { CommandWindow } from '../ui/CommandWindow.js';
import { enhIncrement } from '../domain/value/Stats.js';

const SLOT_LABEL = { weapon: 'ぶき', shield: 'たて', head: 'あたま', body: 'からだ', acc1: 'アクセ1', acc2: 'アクセ2' };

export class ForgeScene extends Scene {
  constructor(game) { super(game); this.opaque = false; this.toast = ''; this.toastT = 0; }

  onEnter() {
    this.party = this.game.party.frontline().concat(
      this.game.state.party.reserve.map((id) => this.game.party.char(id)).filter(Boolean));
    this.state = 'char'; this.charIdx = 0; this.slotIdx = 0;
    this.charMenu = new CommandWindow(this.party.map((c) => ({ value: c.id, label: c.name })));
  }

  setToast(t) { this.toast = t; this.toastT = 130; }

  update() {
    const a = this.game.audio, input = this.game.input;
    if (this.toastT > 0) this.toastT--;
    if (this.state === 'char') {
      const res = this.charMenu.update(input, a);
      if (res === 'cancel') { a.se('cancel'); this.game.scenes.pop(); return; }
      if (res === 'confirm') { this.char = this.party[this.charMenu.index]; this.slotIdx = 0; this.state = 'slot'; }
    } else if (this.state === 'slot') {
      if (input.isPressed('up'))   { this.slotIdx = (this.slotIdx - 1 + EQUIP_SLOTS.length) % EQUIP_SLOTS.length; a.se('cursor'); }
      if (input.isPressed('down')) { this.slotIdx = (this.slotIdx + 1) % EQUIP_SLOTS.length; a.se('cursor'); }
      if (input.isPressed('cancel')) { a.se('cancel'); this.state = 'char'; return; }
      if (input.isPressed('confirm')) this.doUpgrade(a);
    }
  }

  doUpgrade(a) {
    const slot = EQUIP_SLOTS[this.slotIdx];
    const res = this.game.inventory.upgrade(this.char.member, slot);
    if (res.ok) {
      this.char.invalidate();
      a.se('levelup');
      const it = this.game.db.getItem(this.char.member.equip[slot]);
      this.setToast(`${it.name} を +${res.lv} に 強化した！（${res.cost}ギル）`);
    } else if (res.reason === 'no_item') { a.se('cancel'); this.setToast('そこには 装備が ない。'); }
    else if (res.reason === 'max') { a.se('cancel'); this.setToast('これ以上は 強化できない（+10）。'); }
    else if (res.reason === 'gold') { a.se('cancel'); this.setToast(`お金が たりない（${res.cost}ギル 必要）。`); }
  }

  render(r) {
    r.rect(0, 0, VIEW_W, VIEW_H, 'rgba(4,6,16,0.7)');
    r.window(16, 16, 180, 300);
    r.text('改造屋', 30, 26, { size: 18, color: COLORS.selected });
    r.text('だれの 装備を 強化?', 30, 54, { size: 13, color: COLORS.textDim });
    this.charMenu.render(r, 30, 84, 150);
    r.window(16, 326, 180, 46);
    r.text(`${this.game.party.gold} ギル`, 30, 340, { size: 16, color: COLORS.selected });

    const px = 210, pw = VIEW_W - px - 16;
    r.window(px, 16, pw, 440);
    const c = this.state === 'char' ? this.party[this.charMenu.index] : this.char;
    r.text(`${c.name} の そうび`, px + 16, 26, { size: 17, color: COLORS.selected });
    EQUIP_SLOTS.forEach((slot, i) => {
      const id = c.member.equip[slot];
      const it = id ? this.game.db.getItem(id) : null;
      const lv = id ? this.game.inventory.enhLevel(c.member, id) : 0;
      const sel = this.state === 'slot' && i === this.slotIdx;
      const y = 64 + i * 46;
      if (sel) r.text('▶', px + 16, y, { size: 16, color: COLORS.selected });
      r.text(SLOT_LABEL[slot], px + 40, y, { size: 14, color: COLORS.textDim });
      r.text(it ? `${it.name}${lv ? ` +${lv}` : ''}` : '—', px + 120, y, { size: 15, color: it ? COLORS.text : '#5a6488' });
      if (it) {
        const b = it.bonus || {};
        const main = it.type === 'weapon' ? `攻+${(b.atk || 0) + enhIncrement(b.atk) * lv}` : `守+${(b.def || 0) + enhIncrement(b.def) * lv}`;
        r.text(main, px + 120, y + 18, { size: 12, color: COLORS.hp });
        if (lv < 10) {
          const cost = this.game.inventory.upgradeCost(id, lv);
          r.text(`→+${lv + 1}: ${cost}ギル`, px + 300, y + 4, { size: 13, color: COLORS.selected });
        } else r.text('MAX', px + 300, y + 4, { size: 13, color: COLORS.textDim });
      }
    });
    r.text(this.state === 'char' ? '決定で キャラ選択' : '決定で 強化 / キャンセルで もどる', px + 16, VIEW_H - 30, { size: 12, color: COLORS.textDim });

    if (this.toastT > 0) {
      r.window(VIEW_W / 2 - 200, VIEW_H - 56, 400, 40);
      r.text(this.toast, VIEW_W / 2, VIEW_H - 46, { size: 14, align: 'center', color: COLORS.selected });
    }
  }
}
