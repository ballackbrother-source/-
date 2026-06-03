/**
 * core/GameState.js
 * @layer core
 * 全可変状態の単一ソース（=セーブ対象の正）。
 * 不変データ(Database)・実行時状態(Runtime)は含めない。
 * 設計書 §3-2 のスキーマに準拠。
 */
import { SAVE_VERSION } from '../config/constants.js';
import { deepClone } from './util.js';

export class GameState {
  constructor() {
    this.meta = { version: SAVE_VERSION, playtimeSec: 0, createdAt: null, updatedAt: null };
    this.chapter = { id: 'prologue', step: 0 };
    this.location = { mapId: 'lumina', x: 9, y: 8, dir: 'down' };
    this.party = { gold: 0, members: [], order: [], reserve: [] };
    this.inventory = { items: {} };          // id -> 個数
    this.flags = {};                          // key -> bool|number
    this.variables = {};                      // key -> number
    this.bestiary = { seen: [], defeated: [], items: [] }; // items: 入手したことのあるアイテムid
    this.settings = {
      bgmVol: 0.6, seVol: 0.8, difficulty: 'normal',
      textSpeed: 'normal', touchLayout: 'right',
    };
  }

  /** 新規ゲームの初期状態を Database から構築 */
  static newGame(db) {
    const s = new GameState();
    s.meta.createdAt = Date.now();
    // 設定でも初期パーティ・所持品を定義可能にする（data/characters.json の startup）
    const start = db.startup;
    s.chapter = { ...start.chapter };
    s.location = { ...start.location };
    s.party.gold = start.gold ?? 0;
    s.party.order = [...start.party];
    s.party.reserve = [...(start.reserve ?? [])];
    s.inventory.items = { ...(start.items ?? {}) };
    s.bestiary.items = Object.keys(s.inventory.items); // 初期所持も図鑑に記録
    s.flags = { ...(start.flags ?? {}) };
    // メンバーの可変分（Lv/EXP/HP/装備/スキル）を初期化
    for (const id of [...s.party.order, ...s.party.reserve]) {
      s.party.members.push(GameState.initMember(db, id));
    }
    return s;
  }

  /** Database定義からメンバーの「可変分」レコードを作る */
  static initMember(db, id) {
    const def = db.getCharacter(id);
    return {
      id,
      lv: def.startLv ?? 1,
      exp: 0,
      curHp: -1, curMp: -1, // -1=満タン扱い（生成後にStatsで補正）
      jp: 0,
      jobId: def.jobId,
      learnedSkills: [...(def.startSkills ?? [])],
      equip: { ...(def.startEquip ?? {}) },
      bonusStats: {}, // 種などの永続ステータスボーナス
      statusEffects: [],
      bond: 0,
    };
  }

  /** セーブ用プレーンオブジェクトへ */
  serialize() {
    this.meta.updatedAt = Date.now();
    return deepClone({
      meta: this.meta, chapter: this.chapter, location: this.location,
      party: this.party, inventory: this.inventory, flags: this.flags,
      variables: this.variables, bestiary: this.bestiary, settings: this.settings,
    });
  }

  /** セーブデータから復元 */
  static deserialize(obj) {
    const s = new GameState();
    Object.assign(s, deepClone(obj));
    return s;
  }
}
