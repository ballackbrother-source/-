/**
 * scenes/MenuScene.js
 * @layer presentation(scene)
 * フィールドメニュー：つよさ / どうぐ / そうび / じゅもん / セーブ / せってい。
 * 育成・装備変更・アイテム使用・セーブの入口。
 */
import { Scene } from '../core/Scene.js';
import { VIEW_W, VIEW_H, COLORS, EQUIP_SLOTS, ELEMENT_LABEL } from '../config/constants.js';
import { CommandWindow } from '../ui/CommandWindow.js';
import { MenuUI } from '../ui/MenuUI.js';
import { SettingsScene } from './SettingsScene.js';
import { SaveManager } from '../core/SaveManager.js';
import { checkDexRewards } from '../domain/systems/DexRewards.js';

const SLOT_LABEL = { weapon: 'ぶき', shield: 'たて', head: 'あたま', body: 'からだ', acc1: 'アクセ1', acc2: 'アクセ2' };

// 系統→色（図鑑スプライト用。BattleUIと同方針）
const FAM_COLOR = {
  beast: '#b9783f', plant: '#4caf50', insect: '#9ccc3f', undead: '#c8d0d8',
  machine: '#9aa6b8', aqua: '#3fa9d8', flying: '#d8c23f', dragon: '#c0392b',
  elemental: '#e0533f', demon: '#7e57c2', boss: '#b03060', slime: '#5fd38a',
  mage: '#6a5acd', spirit: '#6fd0ff',
};

export class MenuScene extends Scene {
  constructor(game) { super(game); this.opaque = false; this.toast = ''; this.toastT = 0; }

  onEnter() {
    this.state = 'root';
    this.root = new CommandWindow([
      { value: 'status', label: 'つよさ' },
      { value: 'item', label: 'どうぐ' },
      { value: 'equip', label: 'そうび' },
      { value: 'skill', label: 'じゅもん' },
      { value: 'formation', label: 'メンバー' },
      { value: 'bestiary', label: 'ずかん' },
      { value: 'save', label: 'セーブ' },
      { value: 'config', label: 'せってい' },
      { value: 'title', label: 'タイトルへ' },
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
      case 'formation': return this.updFormation(a);
      case 'bestiary': return this.updBestiary(a);
      case 'quit': return this.updQuit(a);
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
      case 'formation': this.openFormation(); break;
      case 'bestiary': this.openBestiary(); break;
      case 'save': this.openSave(); break;
      case 'config': this.game.scenes.push(new SettingsScene(this.game)); break;
      case 'title': this.openQuit(); break;
      case 'close': this.close();
    }
  }

  openQuit() {
    this.quitMenu = new CommandWindow([
      { value: 'no', label: 'いいえ' },
      { value: 'yes', label: 'はい（タイトルへ）' },
    ]);
    this.state = 'quit';
  }
  updQuit(a) {
    const res = this.quitMenu.update(this.game.input, a);
    if (res === 'cancel') { a.se('cancel'); this.state = 'root'; return; }
    if (res === 'confirm') {
      if (this.quitMenu.current.value === 'yes') {
        a.se('confirm');
        import('./TitleScene.js').then(({ TitleScene }) => {
          this.game.audio.stopBgm();
          this.game.scenes.reset(new TitleScene(this.game));
        });
      } else { this.state = 'root'; }
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
    if (it.usableInField && (ef.hp || ef.mp || ef.cure || ef.revive || ef.raise)) {
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
      if (ef.raise) { // 永続ステータスアップ
        const bs = (target.member.bonusStats ||= {});
        for (const [k, v] of Object.entries(ef.raise)) bs[k] = (bs[k] || 0) + v;
        target.invalidate();
      }
      a.se(ef.raise ? 'levelup' : 'heal');
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

  // --- メンバー編成（前衛↔控え 入れ替え） ---
  openFormation() { this.fmIdx = 0; this.fmGrab = -1; this.state = 'formation'; }
  get fmFlat() { return [...this.game.state.party.order, ...this.game.state.party.reserve]; }
  get fmFront() { return this.game.state.party.order.length; }
  refreshParty() {
    this.party = this.game.party.frontline().concat(
      this.game.state.party.reserve.map((id) => this.game.party.char(id)).filter(Boolean));
  }
  updFormation(a) {
    const input = this.game.input;
    const n = this.fmFlat.length;
    if (input.isPressed('up'))   { this.fmIdx = (this.fmIdx - 1 + n) % n; a.se('cursor'); }
    if (input.isPressed('down')) { this.fmIdx = (this.fmIdx + 1) % n; a.se('cursor'); }
    if (input.isPressed('cancel')) {
      if (this.fmGrab >= 0) { this.fmGrab = -1; a.se('cancel'); }
      else { a.se('cancel'); this.state = 'root'; }
      return;
    }
    if (input.isPressed('confirm')) {
      if (this.fmGrab < 0) { this.fmGrab = this.fmIdx; a.se('confirm'); }
      else {
        if (this.fmGrab !== this.fmIdx) {
          this.game.party.swapPositions(this.fmGrab, this.fmIdx);
          a.se('confirm'); this.setToast('へんせいを 変えた。'); this.refreshParty();
        } else a.se('cancel');
        this.fmGrab = -1;
      }
    }
  }

  // --- 図鑑（モンスター / アイテム タブ切替） ---
  openBestiary() {
    this.bestMode = 'monster';
    this.monIds = Object.keys(this.game.db.monsters).filter((id) => !this.game.db.monsters[id].dexExclude);
    this.itemIds = Object.keys(this.game.db.items);
    this.monIdx = 0; this.itemIdx = 0;
    this.state = 'bestiary';
    const rewards = checkDexRewards(this.game);
    if (rewards.length) { this.setToast(rewards[rewards.length - 1]); this.game.audio.se('levelup'); }
  }
  updBestiary(a) {
    const input = this.game.input;
    if (input.isPressed('left') || input.isPressed('right')) {
      this.bestMode = this.bestMode === 'monster' ? 'item' : 'monster'; a.se('cursor');
    }
    const ids = this.bestMode === 'monster' ? this.monIds : this.itemIds;
    const key = this.bestMode === 'monster' ? 'monIdx' : 'itemIdx';
    if (input.isPressed('up'))   { this[key] = (this[key] - 1 + ids.length) % ids.length; a.se('cursor'); }
    if (input.isPressed('down')) { this[key] = (this[key] + 1) % ids.length; a.se('cursor'); }
    if (input.isPressed('cancel')) { a.se('cancel'); this.state = 'root'; }
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
      case 'formation':
        this.renderFormation(r, px); break;
      case 'bestiary':
        this.renderBestiary(r, px); break;
      case 'quit':
        r.window(px, 60, 320, 130);
        r.text('タイトルに もどりますか?', px + 20, 80, { size: 16, color: COLORS.selected });
        r.text('（セーブしていない 進行は 失われます）', px + 20, 108, { size: 12, color: COLORS.textDim });
        this.quitMenu.render(r, px + 20, 132, 280);
        break;
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
      const lv = itId ? this.game.inventory.enhLevel(c.member, itId) : 0;
      const name = itId ? `${this.game.db.getItem(itId)?.name}${lv ? ` +${lv}` : ''}` : '—';
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
  renderFormation(r, px) {
    r.window(px, 16, VIEW_W - px - 16, 440);
    r.text('メンバー編成', px + 14, 24, { size: 16, color: COLORS.selected });
    r.text('決定で つかむ → もう一度 決定で 入れ替え', px + 14, 48, { size: 12, color: COLORS.textDim });
    const flat = this.fmFlat, front = this.fmFront;
    flat.forEach((id, i) => {
      const c = this.game.party.char(id);
      const y = 78 + i * 44;
      const sel = i === this.fmIdx, grab = i === this.fmGrab;
      const zone = i < front ? '前衛' : '控え';
      const zc = i < front ? COLORS.hp : COLORS.textDim;
      if (sel) r.text(grab ? '◆' : '▶', px + 14, y, { size: 18, color: COLORS.selected });
      r.text(`[${zone}]`, px + 36, y, { size: 13, color: zc });
      r.text(c ? c.name : id, px + 96, y, { size: 17, color: grab ? COLORS.selected : COLORS.text });
      if (c) {
        r.text(`Lv${c.lv}`, px + 220, y, { size: 14, color: COLORS.textDim });
        r.gauge(px + 270, y + 4, 120, 8, c.curHp / c.maxHp, COLORS.hp);
        r.text(`${c.curHp}/${c.maxHp}`, px + 270, y + 14, { size: 11, color: COLORS.textDim });
      }
    });
    r.text('前衛(上から4人)が 戦闘に 参加。控えにも 経験値が 入る。', px + 14, VIEW_H - 30, { size: 12, color: COLORS.textDim });
  }

  renderBestiary(r, px) {
    // タブヘッダ
    r.text('◀ モンスター ／ アイテム ▶', px, 0, { size: 12, color: COLORS.textDim });
    const titles = this.game.state.titles || [];
    if (titles.length) r.text(`称号: ${titles.join('・')}`, px + 250, 0, { size: 12, color: COLORS.selected });
    if (this.bestMode === 'monster') this.renderMonDex(r, px);
    else this.renderItemDex(r, px);
  }

  renderMonDex(r, px) {
    const db = this.game.db, b = this.game.state.bestiary;
    const ids = this.monIds, total = ids.length;
    const defeated = ids.filter((id) => b.defeated.includes(id)).length;
    const listW = 210;
    r.window(px, 16, listW, 440);
    r.text(`モンスター ${defeated}/${total}  (←→で切替)`, px + 12, 24, { size: 13, color: COLORS.selected });
    const rows = 11, start = Math.max(0, Math.min(this.monIdx - 5, Math.max(0, total - rows)));
    for (let k = 0; k < rows && start + k < total; k++) {
      const i = start + k, id = ids[i];
      const seen = b.seen.includes(id), beat = b.defeated.includes(id);
      const def = db.getMonster(id);
      const label = seen ? def.name : '？？？？？';
      const y = 54 + k * 33;
      if (i === this.monIdx) r.text('▶', px + 10, y, { size: 16, color: COLORS.selected });
      r.text(`${String(i + 1).padStart(2, '0')}`, px + 28, y, { size: 12, color: COLORS.textDim });
      r.text(label, px + 56, y, { size: 15, color: beat ? COLORS.text : (seen ? COLORS.textDim : '#5a6488') });
    }
    const dx = px + listW + 12, dw = VIEW_W - dx - 16;
    r.window(dx, 16, dw, 440);
    const id = ids[this.monIdx], def = db.getMonster(id);
    const seen = b.seen.includes(id), beat = b.defeated.includes(id);
    if (!seen) {
      r.text('？？？？？', dx + dw / 2, 200, { size: 28, align: 'center', color: '#5a6488' });
      r.text('まだ 出会っていない', dx + dw / 2, 240, { size: 14, align: 'center', color: COLORS.textDim });
      return;
    }
    this.game.assets.drawMonster(r.ctx, dx + dw / 2, 96, def.family, FAM_COLOR[def.family] || '#aa6cc8', def.boss ? 1.3 : 1.0, performance.now() / 16);
    r.text(def.name, dx + dw / 2, 150, { size: 20, align: 'center', color: COLORS.selected });
    if (!beat) { r.text('（討伐すると 詳細が 見られる）', dx + dw / 2, 188, { size: 13, align: 'center', color: COLORS.textDim }); return; }
    const s = def.stats, el = def.element || {};
    const join = (arr) => (arr && arr.length ? arr.map((e) => ELEMENT_LABEL[e] || e).join('・') : 'なし');
    [['さいだいHP', s.hp], ['こうげき', s.atk], ['しゅび', s.def], ['まこうげき', s.mat || 0],
     ['すばやさ', s.agi], ['EXP', def.exp], ['ゴールド', def.gold]].forEach((row, i) => {
      const y = 196 + i * 24;
      r.text(row[0], dx + 24, y, { size: 14, color: COLORS.textDim });
      r.text(`${row[1]}`, dx + 170, y, { size: 14 });
    });
    let yy = 196 + 7 * 24 + 6;
    r.text(`よわ点：${join(el.weak)}`, dx + 24, yy, { size: 13, color: '#ff9a9a' }); yy += 22;
    r.text(`半減：${join(el.resist)}　吸収：${join(el.absorb)}`, dx + 24, yy, { size: 13, color: COLORS.mp }); yy += 22;
    if (def.steal) {
      const sid = Array.isArray(def.steal) ? def.steal[0].item : def.steal.item;
      const it = db.getItem(sid);
      r.text(`ぬすめる：${it ? it.name : '—'}`, dx + 24, yy, { size: 13, color: '#ffd23f' });
    }
  }

  renderItemDex(r, px) {
    const db = this.game.db;
    const dex = this.game.state.bestiary.items || [];
    const ids = this.itemIds, total = ids.length, found = ids.filter((id) => dex.includes(id)).length;
    const listW = 230;
    r.window(px, 16, listW, 440);
    r.text(`アイテム ${found}/${total}  (←→で切替)`, px + 12, 24, { size: 13, color: COLORS.selected });
    const rows = 11, start = Math.max(0, Math.min(this.itemIdx - 5, Math.max(0, total - rows)));
    for (let k = 0; k < rows && start + k < total; k++) {
      const i = start + k, id = ids[i];
      const has = dex.includes(id), it = db.getItem(id);
      const y = 54 + k * 33;
      if (i === this.itemIdx) r.text('▶', px + 10, y, { size: 16, color: COLORS.selected });
      r.text(`${String(i + 1).padStart(2, '0')}`, px + 28, y, { size: 12, color: COLORS.textDim });
      r.text(has ? it.name : '？？？？？', px + 56, y, { size: 15, color: has ? COLORS.text : '#5a6488' });
    }
    const dx = px + listW + 12, dw = VIEW_W - dx - 16;
    r.window(dx, 16, dw, 440);
    const id = ids[this.itemIdx], it = db.getItem(id), has = dex.includes(id);
    if (!has) {
      r.text('？？？？？', dx + dw / 2, 200, { size: 26, align: 'center', color: '#5a6488' });
      r.text('まだ 手に入れていない', dx + dw / 2, 238, { size: 14, align: 'center', color: COLORS.textDim });
      return;
    }
    const TYPE = { weapon: 'ぶき', shield: 'たて', head: 'あたま', body: 'からだ', accessory: 'アクセサリ', consumable: 'どうぐ', key: 'だいじなもの', material: 'そざい' };
    r.text(it.name, dx + 20, 36, { size: 20, color: COLORS.selected });
    r.text(`種別：${TYPE[it.type] || it.type}`, dx + 20, 72, { size: 14, color: COLORS.textDim });
    if (it.price) r.text(`売値：${Math.floor(it.price * 0.5)} ギル`, dx + 20, 96, { size: 14, color: COLORS.textDim });
    let yy = 128;
    const b = it.bonus || {};
    const bparts = [];
    if (b.atk) bparts.push(`攻+${b.atk}`); if (b.def) bparts.push(`守+${b.def}`);
    if (b.mat) bparts.push(`魔攻+${b.mat}`); if (b.mdf) bparts.push(`魔守+${b.mdf}`);
    ['str', 'vit', 'agi', 'dex', 'int', 'spi', 'luk', 'hp', 'mp'].forEach((k) => { if (b[k]) bparts.push(`${k.toUpperCase()}+${b[k]}`); });
    if (it.element) bparts.push(`${ELEMENT_LABEL[it.element]}属性`);
    if (bparts.length) { r.text(`効果：${bparts.join(' ')}`, dx + 20, yy, { size: 14, color: COLORS.hp }); yy += 26; }
    const ef = it.effect || {};
    const eparts = [];
    if (ef.hp) eparts.push(`HP+${ef.hp}`); if (ef.mp) eparts.push(`MP+${ef.mp}`);
    if (ef.revive) eparts.push('そせい'); if (ef.cure) eparts.push('状態かいふく');
    if (ef.inflict) {
      const sj = { poison: 'どく', sleep: 'ねむり', paralyze: 'まひ', silence: 'ちんもく', confuse: 'こんらん', blind: 'くらやみ' };
      eparts.push(`${sj[ef.inflict.status] || '状態異常'}を 付与`);
    }
    if (eparts.length) { r.text(`効果：${eparts.join(' ')}`, dx + 20, yy, { size: 14, color: COLORS.hp }); yy += 26; }
    wrapText(r, it.desc || '', dx + 20, yy + 4, dw - 40, 15);
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
