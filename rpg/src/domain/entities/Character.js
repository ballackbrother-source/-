/**
 * domain/entities/Character.js
 * @layer domain
 * 仲間キャラ。GameStateの可変レコード(member)とDatabase定義を合成して
 * 「育成・装備・戦闘」のふるまいを提供する。戦闘での共通I/Fも満たす。
 */
import { computeStats } from '../value/Stats.js';
import { clamp } from '../../core/util.js';

export class Character {
  constructor(member, db) {
    this.member = member;   // GameState.party.members[] の要素（可変・セーブ対象）
    this.db = db;
    this._stats = null;
    this.isPlayer = true;
    this.ensureVitals();
  }

  get id()   { return this.member.id; }
  get def()  { return this.db.getCharacter(this.id); }
  get name() { return this.def.name; }
  get lv()   { return this.member.lv; }
  get exp()  { return this.member.exp; }

  get stats() { return (this._stats ||= computeStats(this.member, this.db)); }
  invalidate() { this._stats = null; this.ensureVitals(); }

  // 二次パラメータ（戦闘共通I/F）
  get maxHp() { return this.stats.maxHp; }
  get maxMp() { return this.stats.maxMp; }
  get atk()   { return this.stats.atk; }
  get def_()  { return this.stats.def; } // 'def' はメソッド名衝突回避
  get mat()   { return this.stats.mat; }
  get mdf()   { return this.stats.mdf; }
  get agi()   { return this.stats.agi; }
  get dex()   { return this.stats.dex; }
  get luk()   { return this.stats.luk; }
  get eva()   { return this.stats.eva; }
  get crit()  { return this.stats.crit; }
  get affinity() { return this.stats.affinity; }
  get weaponElement() { return this.stats.weaponElement; }
  /** 装備中の武器に刻まれた銘（吸血/会心/連撃）。無ければnull */
  get weaponMei() {
    const w = this.member.equip?.weapon;
    return (w && this.member.meiById) ? (this.member.meiById[w] || null) : null;
  }

  // 生存値（curHp/curMp が -1 なら満タンに補正）
  ensureVitals() {
    if (this.member.curHp < 0) this.member.curHp = this.maxHp;
    if (this.member.curMp < 0) this.member.curMp = this.maxMp;
    this.member.curHp = clamp(this.member.curHp, 0, this.maxHp);
    this.member.curMp = clamp(this.member.curMp, 0, this.maxMp);
  }
  get curHp() { return this.member.curHp; }
  set curHp(v) { this.member.curHp = clamp(Math.round(v), 0, this.maxHp); }
  get curMp() { return this.member.curMp; }
  set curMp(v) { this.member.curMp = clamp(Math.round(v), 0, this.maxMp); }

  get statusEffects() { return this.member.statusEffects; }
  set statusEffects(v) { this.member.statusEffects = v; }
  get isDead() { return this.curHp <= 0; }

  // 習得スキル
  get skills() { return this.member.learnedSkills; }
  knows(id) { return this.member.learnedSkills.includes(id); }
  learn(id) { if (!this.knows(id)) this.member.learnedSkills.push(id); }

  // 装備（変更時はステ再計算）
  equip(slot, itemId) {
    this.member.equip[slot] = itemId;
    this.invalidate();
  }
  unequip(slot) { this.member.equip[slot] = null; this.invalidate(); }
}
