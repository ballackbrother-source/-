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

  /**
   * 仲間を隊列から外す（裏切り・離脱）。
   * メンバーレコード（Lv/装備）は保持し、再加入時に進行を引き継げるようにする。
   */
  removeMember(id) {
    const wasFront = this.state.party.order.includes(id);
    this.state.party.order = this.state.party.order.filter((x) => x !== id);
    this.state.party.reserve = this.state.party.reserve.filter((x) => x !== id);
    // 前衛が抜けたら、控えから自動で繰り上げる（離脱後も戦力を保つ）
    if (wasFront && this.state.party.reserve.length && this.state.party.order.length < 4) {
      this.state.party.order.push(this.state.party.reserve.shift());
    }
  }

  /** 前衛(order)/控え(reserve)を結合した並びで、2つの位置を入れ替える（編成変更） */
  swapPositions(i, j) {
    const flat = [...this.state.party.order, ...this.state.party.reserve];
    if (i < 0 || j < 0 || i >= flat.length || j >= flat.length) return;
    [flat[i], flat[j]] = [flat[j], flat[i]];
    const frontCount = this.state.party.order.length; // 前衛枠数は維持
    this.state.party.order = flat.slice(0, frontCount);
    this.state.party.reserve = flat.slice(frontCount);
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
