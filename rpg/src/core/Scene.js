/**
 * core/Scene.js
 * @layer core
 * 全シーンの基底。SceneManagerのスタックに積まれる。
 * opaque=falseのシーン(オーバーレイ)は、下のシーンも描画され続ける。
 */
export class Scene {
  constructor(ctx) {
    /** @type {import('./Game.js').Game} ゲーム横断サービスへの参照 */
    this.game = ctx;
    this.opaque = true; // trueなら下のシーンを描かない
  }
  onEnter(_params) {}   // スタックにpushされた時
  onExit() {}           // popされる時
  onResume() {}         // 上のシーンがpopして再び最前面に戻った時
  onPause() {}          // 上にシーンがpushされた時
  update(_dt) {}        // 最前面シーンのみ呼ばれる
  render(_r) {}         // opaque制御に従って呼ばれる
}
