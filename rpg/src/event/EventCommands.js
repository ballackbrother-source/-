/**
 * event/EventCommands.js
 * @layer application
 * イベントコマンドの実装集（§4-4）。1コマンド=1ハンドラの辞書。
 * ハンドラは async (cmd, interp, ctx) => void|{jump}. ctx はFieldSceneがDI。
 *
 * 新コマンド追加は、この辞書に1関数足すだけ（開放閉鎖）。
 */
export const COMMANDS = {
  // 会話（送り待ち）
  async message(cmd, interp, ctx) {
    const lines = Array.isArray(cmd.text) ? cmd.text : [cmd.text];
    for (const line of lines) await ctx.message(line, { name: cmd.name, face: cmd.face });
  },

  // 選択肢 → 分岐
  async choice(cmd, interp, ctx) {
    const idx = await ctx.choice(cmd.options.map((o) => o.text), cmd.prompt);
    const branch = cmd.options[idx];
    if (branch?.set) ctx.flags.set(branch.set, branch.value ?? true);
    if (branch?.commands) await interp._runList(branch.commands);
  },

  // 条件分岐
  async if(cmd, interp, ctx) {
    if (ctx.flags.test(cmd.cond)) await interp._runList(cmd.then || []);
    else await interp._runList(cmd.else || []);
  },

  // フラグ・変数
  async setFlag(cmd, _i, ctx) { ctx.flags.set(cmd.key, cmd.value ?? true); },
  async setVar(cmd, _i, ctx)  { ctx.flags.setVar(cmd.key, cmd.value); },
  async addVar(cmd, _i, ctx)  { ctx.flags.addVar(cmd.key, cmd.delta); },

  // 所持品・金・仲間
  async giveItem(cmd, _i, ctx) {
    ctx.inventory.add(cmd.id, cmd.count || 1);
    if (cmd.notify !== false) {
      const it = ctx.db.getItem(cmd.id);
      await ctx.message(`${it ? it.name : cmd.id} を ${cmd.count || 1}こ 手に入れた！`);
    }
  },
  async takeItem(cmd, _i, ctx) { ctx.inventory.remove(cmd.id, cmd.count || 1); },
  async giveGold(cmd, _i, ctx) {
    ctx.party.gainGold(cmd.amount);
    if (cmd.notify !== false) await ctx.message(`${cmd.amount} ギルを 手に入れた！`);
  },
  async addMember(cmd, _i, ctx) {
    ctx.party.addMember(cmd.id);
    if (cmd.notify !== false) {
      const c = ctx.db.getCharacter(cmd.id);
      await ctx.message(`${c.name} が なかまに 加わった！`);
    }
  },
  async removeMember(cmd, _i, ctx) {
    ctx.party.removeMember(cmd.id);
    if (cmd.notify) {
      const c = ctx.db.getCharacter(cmd.id);
      await ctx.message(`${c.name} が パーティから 離れた。`);
    }
  },

  // 音
  async playBgm(cmd, _i, ctx) { ctx.audio.playBgm(cmd.id); },
  async stopBgm(_c, _i, ctx)  { ctx.audio.stopBgm(); },
  async playSe(cmd, _i, ctx)  { ctx.audio.se(cmd.id); },

  // 演出・待機
  async wait(cmd, _i, ctx)  { await ctx.wait(cmd.ms ?? 500); },
  async fade(cmd, _i, ctx)  { await ctx.fade(cmd.dir || 'out', cmd.color || '#000', cmd.ms || 400); },
  async shake(cmd, _i, ctx) { ctx.shake?.(cmd.power || 6, cmd.ms || 400); await ctx.wait(cmd.ms || 400); },
  async waitInput(_c, _i, ctx) { await ctx.message(''); },

  // マップ移動（fadeOut:false で「すでに暗転済み」の場面に対応）
  async transfer(cmd, _i, ctx) {
    if (cmd.fadeOut !== false) await ctx.fade('out', '#000', 300);
    ctx.transfer(cmd.mapId, cmd.x, cmd.y, cmd.dir || 'down');
    await ctx.fade('in', '#000', 300);
  },

  // キャラの自動移動（イベント演出）
  async moveActor(cmd, _i, ctx) { await ctx.moveActor(cmd.who, cmd.path); },

  // 戦闘
  async battle(cmd, interp, ctx) {
    const result = await ctx.battle(cmd.troopId, {
      canEscape: cmd.canEscape !== false, isBoss: cmd.isBoss,
    });
    if (result.outcome === 'win' && cmd.onWin) await interp._runList(cmd.onWin);
    if (result.outcome === 'escape' && cmd.onEscape) await interp._runList(cmd.onEscape);
    if (result.outcome === 'lose') {
      if (cmd.onLose) await interp._runList(cmd.onLose);
      else ctx.gameOver();
    }
  },

  // 簡易ショップ：1品購入（所持金チェック付き）
  async buyItem(cmd, _i, ctx) {
    const it = ctx.db.getItem(cmd.id);
    if (!it) return;
    if (ctx.party.gold < it.price) { await ctx.message('お金が たりないようだ。'); return; }
    ctx.party.gainGold(-it.price);
    ctx.inventory.add(cmd.id, 1);
    ctx.audio.se('confirm');
    await ctx.message(`${it.name}を 買った！ (のこり ${ctx.party.gold} ギル)`);
  },

  // 全回復（宿/教会）
  async heal(_c, _i, ctx) { ctx.party.fullHeal(); },

  // 章管理
  async setChapter(cmd, _i, ctx) { ctx.chapter.set(cmd.id, cmd.step || 0); },
  async advanceChapter(_c, _i, ctx) { ctx.chapter.advance(); },

  // システム
  async autosave(_c, _i, ctx) { ctx.autosave?.(); },
  async gameOver(_c, _i, ctx) { ctx.gameOver(); return { jump: 'break' }; },
  async returnTitle(_c, _i, ctx) { ctx.returnTitle(); return { jump: 'break' }; },
};
