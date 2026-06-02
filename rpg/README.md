# ETERNIA ～星を継ぐ者～（ブラウザRPG）

設計書 [`../design/`](../design/) を原作とする、ブラウザ動作のドラクエ風ターン制RPG。
**バニラ JS + Canvas 2D / ES Modules / ビルド不要**。

> 本実装は設計書 `10_roadmap.md` の **MVP（プロローグ＋第1章序盤）** に相当する縦切り。
> エンジン・戦闘・育成・イベント・セーブの全システムが動作し、コンテンツを足せば全章へ拡張できる構成。

---

## 遊び方（起動）

ES Modules は `file://` 直開きでは CORS で動きません。**静的サーバ経由**で開いてください。

```bash
# リポジトリ直下のサーバを使う場合（rpg は /rpg/ で配信される）
node tools/serve.js 8080
# → ブラウザで http://localhost:8080/rpg/

# あるいは rpg/ で
cd rpg && npm run serve      # http://localhost:8080/rpg/

# Python でも可
python3 -m http.server 8080  # → http://localhost:8080/rpg/
```

### 操作
| 操作 | キー | タッチ |
| --- | --- | --- |
| 移動 | 矢印 / WASD | 十字パッド |
| 決定・調べる・会話送り | Enter / Space / Z | 決定 |
| キャンセル | Esc / X | 取消 |
| メニュー | Shift / C | メニュー |

スマホでは画面下に十字キー＆ボタンが自動表示（設定で左手/右手を切替）。

---

## 実装されている機能

- **タイトル**：はじめから / つづきから（4スロット＋オート） / せってい（音量・文字速度・難易度・タッチ配置）
- **マップ探索**：グリッド移動・カメラ追従・NPC会話・宝箱・看板・町/ダンジョン・マップ間移動
- **イベント**：データ駆動インタプリタ（会話・選択肢・分岐・フラグ・章管理・演出・戦闘呼出）
- **戦闘**：ターン制（たたかう/じゅもん/どうぐ/ぼうぎょ/にげる）・属性相性・状態異常・会心・ボス
- **育成**：レベル/経験値（控えにも50%配分）・スキル習得・装備変更・9ステータス
- **ストーリー**：プロローグ（ミルカ婆との別れ）→ 第1章（仲間加入・森のボス）
- **セーブ**：LocalStorage（GameStateのみ直列化／バージョン管理／破損耐性）

### MVPの流れ
村ルミナで起床 → 南の森でやくそう採取（道中チュートリアル戦闘）→ 村へ戻ると襲撃・ミルカ婆との別れ →
宿場町ハーフェンでガロード/フィーナ加入 → 森の奥の **森獣ヴェルダンテ** 撃破で第1章ひと区切り。

---

## アーキテクチャ（[`../design/11_implementation_architecture.md`](../design/11_implementation_architecture.md) 準拠）

```
src/
├── config/   定数・キーバインド
├── core/     エンジン基盤（Game/Scene/Input/Renderer/Audio/GameState/SaveManager/Database非依存サービス）
├── data/     Database（JSONロード・ID参照）
├── domain/   純粋ゲームルール（Stats/Element/Actor/Character/Enemy/Party/各System）※Canvas非依存・テスト可能
├── event/    シナリオ実行（EventInterpreter/EventCommands/FlagManager/ChapterManager）
├── field/    マップ探索（TileMap/MapRenderer/FieldPlayer/NPC/Camera）
├── ui/       UI部品（Message/Choice/Command/Menu/Battle/HUD）
└── scenes/   画面（Boot/Title/Field/Battle/Menu/Settings）
data/         マスターデータ（characters/classes/skills/items/monsters/world/maps/*）
```

- **依存は内向き**（scenes→event→domain→core）。domain層は DOM/Canvas に一切依存せず、Nodeでユニットテスト可能。
- **マスターデータは JSON 外出し**。バランス調整は `data/*.json` の編集だけで完結（コード変更不要）。
- 設計書での `scenes/DialogueScene` は、会話を FieldScene のオーバーレイ窓で扱う方式に統合（実体を持たない）。

---

## QA（ヘッドレス検証）

```bash
cd rpg && npm run qa
# = node qa/play.mjs
# タイトル→新規→プロローグ→移動→戦闘→メニューを自動操作し、
# コンソールエラー0を確認。スクリーンショットは qa/shots/ に保存。
```

ドメインロジック（ダメージ式・レベル計算・1戦闘）は Node で純粋にテスト可能（`src/domain/` は副作用なし）。

---

## 拡張の指針

- **新マップ**：`data/maps/<id>.json`（文字レジェンド方式）を追加し、`data/world.json` の `maps` に登録。
- **新イベント**：マップの `events`/`npcs` にコマンド配列を書く。新コマンドは `src/event/EventCommands.js` に1関数追加。
- **新モンスター/装備/スキル**：対応する JSON にレコードを足すだけ。
- **新システム**：`src/domain/systems/` に純粋ロジックを足し、シーンから呼ぶ。
