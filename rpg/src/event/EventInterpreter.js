/**
 * event/EventInterpreter.js
 * @layer application
 * イベント（コマンド配列）を async/await で逐次実行する。
 * 会話送り・選択・戦闘などの「入力待ち」はctxのPromiseで自然に停止する。
 */
import { COMMANDS } from './EventCommands.js';

export class EventInterpreter {
  constructor(ctx) {
    this.ctx = ctx;       // FieldSceneが提供する実行コンテキスト
    this.running = false;
  }

  /** イベント実体（pages解決済みのcommands配列）を実行 */
  async run(commands) {
    if (this.running) return;
    this.running = true;
    try { await this._runList(commands); }
    catch (e) { console.error('[Event] 実行エラー', e); }
    finally { this.running = false; }
  }

  async _runList(list) {
    for (const cmd of list) {
      const handler = COMMANDS[cmd.type];
      if (!handler) { console.warn('[Event] 未知コマンド:', cmd.type); continue; }
      const res = await handler(cmd, this, this.ctx);
      if (res && res.jump === 'break') break;
    }
  }

  /**
   * イベント定義（pages）から、条件を満たす最後のページを選ぶ（§4-3）。
   * @returns {{trigger, commands}|null}
   */
  static resolvePage(eventDef, flags) {
    let chosen = null;
    for (const page of eventDef.pages || []) {
      if (flags.test(page.conditions)) chosen = page;
    }
    return chosen;
  }
}
