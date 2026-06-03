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
import { ELEMENT_LABEL } from '../config/constants.js';

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
      if (input.isPressed('confirm')) this.onSlotConfirm(a);
    } else if (this.state === 'action') {
      const res = this.actionMenu.update(input, a);
      if (res === 'cancel') { this.state = 'slot'; return; }
      if (res === 'confirm') {
        const v = this.actionMenu.current.value;
        if (v === 'upgrade') { this.doUpgrade(a); this.state = 'slot'; }
        else if (v === 'imbue') this.openImbue(a);
        else this.state = 'slot';
      }
    } else if (this.state === 'element') {
      const res = this.elemMenu.update(input, a);
      if (res === 'cancel') { this.state = 'action'; return; }
      if (res === 'confirm') this.doImbue(a, this.elemMenu.current.value);
    }
  }

  onSlotConfirm(a) {
    const slot = EQUIP_SLOTS[this.slotIdx];
    if (!this.char.member.equip[slot]) { a.se('cancel'); this.setToast('そこには 装備が ない。'); return; }
    if (slot === 'weapon') {
      a.se('confirm');
      this.actionMenu = new CommandWindow([
        { value: 'upgrade', label: '強化する (+N)' },
        { value: 'imbue', label: '属性を つける' },
        { value: 'back', label: 'やめる' },
      ]);
      this.state = 'action';
    } else this.doUpgrade(a);
  }

  openImbue(a) {
    const crystals = this.game.inventory.list('material').filter((e) => e.item.imbueElement);
    if (!crystals.length) { a.se('cancel'); this.setToast('結晶を 持っていない（武器防具屋で 買える）。'); return; }
    this.elemMenu = new CommandWindow(crystals.map((e) => ({
      value: e.id, label: `${e.item.name}（${ELEMENT_LABEL[e.item.imbueElement]}）`, sub: `×${e.count}`,
    })));
    this.state = 'element';
  }

  doImbue(a, crystalId) {
    const res = this.game.inventory.imbue(this.char.member, crystalId);
    if (res.ok) {
      this.char.invalidate();
      a.se('magic');
      const w = this.game.db.getItem(this.char.member.equip.weapon);
      this.setToast(`${w.name} に ${ELEMENT_LABEL[res.element]}属性を つけた！`);
      this.state = 'slot';
    } else if (res.reason === 'gold') { a.se('cancel'); this.setToast(`お金が たりない（${res.cost}ギル）。`); }
    else { a.se('cancel'); this.setToast('付与できなかった。'); }
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
      const imbue = id ? this.game.inventory.imbuedElement(c.member, id) : null;
      const elem = it && slot === 'weapon' ? (imbue || it.element) : null;
      const elemTag = elem && elem !== 'none' ? ` [${ELEMENT_LABEL[elem]}]` : '';
      r.text(it ? `${it.name}${lv ? ` +${lv}` : ''}${elemTag}` : '—', px + 120, y, { size: 15, color: it ? COLORS.text : '#5a6488' });
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
    r.text(this.state === 'char' ? '決定で キャラ選択' : '武器は 強化／属性付与が 選べる', px + 16, VIEW_H - 30, { size: 12, color: COLORS.textDim });

    // 武器スロットのアクション／属性選択メニュー（オーバーレイ）
    if (this.state === 'action') {
      r.window(px + 200, 60, 200, 130);
      r.text('武器を…', px + 214, 70, { size: 13, color: COLORS.textDim });
      this.actionMenu.render(r, px + 214, 96, 180);
    } else if (this.state === 'element') {
      r.window(px + 180, 60, 230, 240);
      r.text('どの 結晶を 使う?', px + 194, 70, { size: 13, color: COLORS.textDim });
      this.elemMenu.render(r, px + 194, 96, 210);
    }

    if (this.toastT > 0) {
      r.window(VIEW_W / 2 - 200, VIEW_H - 56, 400, 40);
      r.text(this.toast, VIEW_W / 2, VIEW_H - 46, { size: 14, align: 'center', color: COLORS.selected });
    }
  }
}
