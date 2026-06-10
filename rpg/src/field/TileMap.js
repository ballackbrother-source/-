/**
 * field/TileMap.js
 * @layer presentation(field)
 * マップのタイルデータと通行判定・出入口を扱う。
 * マップJSON: { name,width,height,bgm, ground[][], objects[][], portals[], encounter }
 *   ground/objects はタイル名(AssetLoaderのキー)の2次元配列。objectsのnull=なし。
 */
export class TileMap {
  // 通行不可タイル
  static SOLID = new Set(['wall', 'water', 'tree', 'roof', 'roof2', 'mountain', 'sign', 'chest', 'chestOpen']);

  constructor(data) {
    this.data = data;
    this.name = data.name;
    this.portals = data.portals || [];

    if (data.legend) {
      // 文字レジェンド方式（authoringが容易）：行文字列→タイル名2次元配列へ展開
      this.ground = data.ground.map((row) => [...row].map((ch) => data.legend[ch] || 'grass'));
      const oleg = data.objectLegend || {};
      this.objects = (data.objects || []).map((row) =>
        [...row].map((ch) => (ch === ' ' || ch === '.' ? null : (oleg[ch] || null))));
      this.height = this.ground.length;
      this.width = this.ground[0]?.length || 0;
    } else {
      // 生の2次元配列方式
      this.ground = data.ground;
      this.objects = data.objects || [];
      this.width = data.width ?? this.ground[0].length;
      this.height = data.height ?? this.ground.length;
    }
  }

  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }
  groundAt(x, y) { return this.inBounds(x, y) ? this.ground[y][x] : 'wall'; }
  objectAt(x, y) { return this.inBounds(x, y) ? (this.objects[y]?.[x] ?? null) : null; }
  setObject(x, y, name) { if (this.inBounds(x, y)) { (this.objects[y] = this.objects[y] || [])[x] = name; } }

  /** プレイヤー/NPCが通れるか（オブジェクトと地形の両方を見る） */
  isPassable(x, y, occupants = []) {
    if (!this.inBounds(x, y)) return false;
    if (TileMap.SOLID.has(this.groundAt(x, y))) return false;
    const obj = this.objectAt(x, y);
    if (obj && TileMap.SOLID.has(obj)) return false;
    if (occupants.some((o) => o.gx === x && o.gy === y)) return false; // NPC等で塞がれている
    return true;
  }

  portalAt(x, y) { return this.portals.find((p) => p.x === x && p.y === y) || null; }
}
