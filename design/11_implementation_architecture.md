# 11. 実装アーキテクチャ設計書（承認用）

> 対象：『エテルニア ～星を継ぐ者～』ブラウザ版（ドラクエ風RPG）
> 本書は **実装着手前の承認用ドキュメント**。承認後にこの設計どおりコードを生成する。
> 設計書 `01`〜`10` を **ゲームデザインの正本**、本書を **技術実装の正本** とする。

---

## 0. 技術方針（前提の確定）

| 項目 | 決定 | 理由 |
| --- | --- | --- |
| 配置 | 既存STGを壊さず **`rpg/` ディレクトリに新規構築（共存）** | リポジトリの既存資産を保全。RPGは自己完結 |
| 言語/描画 | **HTML / CSS / JavaScript(ES2020) / Canvas 2D API** | 要件どおり。フレームワーク非依存 |
| モジュール | **ES Modules（`import`/`export`）** | 「クリーンアーキテクチャ・モジュール分割・保守性」要件を最優先 |
| 実行方法 | 静的サーバ経由（既存 `tools/serve.js` 流用 or `python3 -m http.server`） | ES Modulesは`file://`でCORS制約。サーバ前提に統一 |
| ビルド | **ビルドステップなし**（素のESM） | トランスパイラ/バンドラ不要で保守容易 |
| データ | **マスターデータはJSONで外出し**（`rpg/data/`） | 設計書の数値をコードから分離＝バランス調整が安全 |
| レスポンシブ | 内部解像度固定の**仮想画面＋レターボックス自動スケール**＋タッチUI | PC/スマホ両対応。既存STGと同方式 |
| 状態管理 | **単一ストア（GameState）＋シーンスタック＋EventBus** | 単方向データフローで追跡可能性を確保 |
| テスト | domain層を純粋関数化し**ヘッドレスでユニットテスト可能**に | ダメージ式・レベル計算等を回帰テスト |

### レイヤリング（クリーンアーキテクチャの適用）
```
[ presentation ]  scenes / ui / field-view        ← Canvasに依存してよい
        ↑ 参照のみ（下位は上位を知らない）
[ application  ]  event(scripting) / SaveManager   ← ユースケース・進行制御
        ↑
[ domain      ]  entities / systems / value        ← 純粋なゲームルール（Canvas非依存・テスト可能）
        ↑
[ core/infra  ]  Game loop / Input / Renderer / Audio / Database / Store
```
**依存の向きは常に内向き（presentation→application→domain）**。domainはbrowser APIに一切依存しない。

---

## 1. ディレクトリ構成

```
rpg/
├── index.html                  # エントリHTML（canvas + module読み込み）
├── README.md                   # 起動方法・開発メモ
├── css/
│   └── style.css               # レターボックス・タッチUI・フォント
├── assets/                     # 画像・音（初期は手続き生成/プレースホルダ）
│   ├── sprites/                # キャラ/敵/タイル
│   └── audio/                  # BGM/SE（無くても動く設計）
├── data/                       # ★マスターデータ（設計書の数値の実体）
│   ├── characters.json         # 仲間6人の初期値・成長タイプ(§03,§04)
│   ├── classes.json            # ジョブ・スキル習得テーブル(§04)
│   ├── skills.json             # スキル/魔法 威力・MP・属性(§04,§05)
│   ├── items.json              # 武器/防具/消耗/素材(§08)
│   ├── monsters.json           # 通常50+ボス10+裏ボス(§07)
│   ├── elements.json           # 属性相性表(§05-2)
│   ├── encounters.json         # マップ別エンカウント表(§06)
│   ├── maps/                   # マップ定義（タイル・NPC・出入口）
│   │   ├── lumina.json
│   │   └── ...
│   └── events/                 # シナリオ（イベントコマンド列）
│       ├── prologue.json
│       └── ...
└── src/
    ├── main.js                 # ブートストラップ（Game生成→起動）
    ├── config/
    │   ├── constants.js        # 画面サイズ・タイルサイズ・色・enum
    │   └── keybindings.js      # キー/タッチのマッピング
    ├── core/                   # エンジン基盤（ゲーム非依存に近い）
    │   ├── Game.js             # 固定タイムステップのメインループ
    │   ├── SceneManager.js     # シーンスタック（push/pop/replace）
    │   ├── Scene.js            # シーン基底（update/render/onEnter/onExit）
    │   ├── Input.js            # キー/マウス/タッチを毎フレームedge-latch
    │   ├── Renderer.js         # Canvasラッパ（仮想解像度・スケール・描画API）
    │   ├── AssetLoader.js      # 画像/音の非同期ロード＋プレースホルダ生成
    │   ├── Audio.js            # WebAudio（BGM/SE。無音フォールバック）
    │   ├── EventBus.js         # pub/sub（疎結合な通知）
    │   ├── GameState.js        # ★単一状態ストア（セーブ対象の正）
    │   ├── SaveManager.js      # LocalStorage 直列化/復元/スロット
    │   ├── RNG.js              # シード可能乱数（戦闘の再現性）
    │   └── util.js             # clamp/lerp/grid計算 等
    ├── data/
    │   └── Database.js         # 全JSONをロードしID参照を提供（読み取り専用）
    ├── domain/                 # ★純粋ゲームルール（Canvas/DOM非依存）
    │   ├── value/
    │   │   ├── Stats.js        # 9ステ＋二次パラ算出(§04-2)
    │   │   └── Element.js      # 属性enum・相性参照
    │   ├── entities/
    │   │   ├── Actor.js        # 戦闘主体の基底（HP/MP/ステ/状態異常）
    │   │   ├── Character.js    # 仲間（経験値/Lv/ジョブ/装備/スキル）
    │   │   ├── Enemy.js        # 敵（行動テーブル/ドロップ）
    │   │   ├── Party.js        # 隊列・所持金・控え経験値配分
    │   │   ├── Item.js / Equipment.js
    │   │   └── Skill.js
    │   └── systems/
    │       ├── LevelSystem.js      # 必要EXP曲線・レベルアップ・成長(§04-1)
    │       ├── DamageFormula.js    # 物理/魔法/回復/命中の式(§05-1)
    │       ├── BattleSystem.js     # ターン制FSM（行動順→実行→勝敗判定）
    │       ├── StatusEffectSystem.js # 状態異常の付与/解除/毎ターン処理(§05-3)
    │       ├── EnemyAI.js          # 行動テーブル選択(§07-4)
    │       └── InventorySystem.js  # 入手/消費/装備変更/売買(§04-5,§08)
    ├── event/                  # application：シナリオ実行・進行制御
    │   ├── EventInterpreter.js # コマンド列を1つずつ実行（async/awaitで待機）
    │   ├── EventCommands.js    # 各コマンドの実装（message/choice/battle…）
    │   ├── FlagManager.js      # フラグ/変数の取得・設定・条件判定(§02)
    │   └── ChapterManager.js   # 章の進行・解放（§02章構成）
    ├── field/                  # presentation：マップ探索
    │   ├── TileMap.js          # タイル配列・通行判定・出入口
    │   ├── MapRenderer.js      # タイル＋キャラのCanvas描画＋カメラ
    │   ├── FieldPlayer.js      # プレイヤーのグリッド移動・歩行アニメ
    │   ├── NPC.js              # NPC（移動ルート・話しかけ判定・ページ）
    │   └── Camera.js           # 追従カメラ
    ├── ui/                     # presentation：UI部品
    │   ├── Window.js           # ウィンドウ枠の共通描画
    │   ├── MessageWindow.js    # 会話（送り/ページ/名前/顔）
    │   ├── ChoiceWindow.js     # 選択肢
    │   ├── CommandWindow.js    # 汎用コマンド選択
    │   ├── MenuUI.js           # メニュー（装備/道具/スキル/設定）
    │   ├── BattleUI.js         # 戦闘コマンド/HP-MPバー/ログ
    │   └── HUD.js              # 探索中の所持金/小情報
    └── scenes/                 # presentation：画面（シーン）
        ├── BootScene.js        # ロード→タイトルへ
        ├── TitleScene.js       # はじめから/つづきから/設定
        ├── FieldScene.js       # マップ探索（移動・会話・宝箱・エンカ）
        ├── BattleScene.js      # 戦闘
        ├── MenuScene.js        # メニュー（オーバーレイ）
        ├── DialogueScene.js    # 会話/イベント（オーバーレイ）
        └── SettingsScene.js    # 設定（音量/難易度/操作）
```

### モジュール分割の原則
- **1ファイル1クラス（または1責務）**。ファイル冒頭にJSDocで責務とレイヤを明記。
- domain層は `import` で **core/Renderer・DOMを一切参照しない**（テスト容易性の担保）。
- マスターデータ（JSON）はコードに混ぜない。バランス変更はJSON編集のみで完結。

---

## 2. クラス設計

### 2-1. 主要クラスの責務一覧
| クラス | レイヤ | 責務 | 主なI/F |
| --- | --- | --- | --- |
| `Game` | core | ループ駆動・各マネージャ保持 | `start()` `update(dt)` `render()` |
| `SceneManager` | core | シーンスタック管理 | `push/pop/replace/peek` |
| `Scene` | core | 画面の基底 | `onEnter/onExit/update/render/handleInput` |
| `Input` | core | 入力のedge-latch | `isDown/isPressed/isReleased` |
| `Renderer` | core | 仮想解像度描画 | `clear/drawSprite/drawText/drawRect/fitToScreen` |
| `EventBus` | core | 疎結合通知 | `on/off/emit` |
| `GameState` | core | **全可変状態の単一ソース** | `party/inventory/flags/chapter/location/settings` |
| `SaveManager` | core | 直列化・LocalStorage I/O | `save(slot)/load(slot)/list()/delete()` |
| `Database` | data | JSON参照（不変） | `getMonster(id)/getItem(id)/getSkill(id)/getMap(id)` |
| `Stats` | domain.value | ステ計算・二次パラ | `maxHp()/atk()/def()/...` |
| `Actor` | domain.entities | 戦闘主体の基底 | `takeDamage/heal/isDead/addStatus` |
| `Character` | domain.entities | 仲間・育成 | `gainExp/levelUp/equip/learnSkill` |
| `Enemy` | domain.entities | 敵・AI入力 | `decideAction(ai)` |
| `Party` | domain.entities | 隊列・金・EXP配分 | `addMember/frontline/gainGold` |
| `LevelSystem` | domain.systems | EXP曲線・成長 | `needExp(lv)/applyLevelUp(chr)` |
| `DamageFormula` | domain.systems | 各種ダメージ式 | `physical/magic/heal/hit` |
| `BattleSystem` | domain.systems | 戦闘FSM | `setup/nextTurn/execute/checkEnd` |
| `StatusEffectSystem` | domain.systems | 状態異常処理 | `apply/tick/cure` |
| `InventorySystem` | domain.systems | 所持/装備/売買 | `add/remove/equip/buy/sell` |
| `EventInterpreter` | event | コマンド列逐次実行 | `run(eventData)`(async) |
| `FlagManager` | event | フラグ/変数/条件 | `get/set/test(condition)` |
| `ChapterManager` | event | 章進行 | `current/advance/isUnlocked` |
| `TileMap` | field | タイル・通行判定 | `isPassable(x,y)/portalAt(x,y)` |
| `FieldPlayer`/`NPC` | field | グリッド移動・会話起動 | `move/update/interact` |
| `MessageWindow`/`ChoiceWindow` | ui | 会話・選択描画 | `show(text)/await select` |

### 2-2. クラス関係図（テキストUML）
```
Game
 ├─ Input            (各Sceneへ供給)
 ├─ Renderer
 ├─ Audio
 ├─ EventBus
 ├─ GameState ───────── SaveManager（直列化対象）
 ├─ Database（起動時ロード, 不変）
 └─ SceneManager
      └─ (stack) Scene
            ├─ TitleScene
            ├─ FieldScene ── TileMap / MapRenderer / FieldPlayer / NPC / Camera
            │     └─ (起動) EventInterpreter ── EventCommands
            │                                    ├─ FlagManager ── GameState.flags
            │                                    ├─ MessageWindow / ChoiceWindow
            │                                    └─ (要求) BattleScene へ遷移
            ├─ BattleScene ── BattleSystem
            │     ├─ DamageFormula / StatusEffectSystem / EnemyAI
            │     ├─ Party(Character[]) / Enemy[]
            │     └─ BattleUI
            ├─ MenuScene ── MenuUI ── InventorySystem / Character
            └─ SettingsScene

domain.systems は GameState/Database を「引数で受け取って」処理する純粋ロジック。
（systemsがグローバルに状態を握らない＝テスト可能・副作用局所化）
```

### 2-3. 設計上のルール
- **systemsは状態を所有しない**：`BattleSystem.execute(state, action)` のように、対象データを引数で受け取り結果を返す（または明示的にmutate）。グローバル参照禁止。
- **SceneはUI/入力の配線のみ**：ルール計算はsystemsへ委譲。Sceneが太らないようにする。
- **EventBusの用途を限定**：「レベルアップ通知」「BGM変更」等の横断イベントのみ。主要データフローはストア直参照（暗黙の依存を増やさない）。

---

## 3. 状態管理設計

### 3-1. 状態の3分類
| 区分 | 例 | 寿命 | セーブ |
| --- | --- | --- | --- |
| **永続状態**（GameState） | パーティ・所持品・金・フラグ・章・現在地・設定 | セーブ間で保持 | ◯ 保存 |
| **実行時状態**（Runtime） | 戦闘中のターン状態・カメラ・アニメ進捗 | シーン中のみ | ✕ 非保存（再生成） |
| **不変データ**（Database） | モンスター/アイテム/マップ定義 | アプリ生存中 | ✕（JSONが正） |

> **原則：セーブデータ＝GameStateの直列化のみ**。RuntimeとDatabaseはロード時に再構築（hydrate）。これでセーブサイズ最小化＆バージョン互換が容易。

### 3-2. GameState のスキーマ（単一ソース）
```js
GameState = {
  meta:    { version: 1, playtimeSec: 0, createdAt, updatedAt },
  chapter: { id: "prologue", step: 0 },          // 章管理(§02)
  location:{ mapId: "lumina", x: 8, y: 6, dir: "down" }, // 復帰位置
  party: {
    gold: 0,
    members: [ /* Characterの可変分のみ：id,lv,exp,curHp,curMp,
                  jp, jobId, subJobId, learnedSkills[], equip{w,sh,hd,bd,ac1,ac2},
                  statusEffects[], bond(絆) */ ],
    order: ["lou","garrod","fina"],   // 隊列
    reserve: ["shino"]                // 控え
  },
  inventory: { items: { "potion": 5, ... } },     // id→個数
  flags:     { "FLG_1_07": true, ... },           // ブール/数値フラグ(§02)
  variables: { "arena_rank": 3 },                 // 数値変数
  bestiary:  { seen:[...], defeated:[...] },       // 図鑑(§09)
  settings:  { bgmVol:0.7, seVol:0.8, difficulty:"normal",
               textSpeed:"normal", touchLayout:"right" }
}
```
- Characterは「不変の定義（Database.characters）＋ GameStateの可変分」を**ロード時に合成**して生成。装備の能力値もDatabaseのitemsを参照して都度算出（保存はIDのみ）。

### 3-3. データフロー（単方向）
```
入力(Input) → Scene.handleInput → system呼び出し（domain）
   → GameState を更新 → EventBusで通知（必要時）
   → 次フレーム render が GameState を読んで描画
```
- **状態の書き換えは「systemまたはEventCommand経由」に限定**。Sceneが直接深い構造を書き換えない（更新箇所を一元化＝バグ追跡が容易）。
- 戦闘などRuntime状態は `BattleSession` オブジェクトに閉じ込め、終了時に結果（EXP/ドロップ/HP）だけをGameStateへ反映。

### 3-4. シーンスタック（画面遷移の状態）
```
[TitleScene]                     起動
push→ [FieldScene]               ゲーム開始
push→ [DialogueScene]            会話中（下のFieldは停止）
push→ [BattleScene] (replace可)  エンカウント
push→ [MenuScene]                メニュー（オーバーレイ）
pop ←                            元の画面へ復帰
```
- スタック上位のみ`update`、描画は下位も継続（オーバーレイ表現）。`Scene.opaque`で下を描くか制御。

---

## 4. イベント管理設計

### 4-1. 方式：データ駆動インタプリタ（RPGツクール型）
イベントは**JSONのコマンド配列**。`EventInterpreter`が`async/await`で1つずつ実行し、会話送りや選択など**ユーザー入力待ちで自然に停止**する。

### 4-2. トリガー種別
| トリガー | 発火条件 | 例 |
| --- | --- | --- |
| `action` | プレイヤーが対面して決定キー | NPC会話・宝箱・看板 |
| `touch` | プレイヤーが踏む/接触 | ワープ床・罠・自動戦闘 |
| `autorun` | マップ進入時に条件成立で自動 | 章開始の強制イベント |
| `parallel` | 常時並行（移動可のまま） | NPCの徘徊・環境演出 |
| `onEnterMap` | マップロード直後 | BGM設定・初期配置 |

### 4-3. ページ（条件分岐するイベント実体）
1つのイベントは複数**ページ**を持ち、**条件（フラグ/章/所持品）を満たす最後のページ**が有効になる（ツクール準拠）。これで「進行で会話が変わるNPC」を宣言的に表現。
```jsonc
{
  "id": "npc_milka",
  "pages": [
    { "conditions": {},                         "trigger": "action",
      "commands": [ {"type":"message","text":"よく来たね。"} ] },
    { "conditions": { "flag": "FLG_0_03" },     "trigger": "action",
      "commands": [ {"type":"message","text":"…達者でね。"} ] }
  ]
}
```

### 4-4. イベントコマンド一覧（初期セット）
| コマンド | 引数 | 動作 |
| --- | --- | --- |
| `message` | text, name?, face? | 会話ウィンドウ（送り待ち） |
| `choice` | options[], branches{} | 選択肢→分岐（フラグ/コマンド列へ） |
| `setFlag`/`setVar` | key, value | フラグ・変数の設定 |
| `if` | condition, then[], else[] | 条件分岐 |
| `giveItem`/`takeItem` | id, count | 所持品増減（宝箱含む） |
| `giveGold` | amount | 所持金増減 |
| `addMember`/`removeMember` | id | 仲間加入/離脱 |
| `playBgm`/`playSe`/`stopBgm` | id, vol | 音再生 |
| `wait` | frames | 待機 |
| `moveActor` | who, path | キャラ自動移動（イベント演出） |
| `transfer` | mapId, x, y, dir | マップ移動 |
| `battle` | troopId, canEscape, onWin/onLose | 戦闘開始→結果で分岐 |
| `shop` | itemList | 店UIを開く |
| `heal` | target | 宿屋/教会の全回復 |
| `screenFade` | in/out, color | フェード演出 |
| `setChapter` | id, step | 章進行(§02) |
| `wait_input` | — | キー入力待ち |

> コマンドは`EventCommands.js`に**1関数1コマンド**で実装し、追加が容易な辞書登録方式（`commands[type] = handler`）。

### 4-5. フラグ・章管理
- `FlagManager`：`get/set/test`。命名は設計書ルール `FLG_章_連番`（§README）。
- 条件オブジェクトで宣言的判定：`{ flag:"FLG_3_07", chapterAtLeast:"ch3", hasItem:"key", varGte:["rank",3] }`。
- `ChapterManager`：章ID列を保持し、`advance()`で次章解放。マップのエンカウント表・NPCページ・到達可能エリアが章に連動。

### 4-6. 戦闘との連携
`battle`コマンド → `BattleScene`へpush → 終了時に`{result, expGained, drops, partyState}`を返却 → `onWin/onLose`分岐を実行。**イベント駆動と戦闘が疎結合**（戦闘はイベントを知らない）。

---

## 5. セーブデータ設計（LocalStorage）

### 5-1. ストレージ構成
| キー | 内容 |
| --- | --- |
| `eternia.save.meta` | スロット一覧メタ（章/Lv/playtime/更新日時、一覧画面用） |
| `eternia.save.slot0` | スロット0 本体（オートセーブ） |
| `eternia.save.slot1..3` | 手動スロット3つ |
| `eternia.config` | 設定（セーブと独立、起動時即適用） |

### 5-2. セーブ形式
```jsonc
{
  "version": 1,                 // マイグレーション用
  "savedAt": "2026-06-02T...",
  "header": {                   // 一覧表示用（本体を開かず読む軽量情報）
    "chapter": "第3章",
    "leader": "ルゥ", "level": 21,
    "playtime": "08:42", "location": "聖樹の里ユグル"
  },
  "state": { /* GameState を丸ごと（§3-2）。Runtime/Databaseは含めない */ }
}
```
- **保存対象＝GameStateのみ**（可変状態の正本）。Database由来の不変値・Runtimeは保存せず、ロード時に再構築。
- ロード手順：`parse → version migrate → GameState復元 → Database参照でCharacter/装備等をhydrate → location.mapId をロードして FieldScene 復帰`。

### 5-3. 堅牢性・互換性
| 観点 | 対策 |
| --- | --- |
| 破損/不正JSON | `try/catch`＋スキーマ検証。失敗時はそのスロットを「破損」表示し他スロットを保護 |
| バージョン差 | `version`で`migrations[]`を順次適用（旧→新へ変換関数を積む） |
| 容量 | GameStateのみ＝数十KB。LocalStorage上限に余裕 |
| 改ざん耐性 | 任意：簡易チェックサムをheaderに付与（全年齢・チート許容度は緩めでも可） |
| オートセーブ | マップ移動時/イベント節目に`slot0`へ自動保存（設計§04-7の「こまめに保存」） |

### 5-4. セーブ/ロードAPI（SaveManager）
```js
SaveManager.save(slot, gameState)   // header生成→JSON化→LocalStorage書込
SaveManager.load(slot) -> GameState // 読込→migrate→検証→返却（失敗はthrow）
SaveManager.list() -> SlotHeader[]  // タイトル「つづきから」一覧用
SaveManager.delete(slot)
SaveManager.exists(slot) -> bool
ConfigStore.load()/save(settings)   // 設定は常時独立保存
```

---

## 6. 実装順（承認後のスケジュール提案）

> 設計書 `10_roadmap.md` の **MVP（プロローグ＋第1章）** を最初のゴールにする。

| 順 | マイルストーン | 内容 |
| --- | --- | --- |
| S1 | **エンジン基盤** | Game/Scene/Input/Renderer/GameState/EventBus＋空のTitle→Field遷移 |
| S2 | **マップ探索** | TileMap/移動/カメラ/NPC/宝箱＋1マップ(ルミナ) |
| S3 | **イベント基盤** | EventInterpreter＋message/choice/flag/transfer＋プロローグ会話 |
| S4 | **戦闘** | BattleSystem/DamageFormula/属性/状態異常＋たたかう/じゅもん/どうぐ/にげる |
| S5 | **育成・メニュー** | Lv/EXP/装備/スキル＋MenuUI＋InventorySystem |
| S6 | **セーブ** | SaveManager＋タイトルのつづきから/設定 |
| S7 | **MVP仕上げ** | プロローグ＋第1章を通しでプレイ可能に＋データ投入(M01–M10,B2) |

各Sの完了時に**動作確認（コンソールエラー0）**を必須とする。

---

## 7. 承認をお願いしたい確認ポイント

1. **配置＝`rpg/` で共存**（既存STGを残す）で問題ないか。
2. **ES Modules＋静的サーバ起動**（`file://`直開きは不可）で問題ないか。
   - もし「`file://`でダブルクリック起動」を優先したい場合は、既存STGと同じ **classic script＋グローバル名前空間方式**に切り替え可能（モジュール性はやや低下）。
3. **マスターデータのJSON外出し**方針でよいか。
4. **最初の実装ゴール＝MVP（プロローグ＋第1章）** でよいか（全章一括ではなく段階実装）。

> 上記4点を承認 or 修正指示いただければ、本設計どおり **S1（エンジン基盤）から実装コードを生成**します。
