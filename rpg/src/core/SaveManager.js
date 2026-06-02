/**
 * core/SaveManager.js
 * @layer core
 * LocalStorage への直列化/復元。スロット管理・バージョンマイグレーション・
 * 破損耐性を担う。保存対象は GameState のみ（§5）。
 */
import { SAVE_PREFIX, SAVE_VERSION, SAVE_SLOTS } from '../config/constants.js';
import { GameState } from './GameState.js';
import { formatPlaytime } from './util.js';

const key = (slot) => `${SAVE_PREFIX}.save.slot${slot}`;
const CONFIG_KEY = `${SAVE_PREFIX}.config`;

// 旧バージョン→新バージョンの変換関数を積む（今は無し）
const MIGRATIONS = {
  // 1: (data) => { ...; data.version = 2; return data; }
};

export const SaveManager = {
  /** ヘッダ（一覧表示用の軽量情報）を作る */
  buildHeader(state, db) {
    const leader = state.party.members.find((m) => m.id === state.party.order[0]);
    const leaderName = leader ? db.getCharacter(leader.id).name : '—';
    const chapterName = db.chapterName(state.chapter.id);
    return {
      empty: false,
      chapter: chapterName,
      leader: leaderName,
      level: leader?.lv ?? 1,
      playtime: formatPlaytime(state.meta.playtimeSec),
      location: db.mapName(state.location.mapId),
      savedAt: new Date().toISOString(),
    };
  },

  save(slot, state, db) {
    const payload = {
      version: SAVE_VERSION,
      header: this.buildHeader(state, db),
      state: state.serialize(),
    };
    try {
      localStorage.setItem(key(slot), JSON.stringify(payload));
      return true;
    } catch (e) {
      console.warn('[Save] 書き込み失敗', e);
      return false;
    }
  },

  load(slot) {
    const raw = localStorage.getItem(key(slot));
    if (!raw) return null;
    let data;
    try { data = JSON.parse(raw); }
    catch { throw new Error('セーブデータが破損しています'); }
    // マイグレーション
    let v = data.version ?? 1;
    while (v < SAVE_VERSION && MIGRATIONS[v]) { data = MIGRATIONS[v](data); v = data.version; }
    if (!data.state) throw new Error('セーブデータ形式が不正です');
    return GameState.deserialize(data.state);
  },

  /** 一覧（タイトルの「つづきから」用）。破損スロットは error フラグ付きで返す */
  list() {
    const out = [];
    for (let i = 0; i < SAVE_SLOTS; i++) {
      const raw = localStorage.getItem(key(i));
      if (!raw) { out.push({ slot: i, empty: true }); continue; }
      try {
        const data = JSON.parse(raw);
        out.push({ slot: i, empty: false, ...(data.header ?? {}) });
      } catch {
        out.push({ slot: i, empty: false, error: true, chapter: '（破損）' });
      }
    }
    return out;
  },

  exists(slot) { return localStorage.getItem(key(slot)) != null; },
  delete(slot) { localStorage.removeItem(key(slot)); },

  // 設定はセーブと独立して常時保存（起動時即適用）
  loadConfig() {
    try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || null; }
    catch { return null; }
  },
  saveConfig(settings) {
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(settings)); } catch {}
  },
};
