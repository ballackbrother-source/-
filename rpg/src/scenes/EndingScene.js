/**
 * scenes/EndingScene.js
 * @layer presentation(scene)
 * エンディング/スタッフロール。3分岐(true/normal/bad)に応じた締めの一言＋
 * クレジットを下から流し、決定でタイトルへ戻る。
 */
import { Scene } from '../core/Scene.js';
import { VIEW_W, VIEW_H, COLORS } from '../config/constants.js';
import { SaveManager } from '../core/SaveManager.js';

const END_INFO = {
  true:   { tag: 'TRUE END', tagColor: '#ffd23f', line: '——星は、巡る。今度は、ずっと 一緒に。', bgm: 'theme' },
  normal: { tag: 'NORMAL END', tagColor: '#aee0ff', line: '兄さん……ありがとう。世界は、続いていく。', bgm: 'theme' },
  bad:    { tag: 'BAD END', tagColor: '#e06666', line: '——次の 世界で、誰も ルゥを 覚えていない。', bgm: 'town' },
};

const CREDITS = [
  '', '', '',
  'ETERNIA', '～ 星を継ぐ者 ～', '', '',
  '── STAFF ──', '',
  'Game Design / Scenario', 'design/ 参照', '',
  'Programming', 'Vanilla JS + Canvas 2D', '',
  'Battle / Forge / Bestiary Systems', 'rpg/src/domain', '',
  'World & Events', 'rpg/data', '', '',
  '── 7つの柱 ──', '',
  '主人公の成長 ・ 家族愛 ・ 仲間との絆',
  '裏切り ・ 伏線回収 ・ 喪失と再生',
  'そして、赦し', '', '', '',
  'Thank you for playing!', '', '',
];

export class EndingScene extends Scene {
  onEnter(params = {}) {
    this.type = params.type || 'normal';
    this.info = END_INFO[this.type] || END_INFO.normal;
    SaveManager.recordClear(this.type); // クリア記録
    this.scroll = VIEW_H + 20;
    this.t = 0;
    this.done = false;
    this.game.audio.init();
    this.game.audio.playBgm(this.info.bgm);
  }

  update() {
    this.t++;
    if (!this.done) {
      this.scroll -= 0.5;
      const end = -(CREDITS.length * 30) + VIEW_H * 0.4;
      if (this.scroll <= end) this.done = true;
      if (this.game.input.isPressed('confirm')) {
        // 1回目で全表示、2回目でタイトル
        if (this.scroll > end) this.scroll = end; else this.toTitle();
      }
    } else if (this.game.input.isPressed('confirm')) {
      this.toTitle();
    }
  }

  toTitle() {
    if (this._leaving) return;
    this._leaving = true;
    import('./TitleScene.js').then(({ TitleScene }) => {
      this.game.audio.stopBgm();
      this.game.scenes.reset(new TitleScene(this.game));
    });
  }

  render(r) {
    r.clear('#05070f');
    // 星空
    for (let i = 0; i < 70; i++) {
      const x = (i * 137) % VIEW_W, y = (i * 211) % VIEW_H;
      const tw = (Math.sin((this.t + i * 20) / 40) + 1) / 2;
      r.rect(x, y, 2, 2, `rgba(255,255,255,${0.15 + tw * 0.5})`);
    }
    // エンディング名（上部固定）
    r.text(this.info.tag, VIEW_W / 2, 24, { size: 22, align: 'center', color: this.info.tagColor });
    r.text(this.info.line, VIEW_W / 2, 56, { size: 15, align: 'center', color: COLORS.textDim });

    // クレジット（下から上へ）
    CREDITS.forEach((ln, i) => {
      const y = this.scroll + i * 30;
      if (y < 80 || y > VIEW_H - 10) return;
      const big = ['ETERNIA', 'Thank you for playing!'].includes(ln);
      r.text(ln, VIEW_W / 2, y, { size: big ? 26 : 16, align: 'center', color: big ? COLORS.windowBorder : COLORS.text });
    });

    r.text('決定で タイトルへ', VIEW_W / 2, VIEW_H - 24, { size: 12, align: 'center', color: '#44506e' });
  }
}
