/**
 * data/Database.js
 * @layer data
 * 全マスターデータ(JSON)をロードし、ID参照を提供する読み取り専用リポジトリ。
 * ゲーム中はここを「不変データの正」として参照する（セーブ対象外）。
 */
const BASE = './data/';

async function loadJson(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`データ読込失敗: ${path} (${res.status})`);
  return res.json();
}

export class Database {
  constructor() {
    this.characters = {}; this.classes = {}; this.skills = {};
    this.items = {}; this.monsters = {}; this.troops = {};
    this.elements = {}; this.encounters = {}; this.startup = {};
    this.maps = {}; this.events = {}; this.chapters = {};
  }

  async loadAll() {
    const [chars, classes, skills, items, monsters, elements, world] = await Promise.all([
      loadJson('characters.json'),
      loadJson('classes.json'),
      loadJson('skills.json'),
      loadJson('items.json'),
      loadJson('monsters.json'),
      loadJson('elements.json'),
      loadJson('world.json'),
    ]);
    this.characters = chars.characters;
    this.startup = chars.startup;
    this.classes = classes;
    this.skills = skills;
    this.items = items;
    this.monsters = monsters.monsters;
    this.troops = monsters.troops;
    this.elements = elements;
    this.chapters = world.chapters;
    this.encounters = world.encounters;
    this._mapNames = world.mapNames;

    // マップ・イベントは world.json の一覧に従い読み込む
    const mapEntries = await Promise.all(
      world.maps.map(async (id) => [id, await loadJson(`maps/${id}.json`)]));
    for (const [id, data] of mapEntries) this.maps[id] = data;

    const evEntries = await Promise.all(
      world.eventFiles.map(async (id) => [id, await loadJson(`events/${id}.json`)]));
    for (const [id, data] of evEntries) this.events[id] = data;

    return this;
  }

  // --- アクセサ ---
  getCharacter(id) { return this.characters[id]; }
  getClass(id)     { return this.classes[id]; }
  getSkill(id)     { return this.skills[id]; }
  getItem(id)      { return this.items[id]; }
  getMonster(id)   { return this.monsters[id]; }
  getTroop(id)     { return this.troops[id]; }
  getMap(id)       { return this.maps[id]; }
  getEvent(id)     { return this.events[id]; }
  getEncounter(id) { return this.encounters[id]; }

  elementMult(attackElem, affinity) {
    // affinity: defenderのelement設定。elements.jsonの倍率定義を返す
    return this.elements;
  }
  chapterName(id) { return this.chapters[id]?.name ?? id; }
  mapName(id)     { return this._mapNames?.[id] ?? id; }
}
