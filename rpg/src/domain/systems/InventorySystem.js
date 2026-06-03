/**
 * domain/systems/InventorySystem.js
 * @layer domain
 * 所持品・装備変更・売買（§04-5, §08）。GameState.inventory を操作。
 */
export class InventorySystem {
  constructor(state, db) { this.state = state; this.db = db; }

  count(itemId) { return this.state.inventory.items[itemId] || 0; }

  add(itemId, n = 1) {
    this.state.inventory.items[itemId] = this.count(itemId) + n;
    // アイテム図鑑：入手履歴を記録
    const dex = (this.state.bestiary ||= {}).items ||= [];
    if (!dex.includes(itemId)) dex.push(itemId);
  }
  remove(itemId, n = 1) {
    const c = this.count(itemId) - n;
    if (c <= 0) delete this.state.inventory.items[itemId];
    else this.state.inventory.items[itemId] = c;
  }
  has(itemId, n = 1) { return this.count(itemId) >= n; }

  /** 所持アイテム一覧 [{id, item, count}] */
  list(filterType = null) {
    return Object.entries(this.state.inventory.items)
      .map(([id, count]) => ({ id, count, item: this.db.getItem(id) }))
      .filter((e) => e.item && (!filterType || e.item.type === filterType));
  }

  /** 装備可能判定（武器種・対象キャラ） */
  canEquip(character, itemId) {
    const it = this.db.getItem(itemId);
    if (!it) return false;
    if (it.type === 'weapon') {
      return !it.weaponType || it.weaponType === this.db.getCharacter(character.id).weaponType;
    }
    return ['shield', 'head', 'body', 'accessory'].includes(it.type);
  }

  slotOf(item) {
    if (item.type === 'weapon') return 'weapon';
    if (item.type === 'shield') return 'shield';
    if (item.type === 'head') return 'head';
    if (item.type === 'body') return 'body';
    if (item.type === 'accessory') return 'acc1';
    return null;
  }

  /** 装備変更：外した装備は在庫へ戻す */
  equip(character, itemId, slotHint = null) {
    const it = this.db.getItem(itemId);
    if (!it || !this.has(itemId)) return false;
    const slot = slotHint || this.slotOf(it);
    if (!slot) return false;
    const prev = character.member.equip[slot];
    this.remove(itemId, 1);
    if (prev) this.add(prev, 1);
    character.equip(slot, itemId);
    return true;
  }

  buy(itemId) {
    const it = this.db.getItem(itemId);
    if (!it || this.state.party.gold < it.price) return false;
    this.state.party.gold -= it.price;
    this.add(itemId, 1);
    return true;
  }
  sell(itemId) {
    const it = this.db.getItem(itemId);
    if (!it || !this.has(itemId)) return false;
    this.remove(itemId, 1);
    this.state.party.gold += Math.floor(it.price * 0.5);
    return true;
  }
}
