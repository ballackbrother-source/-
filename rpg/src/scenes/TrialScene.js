/**
 * scenes/TrialScene.js
 * @layer presentation(scene)
 * 「最終決戦 体験版」。本編未実装でも、ゲーム最大の山場——
 * 創世神アルディア戦（不死＋赦しゲージ＋連携技ラスト・レクイエム＋3分岐ED）——を
 * 単体で体験・検証できるプロトタイプ。設計書 02/05/07/12 のシグネチャ機構の実機実証。
 */
import { Scene } from '../core/Scene.js';
import { VIEW_W, VIEW_H, COLORS } from '../config/constants.js';
import { MessageWindow } from '../ui/MessageWindow.js';
import { ChoiceWindow } from '../ui/ChoiceWindow.js';
import { GameState } from '../core/GameState.js';
import { LevelSystem, totalExpFor } from '../domain/systems/LevelSystem.js';
import { BattleScene } from './BattleScene.js';

const TRIAL_LV = 38;

export class TrialScene extends Scene {
  onEnter() {
    // 体験用の一時GameStateを構築（本編セーブには影響しない）
    const state = GameState.newGame(this.game.db);
    this.game.bindState(state);
    this.msgWin = new MessageWindow(state.settings);
    this.choiceWin = new ChoiceWindow();
    this.t = 0;
    this.game.audio.init();
    this.game.audio.playBgm('theme');
    this.run();
  }
  onResume() {
    if (this._battleResolve) { const r = this._battleResolve; this._battleResolve = null; r(this._battleResult); }
  }

  update() {
    this.t++;
    this.msgWin.update(this.game.input, this.game.audio);
    this.choiceWin.update(this.game.input, this.game.audio);
  }

  message(text, opts) { return this.msgWin.show(text, opts); }
  choice(opts, prompt) { return this.choiceWin.show(opts, prompt); }

  battle(troopId, opts) {
    return new Promise((res) => {
      this._battleResolve = res; this._battleResult = { outcome: 'lose' };
      this.game.scenes.push(new BattleScene(this.game), {
        troopId, opts, onComplete: (r) => { this._battleResult = r; },
      });
    });
  }

  async run() {
    const g = this.game;
    // パーティ編成：ルゥ＋仲間＋シオン（共闘）
    g.party.addMember('garrod'); g.party.addMember('fina'); g.party.addMember('shion');
    for (const c of g.party.all()) {
      LevelSystem.gainExp(c, Math.max(0, totalExpFor(TRIAL_LV) - c.exp), g.db);
      c.invalidate(); c.curHp = c.maxHp; c.curMp = c.maxMp;
    }
    // 体験用の保険アイテム
    g.inventory.add('hi_herb', 5); g.inventory.add('revive_feather', 3);

    await this.message(['——これは、物語の 最果て。','創世神アルディアとの 最終決戦の 体験版です。'], { name: '体験版' });
    await this.message(['アルディアは 神。通常攻撃では 倒せず、毎ターン 不死で 全回復します。','その不死を 砕けるのは、シオンとの 連携技「ラスト・レクイエム」だけ。','連携が 使えるかは——あなたが シオンを どれだけ 赦せたか（赦しゲージ）で 決まります。'], { name: '体験版' });

    const idx = await this.choice(
      ['赦しゲージ：高（True狙い）', '赦しゲージ：中（Normal狙い）', '赦しゲージ：低（Bad）'],
      'ルゥは シオンを、どれだけ 赦している？');
    const forgiveness = [95, 60, 20][idx];
    g.state.variables.forgiveness = forgiveness;

    if (forgiveness >= 60) {
      g.party.char('lou').learn('last_requiem'); // 連携技を解放
      await this.message('ルゥの 中で、兄への 想いが 力に なる——連携技「ラスト・レクイエム」が 使えるようになった！');
    } else {
      await this.message('ルゥは まだ、兄を 赦せない。連携技は 使えない……（神の 不死は 砕けない）');
    }

    await this.message(['世界が 白く 溶けていく。仲間が 一人ずつ 消えていく——','その時、シオンが 戻ってきた。'], { name: '——' });
    await this.message(['私は、許されない。','それでも——戦わせてくれ。'], { name: 'シオン' });

    const result = await this.battle('aldia', { isBoss: true, canEscape: false });
    await this.showEnding(result, forgiveness);
  }

  async showEnding(result, forgiveness) {
    this.game.audio.stopBgm();
    if (result.outcome !== 'win') {
      this.game.audio.playBgm('boss');
      await this.message(['シオンを 拒んだ ルゥは、神の 不死を 砕けなかった。','世界は 白く 塗りつぶされ、何もかもが リセットされた。'], { name: 'BAD END' });
      await this.message(['——次の 世界で、ルゥは 生まれない。','誰も、彼のことを 覚えていない。'], { name: 'BAD END' });
    } else if (forgiveness >= 90) {
      this.game.audio.playBgm('theme');
      await this.message(['「ラスト・レクイエム」が、神を 討った。','奪われた すべてが、還ってくる——','故郷も、仲間も、そして 兄も。'], { name: 'TRUE END' });
      await this.message(['ルゥ：「兄さん。今度は、ずっと 一緒だ。」','シオン：「ああ。……ただいま、弟よ。」','星は、巡る。'], { name: 'TRUE END' });
    } else {
      this.game.audio.playBgm('town');
      await this.message(['神は 倒れ、世界は 救われた。','だが——連携の 代償に、シオンは 静かに 微笑んで 消えていった。'], { name: 'NORMAL END' });
      await this.message(['ルゥ：「……兄さん。ありがとう。さよなら。」','喪った 兄の ぶんも、ルゥは 生きていく。'], { name: 'NORMAL END' });
    }
    await this.message('（体験版 おわり。タイトルへ もどります）');
    const { TitleScene } = await import('./TitleScene.js');
    this.game.state = null; // 体験用stateを破棄
    this.game.audio.stopBgm();
    this.game.scenes.reset(new TitleScene(this.game));
  }

  render(r) {
    r.clear('#070b1a');
    for (let i = 0; i < 50; i++) {
      const x = (i * 151) % VIEW_W, y = (i * 233) % VIEW_H;
      const tw = (Math.sin((this.t + i * 17) / 30) + 1) / 2;
      r.rect(x, y, 2, 2, `rgba(255,255,255,${0.15 + tw * 0.5})`);
    }
    if (!this.msgWin.active && !this.choiceWin.active) {
      r.text('最終決戦 体験版', VIEW_W / 2, VIEW_H / 2 - 16, { size: 26, align: 'center', color: COLORS.windowBorder });
      r.text('創世神アルディア', VIEW_W / 2, VIEW_H / 2 + 20, { size: 16, align: 'center', color: COLORS.textDim });
    }
    this.msgWin.render(r);
    this.choiceWin.render(r);
  }
}
