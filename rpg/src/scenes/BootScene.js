/**
 * scenes/BootScene.js
 * @layer presentation(scene)
 * 起動時のローディング。Database/Assetsを非同期ロードしてTitleへ。
 */
import { Scene } from '../core/Scene.js';
import { VIEW_W, VIEW_H, COLORS } from '../config/constants.js';
import { TitleScene } from './TitleScene.js';

export class BootScene extends Scene {
  constructor(game) { super(game); this.status = 'よみこみ中…'; this.error = null; this.dots = 0; this.t = 0; }

  async onEnter() {
    try {
      await this.game.assets.bake();
      this.status = 'データ読み込み中…';
      await this.game.db.loadAll();
      this.status = 'じゅんび完了';
      // 設定の事前適用
      const cfg = (await import('../core/SaveManager.js')).SaveManager.loadConfig();
      if (cfg) this.game.audio.setVolumes(cfg);
      this.game.scenes.replace(new TitleScene(this.game), { config: cfg });
    } catch (e) {
      console.error(e);
      this.error = 'データの読み込みに失敗しました: ' + e.message;
    }
  }

  update() { this.t++; if (this.t % 30 === 0) this.dots = (this.dots + 1) % 4; }

  render(r) {
    r.clear('#05070f');
    r.text('ETERNIA', VIEW_W / 2, VIEW_H / 2 - 60, { size: 48, align: 'center', color: COLORS.windowBorder });
    r.text('～星を継ぐ者～', VIEW_W / 2, VIEW_H / 2 - 6, { size: 20, align: 'center', color: COLORS.textDim });
    if (this.error) {
      r.text(this.error, VIEW_W / 2, VIEW_H / 2 + 50, { size: 14, align: 'center', color: '#e06666' });
    } else {
      r.text(this.status + '.'.repeat(this.dots), VIEW_W / 2, VIEW_H / 2 + 50, { size: 16, align: 'center', color: COLORS.text });
    }
  }
}
