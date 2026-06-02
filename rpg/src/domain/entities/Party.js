/**
 * domain/entities/Party.js
 * @layer domain
 * パーティ操作のファサード。GameStateのparty/inventoryをラップし、
 * Characterインスタンスの生成・隊列・所持金・EXP配分などを担う。
 */
import { Character } from './Character.js';
import { GameState } from '../../core/GameState.js';

export class Party {
  constructor(state, db) {
    this.state = state;
    this.db = db;
    this._chars = new Map(); // id -> Character（生成キャッシュ）
  }

  char(id) {
    if (!this._chars.has(id)) {
      const m = this.state.party.members.find((x) => x.id === id);
      if (!m) return null;
      this._chars.set(id, new Character(m, this.db));
    }
    return this._chars.get(id);
  }

  /** 戦闘参加メンバー（前衛・最大4） */
  frontline() {
    return this.state.party.order.slice(0, 4).map((id) => this.char(id)).filter(Boolean);
  }
  all() {
    return [...this.state.party.order, ...this.state.party.reserve]
      .map((id) => this.char(id)).filter(Boolean);
  }
  leader() { return this.char(this.state.party.order[0]); }

  get gold() { return this.state.party.gold; }
  gainGold(n) { this.state.party.gold = Math.max(0, this.state.party.gold + n); }

  addMember(id) {
    if (!this.state.party.members.find((m) => m.id === id)) {
      this.state.party.members.push(GameState.initMember(this.db, id));
    }
    if (!this.state.party.order.includes(id) && !this.state.party.reserve.includes(id)) {
      if (this.state.party.order.length < 4) this.state.party.order.push(id);
      else this.state.party.reserve.push(id);
    }
  }

  /** 全回復（宿屋/教会） */
  fullHeal() {
    for (const c of this.all()) {
      c.invalidate();
      c.curHp = c.maxHp; c.curMp = c.maxMp;
      c.member.statusEffects = [];
    }
  }
}
