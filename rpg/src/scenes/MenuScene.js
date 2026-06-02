/**
 * scenes/MenuScene.js
 * @layer presentation(scene)
 * フィールドメニュー：つよさ / どうぐ / そうび / じゅもん / セーブ / せってい。
 * 育成・装備変更・アイテム使用・セーブの入口。
 */
import { Scene } from '../core/Scene.js';
import { VIEW_W, VIEW_H, COLORS, EQUIP_SLOTS } from '../config/constants.js';
import { CommandWindow } from '../ui/CommandWindow.js';
import { MenuUI } from '../ui/MenuUI.js';
import { SettingsScene } from './SettingsScene.js';
import { SaveManager } from '../core/SaveManager.js';

const SLOT_LABEL = { weapon: 'ぶき', shield: 'たて', head: 'あたま', body: 'からだ', acc1: 'アクセ1', acc2: 'アクセ2' };

export class MenuScene extends Scene {
  constructor(game) { super(game); this.opaque = false; this.toast = ''; this.toastT = 0; }

  onEnter() {
    this.state = 'root';
    this.root = new CommandWindow([
      { value: 'status', label: 'つよさ' },
      { value: 'item', label: 'どうぐ' },
      { value: 'equip', label: 'そうび' },
      { value: 'skill', label: 'じゅもん' },
      { value: 'save', label: 'セーブ' },
      { value: 'config', label: 'せってい' },
      { value: 'close', label: 'とじる' },
    ]);
    this.party = this.game.party.frontline().concat(
      this.game.state.party.reserve.map((id) => this.game.party.char(id)).filter(Boolean));
  }
  onResume() {}

  setToast(t) { this.toast = t; this.toastT = 120; }

  update() {
    const input = this.game.input, a = this.game.audio;
    if (this.toastT > 0) this.toastT--;
    switch (this.state) {
      case 'root': return this.updRoot(a);
      case 'status': return this.updStatus(a);
      case 'item': return this.updItem(a);
      case 'item_target': return this.updItemTarget(a);
      case 'equip_char': return this.updEquipChar(a);
      case 'equip_slot': return this.updEquipSlot(a);
      case 'equip_item': return this.updEquipItem(a);
      case 'skill_char': return this.updSkillChar(a);
      case 'skill_view': return this.updSkillView(a);
      case 'save': return this.updSave(a);
    }
  }

  updRoot(a) {
    const res = this.root.update(this.game.input, a);
    if (res === 'cancel') return this.close();
    if (res !== 'confirm') return;
    switch (this.root.current.value) {
      case 'status': this.charIdx = 0; this.state = 'status'; break;
      case 'item': this.openItem(); break;
      case 'equip': this.openCharSelect('equip_char'); break;
      case 'skill': this.openCharSelect('skill_char'); break;
      case 'save': this.openSave(); break;
      case 'config': this.game.scenes.push(new SettingsScene(this.game)); break;
      case 'close': this.close();
    }
  }
  close() { this.game.audio.se('cancel'); this.game.scenes.pop(); }

  // --- つよさ ---
  updStatus(a) {
    if (this.game.input.isPressed('left'))  { this.charIdx = (this.charIdx - 1 + this.party.length) % this.party.length; a.se('cursor'); }
    if (this.game.input.isPressed('right')) { this.charIdx = (this.charIdx + 1) % this.party.length; a.se('cursor'); }
    if (this.game.input.isPressed('cancel')) { a.se('cancel'); this.state = 'root'; }
  }

  // --- どうぐ ---
  openItem() {
    const items = this.game.inventory.list();
    if (!items.length) { this.setToast('どうぐを 持っていない。'); return; }
    this.itemList = items;
    this.itemMenu = new CommandWindow(items.map((e) => ({
      value: e.id, label: e.item.name, sub: `×${e.count}`,
    })), { lineH: 26 });
    this.state = 'item';
  }
  updItem(a) {
    const res = this.itemMenu.update(this.game.input, a);
    if (res === 'cancel') { this.state = 'root'; return; }
    if (res !== 'confirm') return;
    const id = this.itemMenu.current.value;
    const it = this.game.db.getItem(id);
    const ef = it.effect || {};
    if (it.usableInField && (ef.hp || ef.mp || ef.cure || ef.revive)) {
      this.pendingItem = id; this.targetIdx = 0; this.state = 'item_target';
    } else {
      this.setToast('ここでは つかえない。');
    }
  }
  updItemTarget(a) {
    if (this.game.input.isPressed('up'))   { this.targetIdx = (this.targetIdx - 1 + this.party.length) % this.party.length; a.se('cursor'); }
    if (this.game.input.isPressed('down')) { this.targetIdx = (this.targetIdx + 1) % this.party.length; a.se('cursor'); }
    if (this.game.input.isPressed('cancel')) { this.state = 'item'; return; }
    if (this.game.input.isPressed('confirm')) {
      const target = this.party[this.targetIdx];
      const it = this.game.db.getItem(this.pendingItem);
      const ef = it.effect || {};
      if (ef.revive && !target.isDead) { this.setToast('効果が なかった。'); return; }
      if (!ef.revive && target.isDead) { this.setToast('せんとうふのうには つかえない。'); return; }
      this.game.inventory.remove(this.pendingItem, 1);
      if (ef.revive && target.isDead) target.curHp = Math.floor(target.maxHp * ef.revive);
      if (ef.hp) target.curHp += ef.hp;
      if (ef.mp) target.curMp += ef.mp;
      if (ef.cure) ef.cure.forEach((s) => { target.member.statusEffects = target.member.statusEffects.filter((x) => x.id !== s); });
      a.se('heal');
      this.setToast(`${target.name}に ${it.name}を つかった。`);
      if (!this.game.inventory.has(this.pendingItem)) { this.openItem(); }
      else { this.itemMenu.setItems(this.game.inventory.list().map((e) => ({ value: e.id, label: e.item.name, sub: `×${e.count}` }))); this.state = 'item'; }
    }
  }

  // --- そうび / じゅもん 共通：キャラ選択 ---
  openCharSelect(next) {
    this.charIdx = 0; this._afterChar = next; this.state = next;
  }
  updEquipChar(a) {
    if (this.charNav(a)) return;
    if (this.game.input.isPressed('confirm')) { this.char = this.party[this.charIdx]; this.slotIdx = 0; this.state = 'equip_slot'; a.se('confirm'); }
  }
  updSkillChar(a) {
    if (this.charNav(a)) return;
    if (this.game.input.isPressed('confirm')) { this.char = this.party[this.charIdx]; this.state = 'skill_view'; a.se('confirm'); }
  }
  charNav(a) {
    if (this.game.input.isPressed('up'))   { this.charIdx = (this.charIdx - 1 + this.party.length) % this.party.length; a.se('cursor'); }
    if (this.game.input.isPressed('down')) { this.charIdx = (this.charIdx + 1) % this.party.length; a.se('cursor'); }
    if (this.game.input.isPressed('cancel')) { a.se('cancel'); this.state = 'root'; return true; }
    return false;
  }

  // --- そうび：スロット選択 → アイテム選択 ---
  updEquipSlot(a) {
    if (this.game.input.isPressed('up'))   { this.slotIdx = (this.slotIdx - 1 + EQUIP_SLOTS.length) % EQUIP_SLOTS.length; a.se('cursor'); }
    if (this.game.input.isPressed('down')) { this.slotIdx = (this.slotIdx + 1) % EQUIP_SLOTS.length; a.se('cursor'); }
    if (this.game.input.isPressed('cancel')) { a.se('cancel'); this.state = 'equip_char'; return; }
    if (this.game.input.isPressed('confirm')) { this.openEquipItems(); }
  }
  openEquipItems() {
    const slot = EQUIP_SLOTS[this.slotIdx];
    const wanted = slot === 'weapon' ? ['weapon'] : slot === 'shield' ? ['shield'] :
      slot === 'head' ? ['head'] : slot === 'body' ? ['body'] : ['accessory'];
    const candidates = this.game.inventory.list().filter((e) =>
      wanted.includes(e.item.type) && this.game.inventory.canEquip(this.char, e.id));
    const items = [{ value: '__none', label: '（はずす）' }].concat(candidates.map((e) => ({
      value: e.id, label: e.item.name, sub: this.equipDelta(slot, e.id),
    })));
    this.equipMenu = new CommandWindow(items, { lineH: 26 });
    this.state = 'equip_item';
  }
  equipDelta(slot, itemId) {
    const it = this.game.db.getItem(itemId);
    const b = it.bonus || {};
    const main = slot === 'weapon' ? `攻+${b.atk || 0}` : (b.def ? `守+${b.def}` : (b.mdf ? `魔守+${b.mdf}` : ''));
    return main;
  }
  updEquipItem(a) {
    const res = this.equipMenu.update(this.game.input, a);
    if (res === 'cancel') { this.state = 'equip_slot'; return; }
    if (res !== 'confirm') return;
    const slot = EQUIP_SLOTS[this.slotIdx];
    const v = this.equipMenu.current.value;
    if (v === '__none') {
      const prev = this.char.member.equip[slot];
      if (prev) { this.game.inventory.add(prev, 1); this.char.unequip(slot); a.se('confirm'); this.setToast('はずした。'); }
    } else {
      this.game.inventory.equip(this.char, v, slot);
      a.se('confirm'); this.setToast(`${this.game.db.getItem(v).name}を そうびした。`);
    }
    this.char.ensureVitals();
    this.state = 'equip_slot';
  }
  updSkillView(a) {
    if (this.game.input.isPressed('cancel')) { a.se('cancel'); this.state = 'skill_char'; }
  }

  // --- セーブ ---
  openSave() {
    const list = SaveManager.list();
    this.saveMenu = new CommandWindow(list.filter((s) => s.slot > 0).map((s) => ({
      value: s.slot, label: `スロット${s.slot}`, sub: s.empty ? '空き' : `${s.chapter} Lv${s.level ?? '-'}`,
    })), { lineH: 28 });
    this.state = 'save';
  }
  updSave(a) {
    const res = this.saveMenu.update(this.game.input, a);
    if (res === 'cancel') { this.state = 'root'; return; }
    if (res !== 'confirm') return;
    // 現在地を同期してから保存（直前のFieldSceneがstackにある）
    const field = this.game.scenes.stack.find((s) => s.syncLocation);
    field?.syncLocation();
    const ok = SaveManager.save(this.saveMenu.current.value, this.game.state, this.game.db);
    a.se(ok ? 'confirm' : 'cancel');
    this.setToast(ok ? 'ぼうけんのしょに きろくした！' : 'きろくに しっぱいした。');
    this.openSave();
  }

  // =================== RENDER ===================
  render(r) {
    r.rect(0, 0, VIEW_W, VIEW_H, 'rgba(4,6,16,0.7)');
    // 左：ルートメニュー
    r.window(16, 16, 150, 250);
    this.root.render(r, 30, 30, 130);
    r.window(16, 276, 150, 50);
    r.text(`${this.game.party.gold} ギル`, 30, 292, { size: 16, color: COLORS.selected });

    const px = 180, pw = 200;
    switch (this.state) {
      case 'root':
        MenuUI.partyList(r, this.party, px, 16, pw, -1); break;
      case 'status':
        MenuUI.detail(r, this.party[this.charIdx], px, 16, VIEW_W - px - 16, 440);
        r.text('← →で キャラ切替', VIEW_W - 220, VIEW_H - 26, { size: 12, color: COLORS.textDim }); break;
      case 'item': case 'item_target':
        r.window(px, 16, 300, 360); this.itemMenu.render(r, px + 14, 30, 280);
        if (this.state === 'item_target') {
          MenuUI.partyList(r, this.party, px + 320, 16, 200, this.targetIdx);
          r.text('だれに つかう？', px + 320, VIEW_H - 70, { size: 13, color: COLORS.selected });
        } else {
          const e = this.itemList[this.itemMenu.index];
          if (e) { r.window(px + 320, 16, 200, 130); r.text(e.item.name, px + 334, 30, { size: 16, color: COLORS.selected });
            wrapText(r, e.item.desc || '', px + 334, 58, 170, 16); }
        }
        break;
      case 'equip_char': case 'skill_char':
        MenuUI.partyList(r, this.party, px, 16, pw, this.charIdx);
        r.text(this.state === 'equip_char' ? 'だれの そうび？' : 'だれの じゅもん？', px, VIEW_H - 40, { size: 14, color: COLORS.selected });
        break;
      case 'equip_slot': case 'equip_item':
        this.renderEquip(r, px); break;
      case 'skill_view':
        this.renderSkills(r, px); break;
      case 'save':
        r.window(px, 16, 340, 220); r.text('どこに きろくする？', px + 14, 24, { size: 15, color: COLORS.textDim });
        this.saveMenu.render(r, px + 14, 54, 310); break;
    }
    if (this.toastT > 0) {
      r.window(VIEW_W / 2 - 180, VIEW_H - 56, 360, 40);
      r.text(this.toast, VIEW_W / 2, VIEW_H - 46, { size: 15, align: 'center', color: COLORS.selected });
    }
  }

  renderEquip(r, px) {
    const c = this.char;
    r.window(px, 16, 250, 230); r.text(`${c.name} の そうび`, px + 14, 26, { size: 16, color: COLORS.selected });
    EQUIP_SLOTS.forEach((slot, i) => {
      const sel = (this.state === 'equip_slot') && i === this.slotIdx;
      const itId = c.member.equip[slot];
      const name = itId ? this.game.db.getItem(itId)?.name : '—';
      if (sel) r.text('▶', px + 14, 62 + i * 30, { size: 16, color: COLORS.selected });
      r.text(SLOT_LABEL[slot], px + 34, 62 + i * 30, { size: 14, color: COLORS.textDim });
      r.text(name, px + 110, 62 + i * 30, { size: 14, color: sel ? COLORS.selected : COLORS.text });
    });
    if (this.state === 'equip_item') {
      r.window(px + 260, 16, 250, 360); r.text(`${SLOT_LABEL[EQUIP_SLOTS[this.slotIdx]]}を えらぶ`, px + 274, 26, { size: 14, color: COLORS.textDim });
      this.equipMenu.render(r, px + 274, 56, 230);
    }
  }
  renderSkills(r, px) {
    const c = this.char;
    r.window(px, 16, VIEW_W - px - 16, 440);
    r.text(`${c.name} の おぼえている じゅもん／スキル`, px + 14, 26, { size: 15, color: COLORS.selected });
    const skills = c.skills.map((id) => this.game.db.getSkill(id)).filter(Boolean);
    skills.forEach((sk, i) => {
      const y = 62 + i * 34;
      r.text(sk.name, px + 20, y, { size: 16 });
      r.text(sk.mp ? `MP${sk.mp}` : '', px + 150, y, { size: 13, color: COLORS.mp });
      r.text(sk.desc || '', px + 210, y, { size: 13, color: COLORS.textDim });
    });
    r.text('キャンセルで もどる', px + 14, VIEW_H - 30, { size: 12, color: COLORS.textDim });
  }
}

// 簡易ワードラップ（日本語は文字数で折る）
function wrapText(r, text, x, y, w, size) {
  const perLine = Math.floor(w / (size * 0.95));
  let line = 0;
  for (let i = 0; i < text.length; i += perLine) {
    r.text(text.slice(i, i + perLine), x, y + line * (size + 4), { size, color: '#cfe' });
    line++;
  }
}
