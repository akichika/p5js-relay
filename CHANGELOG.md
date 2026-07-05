# Changelog

このプロジェクトのバージョンは [Semantic Versioning](https://semver.org/lang/ja/) に
概ね従っています。詳細な技術的経緯は `HANDOFF.md` の第6章も参照してください。

## [2.5.4] - 2026-07-04
### Fixed
- claude.aiで、Artifactパネルを閉じた状態のままFAB(常設フローティングボタン)
  から直接転送すると失敗する不具合を修正。パネルが閉じているとコード表示
  トグル自体がDOM上に存在しないため、まずチャット内のArtifactカード
  (`.group\/artifact-block`)を開く処理を追加。カード外側のdivはclick()に
  反応しないため、内部の実`<button>`要素を操作するようにした
  (初期実装では`[class*='artifact-block']`という部分一致セレクタを使って
  しまい、子要素の"artifact-block-cell"を誤って掴んでいたため完全一致に修正)

## [2.5.3] - 2026-07-04
### Fixed
- claude.aiのArtifactからの転送が2.5.2でも失敗する問題を修正。実機のDOM調査で
  判明した本当の原因は2つ:
  1. プレビュー/コード表示の切替ボタンが `role="radio"`(`role="radiogroup"`内、
     aria-label="コード")として実装されており、トグルボタン検出のセレクタ
     (`button, [role='tab'], [role='button']`)に含まれていなかった
  2. コード表示自体もCodeMirror/Monaco/`<pre>`ではなく、1行=1要素
     (class名に`group/line`を含む独自レンダラー)で描画されている
- `[role='radio']`をトグル検出対象に追加し、`group/line`要素からのコード
  抽出(各行要素の最後の子要素がコード本体)を新しい抽出方式として追加

## [2.5.2] - 2026-07-04
### Fixed
- claude.aiのArtifactからの転送が常に失敗する不具合を修正。原因は
  ClaudeがArtifactパネル(プレビューだけでなくコード表示も)を
  `a.claude.ai`等の別オリジンiframe内でレンダリングするようになった
  ことで、`extractFromTab()`がメインフレームしか対象にしておらず
  何も取得できていなかった。`chrome.scripting.executeScript`の
  `allFrames: true`で全フレーム(クロスオリジンiframe含む)を対象に
  実行し、最も長い抽出結果を採用するように変更

## [2.5.1] - 2026-07-04
### Fixed
- ChatGPTで転送ボタンが2個表示される不具合を修正。原因はChatGPTがコード
  ブロックの描画をCodeMirrorビューアに変更し、外側のpre(markdown)の中に
  pre.cm-contentが入る二重構造になったこと（従来対策していた「Reactによる
  ボタン複製」とは別の、入れ子preへの正規の二重付与）。入れ子preには
  ボタンを付けず、外側preに一本化するガードを追加

## [2.5.0] - 2026-07-04
### Added
- 対応言語を英語・日本語の2言語から、中国語（簡体字/繁体字）・韓国語・
  スペイン語・フランス語・ドイツ語・ポルトガル語（ブラジル）・ロシア語を
  加えた10言語に拡大（`i18n.js`の言語判定ロジックを刷新し、`zh-CN`/`zh-TW`/
  `pt-BR`等のブラウザ言語コードを正しく判別するように変更）
- オプションページ下部に About セクションを追加（GitHubリポジトリ・Issue・
  Pull RequestへのリンクとXアカウントリンク、著作権表示）。ポップアップにも
  簡易的な著作権表示とXリンクを追加
- GitHubリポジトリ (https://github.com/akichika/p5js-relay) を公開。
  Issue報告・Pull Requestの窓口をGitHubに一本化
### Changed
- 拡張機能の説明文をシンプル化:「Claude / ChatGPT / Geminiで生成された
  コードを p5.js Web Editor 等へ簡単転送。バイブコーディングなどの用途に。」
- `manifest.json` の `options_page` を MV3 標準の `options_ui`
  (`open_in_tab: true`) に変更
- Microsoft Edge（Chromium系）での動作を確認し、README/store-listingに
  インストール手順とEdge Add-ons提出手順を追記（コード変更は不要だった）

## [2.4.3] - 2026-07
### Changed
- 転送ボタン左端のドラッグ用グリップを幅10px→5px、斜線1px幅に変更しすっきりさせた

## [2.4.2]
### Fixed
- ChatGPTで転送ボタンが2個表示される不具合を、ボタンと設置先の整合チェック
  (WRAP_HOST)により根治
- ▾（送信先選択）メニューが開かなくなっていた不具合を修正（`overflow: hidden`の誤用）
### Added
- CodePenへの転送時、生成コードがJSのみでHTML/CSSを含まない場合に、
  p5.js CDNとデフォルトCSSを自動外挿し、必ずHTML/CSS/JSの3パネルへ転送するように変更

## [2.4.1]
### Fixed
- ドラッグ機能導入時の実装ミスで転送ボタン本体と▾メニューが押せなくなっていた不具合を修正
  （ドラッグ判定をボタン全体から左端グリップのみに変更）
### Changed
- ボタンデザインを長円（ピル型）から角丸長方形に変更

## [2.4.0]
### Changed
- 転送ボタンの配置を「上下2箇所」から「右上1箇所」に変更
- ボタンをドラッグで移動できるように変更（ページリロードで既定位置にリセット）
- OpenProcessingのHTML/CSS/JSモードへの自動切替を廃止し、ライブラリ追加が
  必要な場合のみ案内ダイアログを表示する方式に変更

## [2.3.0]
### Fixed
- ChatGPT等のReact系UIでの再レンダリングにより転送ボタンが点滅・複数化する
  不具合を、「複製ノードのみ除去」方式に変更して緩和
- 拡張機能アップデート後に開きっぱなしのタブで発生する
  "Extension context invalidated" エラーを検知して自己停止するように変更

## [2.2.1]
### Added
- Claude Artifactの抽出時、コードがプレビュー表示でDOM上に無い場合に
  コード表示トグルを自動クリックしてから再抽出する処理を追加
- claude.ai専用の常設フローティング転送ボタンを追加

## [2.2.0]
### Changed
- OpenProcessingをHTML/CSS/JSモード前提のマージ方式に変更（タブ名 mySketch.js 対応）
- ChatGPTでの転送ボタン重複表示への対策（第1弾）
### Removed
- JSFiddleへの対応を終了（自動貼り付けが安定しなかったため）

## [2.1.0] - [2.1.2]
### Added
- 既定の送信先が、直近に開いた／アクティブにした登録済みエディタタブへ自動追従する機能
- テーマ設定（ライト/ダーク/システム）
- ランタイム言語切替（i18n.js）
### Changed
- 転送ボタンのラベルを「反映」から「転送」に変更
- index.htmlへのライブラリ差し込みに失敗した場合のフォールバック（全置換）を追加

## [2.0.0]
### Added
- 拡張機能名を「p5.js Relay」に変更
- 単一HTMLをindex.html / style.css / sketch.jsへ自動分割する機能
- 日本語・英語のUIローカライズ（_locales）
- p5.jsブランドカラーを基調としたUIデザイン

## [1.x]
- Claude / ChatGPT / Gemini Canvas のコードブロックへの転送ボタン追加
- Gemini Canvasモードへの対応（Shadow DOM走査、CodeMirror 6の仮想スクロール対策）
- 送信先パターンのサイトごと登録機能（オプションページ）
