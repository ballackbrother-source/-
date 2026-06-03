/**
 * domain/entities/Enemy.js
 * @layer domain
 * 戦闘モンスター。Database定義から戦闘インスタンスを生成。
 * Characterと同じ戦闘共通I/F（atk/def/curHp...）を満たす。
 */
export class Enemy {
  constructor(monsterId, db, indexLabel = '') {
    this.db = db;
    this.id = monsterId;
    this.def = db.getMonster(monsterId);
    this.isPlayer = false;
    this.indexLabel = indexLabel; // 同種が複数いる時の "A/B/C"
    const s = this.def.stats;
    this.maxHp = s.hp; this.curHp = s.hp;
    this.maxMp = s.mp ?? 99; this.curMp = this.maxMp;
    this.statusEffects = [];
    // フェーズ変化（HP閾値）用の実行時オーバーライド
    this._appliedPhases = new Set();
    this._elementOverride = null;
    this._aiOverride = null;
    this._atkMul = 1;
  }

  get name() { return this.def.name + (this.indexLabel ? this.indexLabel : ''); }
  get family() { return this.def.family; }
  get atk() { return Math.round(this.def.stats.atk * (this._atkMul || 1)); }
  get def_() { return this.def.stats.def; }
  get mat() { return Math.round((this.def.stats.mat ?? 0) * (this._atkMul || 1)); }
  get mdf() { return this.def.stats.mdf ?? 0; }
  get agi() { return this.def.stats.agi; }
  get luk() { return this.def.stats.luk ?? 5; }
  get eva() { return Math.min(40, this.agi * 0.3); }
  get crit() { return 2 + this.luk * 0.1; }
  get affinity() { return this._elementOverride || this.def.element || {}; }
  get ai() { return this._aiOverride || this.def.ai || [{ type: 'attack', weight: 1 }]; }
  get weaponElement() { return this.def.attackElement || 'none'; }
  get isDead() { return this.curHp <= 0; }
  get skills() { return this.def.skills || []; }

  get exp() { return this.def.exp; }
  get gold() { return this.def.gold; }
  get isBoss() { return !!this.def.boss; }

  /** ドロップ抽選（rng: RNG, luckBonus: 0..1） */
  rollDrops(rng, luckBonus = 0) {
    const out = [];
    for (const d of this.def.drops || []) {
      if (rng.chance(Math.min(1, d.rate + luckBonus))) out.push(d.item);
    }
    return out;
  }
}
