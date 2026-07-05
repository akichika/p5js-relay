# HANDOFF.md — p5.js Relay 開発引き継ぎ資料

このファイルは、Claude Code（またはこのプロジェクトを引き継ぐ次の開発者/AI）が
すぐに作業を再開できるようにするための技術メモです。会話ベースで反復開発してきた
経緯を踏まえ、**なぜ今の実装になっているか**を優先して記録しています。

現在バージョン: **v2.5.0**（v2.4.3までの経緯は本文中に残す。v2.5.0時点の
変更点は末尾の「8. v2.5.0での変更点」を参照）

---

## 1. プロダクト概要

**p5.js Relay** は、Claude / ChatGPT / Gemini（Canvasモード） で生成されたコードを、
p5.js Web Editor などのオンラインコードエディタへワンタッチで転送する Chrome /
Microsoft Edge 拡張（Manifest V3）です。

- 単一HTMLで生成されたコードを **HTML / CSS / JS に自動分割**し、送信先エディタの
  構造（タブ切替式 / パネル分割式）に合わせて書き分ける
- p5.js標準以外の外部ライブラリ（CDN の `<script src>`）やフォント等の `<link>` を検出し、
  送信先の index.html に**壊さずに差し込む**
- ライト/ダーク/システムテーマ、10言語UI(英語・日本語・中国語簡体字/繁体字・韓国語・
  スペイン語・フランス語・ドイツ語・ポルトガル語ブラジル・ロシア語。ブラウザ言語に
  自動追従、非対応言語は英語)
- 転送ボタンはコードブロック / Canvas パネル / Artifact パネルに1個だけ表示され、
  ドラッグで移動できる（リロードでリセット）
- オプションページにAboutセクション（GitHubリポジトリ・Issue・PRリンク、
  Xアカウント、著作権表示）

## 2. ファイル構成と役割

```
manifest.json      MV3マニフェスト。__MSG_appName__ 等でi18n名を参照
background.js      Service Worker。全ロジックの中枢(下記3章で詳述)
i18n.js             ランタイムi18n(chrome.i18nは実行時切替不可のため自前実装)
theme.js            options/popup共通: テーマ適用 + data-i18n差し込み
content/source.js   送信元(AIチャット)のcontent script。ボタン生成・ドラッグ・抽出
content/source.css  ボタンの見た目(p5.jsピンク基調、長方形+左端グリップ)
options.html/js     送信先ルールの登録UI
popup.html/js       ツールバーポップアップ(既定送信先・直近コード再送)
_locales/en,ja,...  i18n辞書(表示文言の実体。10言語。i18n.jsがfetchして読む)
icons/icon.svg      アイコン原本(SVG)。ここからPNG(16/48/128)を都度生成している
```

**重要**: `_locales/` は Chrome 標準の i18n 機構用（manifest名などに使用）だが、
UI文言のランタイム切替は `i18n.js` が同じ `_locales/*/messages.json` を
`fetch()` して自前で行っている。**メッセージを追加/変更する場合は
`_locales/en, ja, zh_CN, zh_TW, ko, es, fr, de, pt_BR, ru` の10ファイル
すべてを更新すること**（詳細は`CONTRIBUTING.md`参照）。

## 3. background.js の構造(最重要)

### 3.1 送信先ルール(rule)のスキーマ

```js
{
  id, name, urlPattern, openUrl,
  editor: "auto" | "codemirror5" | "codemirror6" | "monaco" | "ace" | "textarea" | "contenteditable",
  selector: "",              // editorが auto でない場合のスコープ指定
  initDelay: 2000,           // 新規タブを開いた時の初期化待ち(ms)
  splitMode: "off" | "tabs" | "panels",
  htmlMode: "merge",         // splitMode=tabs 時、index.htmlを"全置換"でなく"差分マージ"する
  htmlModeNotice: true,      // OpenProcessing専用。下記3.4参照
  fileMap: { js, html, css },   // splitMode=tabs 用。ファイルタブの表示名
  panelMap: { html, css, js },  // splitMode=panels 用。各言語パネルのCSSセレクタ
  enabled: true
}
```

現在のプリセット3件:

| id | サイト | splitMode | 備考 |
|---|---|---|---|
| `p5js` | p5.js Web Editor | tabs + htmlMode:merge | 最も安定 |
| `openprocessing` | OpenProcessing | tabs + htmlMode:merge + htmlModeNotice | モード切替は自動化を諦めて案内ダイアログ方式(3.4) |
| `codepen` | CodePen | panels | HTML/CSS/JSパネルへ直接反映。デフォルト外挿あり(3.5) |

JSFiddleは自動操作が安定せず**v2.2.0で対応終了・削除済み**。復活させる場合は
`DEFAULT_RULES` にpanelsモードで追加し、移行処理(`onInstalled`内)で旧`jsfiddle`削除
コードと衝突しないか確認すること。

### 3.2 コード分割 `splitCode()`

Service WorkerにはDOMParserが無いため**正規表現ベース**で分割している。

- `<style>...</style>` → CSS本体を抽出、HTML側は最初の1箇所だけ `<link>` に置換
- `<script>...</script>`(srcなし) → JS本体を抽出、HTML側は最初の1箇所だけ `<script src="sketch.js">` に置換
- 外部 `<script src="...">` → `libs`(全部)と`extraLibs`(p5コア以外)に分類
- 外部 `<link rel="stylesheet">` → `cssLinks`
- JSがp5スケッチ(setup/draw使用)なのにp5読込が無ければCDNを自動補完
- `dedent()` でインデントを正規化

戻り値: `{ full, body, css, js, libs, extraLibs, cssLinks }`

単体テストは会話ログ内で `node -e` によりインライン実行してきた(専用テストファイルは
まだ無い。**Claude Codeでの最初のタスクとして `tests/splitCode.test.js` 化を推奨**)。

### 3.3 index.htmlへのライブラリ"マージ"方式 (`htmlMode: "merge"`)

p5.js Web Editorのindex.htmlを**丸ごと置き換えると、エディタ標準のp5読込構造を壊す
リスクがある**ため、以下の方式にした:

1. `fileMap.html`(通常"index.html")のタブをクリック
2. `readCurrent()` でエディタの現在の内容を読み取る(タブ切替直後は非同期なので
   最大3秒のリトライ)
3. `parts.extraLibs` / `parts.cssLinks` のうち、URLが現在の内容に含まれないものだけを
   `</head>` 直前に差し込んで全置換で書き込む
4. 3が失敗した場合のフォールバックとして、`parts.fallbackHtml`(完全なHTML)で
   index.htmlを丸ごと置き換える

診断ログは `log()`(=`console.info`)で `[p5.js Relay] merge: ...` の形式で出す。
**ライブラリが差し込まれない不具合報告が来たら、まずこのログを見てもらうこと。**

### 3.4 OpenProcessingの `htmlModeNotice` 方式

背景: OpenProcessingはデフォルトが「P5js」モード(単一JSファイルのみ、index.html/
style.cssタブが存在しない)。HTML/CSS/JSモードに切り替えるボタンは
SKETCHパネル内にあり、**自動クリックでの切替を複数回試みたが安定しなかった**
(v2.2.0〜v2.3.0で自動切替→ダイアログ確認まで実装したが、実機で失敗報告が続いた)。

最終的にv2.4.0で「**自動切替は諦め、必要な時だけ案内する**」方式に倒した:

```js
if (rule.htmlModeNotice && parts.mergeLibs?.length && !locateFileTab(fileMap.html)) {
  alert(messages.modeNotice); // 「HTML/CSS/JSモードにして再転送してください」
  delete parts.mergeLibs;
  delete parts.fallbackHtml;
}
```

- ライブラリが不要なコード(素のp5スケッチ)なら、ダイアログは出さずJSのみ転送する
- 既にHTML/CSS/JSモードなら(index.htmlタブが存在するので)ダイアログは出ない
- **もしClaude CodeでOpenProcessing対応を改善するなら**、OpenProcessing側に
  「モード切替をURLパラメータや別経路で行う手段」が無いか調査する価値がある
  (現状は未調査)

### 3.5 CodePenの `panels` モードとデフォルト外挿

CodePenはHTML/CSS/JSが最初から3パネルとも存在するため、`panelMap`のセレクタへ
直接書き込むだけで良い。ただし**生成コードがJSのみ(HTML/CSSを含まない)場合、
何もしないとCodePen側のHTML/CSSパネルが空のままになり実行できない**という
指摘を受け、v2.4.2で以下を追加:

- HTML/CSSが渡されなかった場合、p5.js CDN(+必要ならp5.sound)の`<script>`タグと、
  `margin/padding:0; canvas{display:block}` のデフォルトCSSを**外挿**して必ず
  3パネルとも転送する

### 3.6 エディタ反映メソッド (`applyCodeInPage` 内 `methods`)

`codemirror5/6, monaco, ace, textarea, contenteditable` の6種類。`editor: "auto"`は
この順で試す。Shadow DOM(open)対応の `deepQuery`/`deepAll` を使っている。

タブ切替 `clickFileTab()` は **2パス**(可視要素優先→非表示要素にもクリック
ディスパッチ)。これはp5.js Editorの**ファイルサイドバーが閉じているとタブ要素の
サイズが0になり、可視判定で弾かれる**という不具合(ユーザー報告で発覚)への対処。

## 4. content/source.js の構造(重要な設計判断)

### 4.1 ボタンは「設置先ごとに1個」を強制する

過去の不具合(ChatGPTで転送ボタンが2個表示される)の原因は、Reactの再レンダリングで
**注入したボタンDOMが複製される/設置先の外へ移動させられる**ことだった。
複数回のパッチを経て、最終的に以下の方式に収束した(v2.4.2):

- `LIVE` (WeakSet): このスクリプトが生成した「本物」のボタン
- `WRAP_HOST` (WeakMap): ボタン → 本来あるべき設置先要素(pre/panel/body)
- `globalCleanup()`: 毎スキャンの冒頭で、`LIVE`だが`WRAP_HOST`の設置先の外に
  出てしまったボタンを除去(Reactに追い出された本物)
- `cleanClones(container)`: 指定要素内を見て、`LIVE`でない複製を除去し、
  「正しいhostに紐づく本物」が既にあるかを返す

**このロジックを変更する場合は、必ずChatGPT/Claude/Geminiの3サイトで
数分間放置して複数化しないことを確認すること。** 単発の目視では再現しない
バグだった。

**v2.5.1追記 — 入れ子preによる二重付与(React複製とは別種)**:
ChatGPTがコードブロックの描画をCodeMirrorビューアに変更し、外側の
pre(markdown)の中に `pre.cm-content` が入る二重構造になった。この場合、
両方のpreが「正当なホストを持つ本物のボタン」になるため、上記の
LIVE/WRAP_HOST機構では除去されない(複製ではないから)。対策として
`isNestedPre()` を追加し、(1) attachButtonで入れ子preをスキップ、
(2) globalCleanupで入れ子preにホストされた本物ボタンも除去、の2段で
外側preに一本化した。外側preには`code`要素があり抽出はcodeスコープの
ためヘッダー(言語名等)の混入は無いことを実DOMで確認済み。
今後「ボタンが2個」の報告が来たら、React複製(→LIVE/WRAP_HOST)と
DOM構造変化による正規の二重付与(→isNestedPre相当のガード)の
どちらのパターンかをまず切り分けること。

### 4.2 ボタンの見た目とドラッグ

- 長方形(角丸6px)。構成: `[グリップ5px | ✳ 転送(main) | ▾(more)]`
- グリップは幅5px、斜線1px幅の`repeating-linear-gradient`、地色はボタン本体と同色
- ドラッグは**グリップ要素だけ**に`pointerdown/move/up`を張っている。
  当初ボタン全体をドラッグ対象にしたところ`setPointerCapture`がクリックを
  奪ってしまい、転送ボタンも▾メニューも反応しなくなる不具合が発生した
  (ユーザー報告で発覚、v2.4.1で修正)
- 位置は保存しない(要件: リロードでリセット)。`wrap.style.left/top`を
  直接書き換えるだけ

### 4.3 パネル検出とclaude.ai専用FAB

Gemini CanvasやChatGPT Canvasは`.cm-editor`等のエディタ要素を含む
十分大きいブロックをパネルとして検出しボタンを付与する(`scanPanels`)。

claude.aiのArtifactは**プレビュー表示だとコードがDOM上に存在しない**
(実行結果のiframeしか無い)ため、パネル検出が機能しない。対策として
**画面右下に常設のフローティングボタン(FAB)**を出し、抽出時にコード表示
トグル(`</>`ボタン、aria-label等に code/コード を含む小型ボタン)の自動クリックを
試みてから再抽出する(`extractCanvasCodeInPage`内)。

**未解決**: コード表示トグルの検出はaria-label等のテキストマッチに依存しており、
Claude側のUI変更で壊れる可能性がある。今後Artifactボタンが反応しない報告が
来たら、まずこのトグル検出ロジックを疑うこと。

**v2.5.2追記 — Artifactが別オリジンiframe化(クロスオリジンiframe問題)**:
実機調査(claude.aiの実際のタブでJS実行して確認)の結果、Claudeは
Artifactパネルを**プレビューだけでなくコード表示も** `a.claude.ai` の
`isolated-segment.html` という別オリジンiframe内でレンダリングするように
変更されていた(セキュリティ的なサンドボックス化と思われる)。
`extractFromTab()`が`chrome.scripting.executeScript`を
`target: {tabId}`(メインフレームのみ)で呼んでいたため、コードが
一切見つからず常に失敗していた。

対策: `target: {tabId, allFrames: true}` に変更し、全フレーム
(クロスオリジンiframe含む)で`extractCanvasCodeInPage`を実行、
各フレームの結果から最も長い文字列を採用するようにした。
`chrome.scripting.executeScript`は`host_permissions`さえあれば
クロスオリジンiframeにも注入できる(ページ側JSの同一オリジン制約を
拡張機能の特権で越えられる)ため、content_scripts側の変更は不要だった。

**今後の注意**: Claude側が今後さらにiframeを増やす/入れ子にする変更を
した場合、`allFrames:true`の結果配列がさらに増えるだけで対応できるはず
だが、「最も長い結果を採用」というヒューリスティックが誤ったフレーム
(無関係な広告iframe等)を拾わないか、報告が来たら確認すること。

**v2.5.3追記 — 本当の原因は role="radio" と独自コードレンダラー**:
v2.5.2のallFrames対応後も実機で失敗が続いた。claude.aiの実タブに対して
`chrome.scripting`を使わず素のJS(`document.elementsFromPoint`等)で
直接調査したところ、以下2点が本当の原因だった(iframe化はプレビュー用の
別問題として実在するが、失敗の直接原因ではなかった):

1. プレビュー/コード表示の切替は `role="radiogroup"`
   (`aria-label="ファイルビューモード"`)の中の `role="radio"`
   (`aria-label="コード"` / "プレビュー")として実装されていた。
   トグル候補の検索セレクタが`button, [role='tab'], [role='button']`
   のみで`[role='radio']`を含んでいなかったため、トグルが一度も
   見つからずクリックされていなかった。
2. コード表示自体もCodeMirror/Monaco/`<pre>`のいずれでもなく、
   1行=1要素(class名に`group/line`を含む独自レンダラー)で描画されており、
   各行要素の**最後の子要素**(先頭2つは行番号・折りたたみガター用の
   `select-none`なspan)がその行のコード本体だった。

対策: トグル検出セレクタに`[role='radio']`を追加し、`collect()`に
`.group\/line`要素からの抽出方式を追加(他の方式が見つからない場合の
最終手段として一番後ろに追加)。

**デバッグ手法の教訓**: `chrome.scripting.executeScript`で注入した
関数内の`console.info`は、拡張のService Worker側から
`chrome.scripting`経由で見ようとしても(あるいは外部のブラウザ操作
ツールから見ようとしても)ページのコンソールに出ているはずなのに
見えない/追いにくいことがある。確実なのは **戻り値に診断情報
(trace配列)を積んで呼び出し元に返し、それをService Worker側の
`console.info`やエラーメッセージ経由で確認する**方法。
`extractCanvasCodeInPage`は現在`{code, trace}`を返す形になっており、
`extractFromTab()`がフレームごとのtraceを結合して
`console.info("[p5.js Relay] extractFromTab debug:", ...)`で
Service Workerコンソールに出す(`chrome://extensions`の対象拡張→
「service worker」リンクから確認できる)。今後同様の「原因不明の
抽出失敗」が起きたら、まずこのdebugログを見ること。

### 4.4 拡張機能アップデート後の「Extension context invalidated」対策

拡張を更新すると、開きっぱなしのタブに残った旧content scriptが
`chrome.runtime.sendMessage`を呼んで例外になっていた(ユーザーがChrome拡張の
エラーページのスクリーンショットで報告)。`safeSend()`でラップし、
`chrome.runtime.id`が取得できない/`context invalidated`を検知したら
`teardown()`でタイマー・Observerを止めて自己停止するようにした。

## 5. 既知の未解決課題 / 次にやるべきこと

優先度高い順:

1. **OpenProcessingのモード自動切替**: 現状は案内ダイアログで妥協(3.4)。
   自動化する方法があれば実装したい。
2. **Claude ArtifactのUI変更耐性**: コード表示トグルの検出がテキストマッチ
   ベースで壊れやすい(4.3)。
3. **テストの自動化**: `splitCode()`など純粋関数はNode単体で切り出してテスト
   可能。現状は会話内で手動実行したのみ。`tests/`ディレクトリを作り、
   `node --test` 等で自動化するとClaude Codeでの回帰確認が楽になる。
4. **JSFiddle復活の要否**: 対応終了済み(3.1)。要望が強ければpanelsモードで
   再挑戦の余地はある。
5. **ドラッグ位置の永続化オプション**: 現仕様は「リロードでリセット」が
   要件だが、要望があれば「セッション中だけ保持」等の中間案も検討可。
6. **ストア審査対応**: `host_permissions: ["<all_urls>"]`は送信先をユーザーが
   自由登録できる設計上必要だが、審査で指摘される可能性がある。
   `optional_host_permissions`化して登録時に許可を求める設計への変更も
   検討の余地あり(store-listing.mdに理由は明記済み)。

## 6. バージョン履歴の要約(なぜ今の実装か、の裏付け)

- v2.0.0: 名称をp5.js Relayに統一。マルチファイル分割の初期実装。i18n(_locales)導入
- v2.1.0: 既定送信先のタブ自動追従。ランタイムi18n(i18n.js)導入。テーマ機能
- v2.1.1〜2.1.2: ラベルを「反映」→「転送」に変更。merge失敗時のフォールバック、
  診断ログ追加
- v2.2.0: OpenProcessingをHTML/CSS/JSモード前提のmerge方式に変更、JSFiddle削除、
  ChatGPT二重ボタン対策(第1弾)
- v2.2.1: Claude Artifact抽出のコード表示トグル自動クリック追加、claude.ai用FAB追加、
  OpenProcessingモード自動切替の3段連鎖(設定パネルを開く→切替→確認ダイアログ)
- v2.3.0: ボタン重複対策を「全撤去→再付与」から「複製のみ除去」方式に変更、
  contextライフサイクル管理(safeSend/teardown)追加
- v2.4.0: ボタン配置を右上1個+ドラッグ移動可能に変更、OpenProcessingは
  モード自動切替を諦め案内ダイアログ方式に変更
- v2.4.1: ドラッグをグリップ専用に変更(ボタン本体のクリック不能バグ修正)、
  デザインを長方形化
- v2.4.2: WRAP_HOSTによるボタン設置先整合チェックでChatGPT2個化を根治、
  ▾メニューが開かないバグ修正(overflow:hidden誤用)、CodePenのデフォルト外挿
- v2.4.3: グリップの見た目調整(幅10px→5px、斜線4px→1px)

## 7. 開発・デバッグの勘所

- **拡張を更新したら、対象タブは必ずリロードすること**。開きっぱなしのタブは
  古いcontent scriptのまま(Chromeの仕様)。この一言が原因のバグ報告が
  複数回あった。
- 診断ログは全て `console.info("[p5.js Relay]", ...)` で出している
  (`console.warn`にするとChromeの拡張機能エラー一覧に載ってしまうため、
  意図的に`info`にしている。過去にこれが原因で「エラーが出る」と
  誤報告されたことがある)。
- ユーザーはスクリーンショット付きで報告してくれることが多いので、
  DOM構造の推測にはそれを最優先で使うこと(実サイトへの直接アクセスは
  していないため、推測がずれることがある)。

## 8. v2.5.0での変更点(公開準備)

Claude Codeへの引き継ぎ後、公開に向けて以下を実施した。

- **GitHub公開**: リポジトリ名 `p5js-relay`。Issue/Pull Requestの窓口は
  GitHubに一本化(README/CONTRIBUTING/store-listing.mdから誘導)。
  `gh` CLIが引き継ぎ環境に無かったため、リポジトリ本体の作成・pushは
  ユーザー側のGitHub連携(MCP)認証待ち。ローカルの`git init`/コミットまでは
  完了させてある。
- **i18n刷新**: 対応言語を英語・日本語の2言語から、中国語(簡体字/繁体字)・
  韓国語・スペイン語・フランス語・ドイツ語・ポルトガル語(ブラジル)・
  ロシア語を加えた10言語に拡大。`i18n.js`の`FOLDERS`マップで
  コード(`zh-cn`等、storageに保存する値)と`_locales`のフォルダ名
  (`zh_CN`等、Chromeのi18n仕様上アンダースコア必須)を分離し、
  `detectFromUI()`でブラウザの言語コード(`zh-TW`, `pt-BR`等)を
  正しい対応コードへ変換するようにした。新しい言語を追加する際は
  `CONTRIBUTING.md`の「多言語対応(i18n)について」を参照。
- **About欄の追加**: オプションページ下部に About セクションを新設。
  GitHubリポジトリ・Issues・Pull RequestsへのリンクとXアカウント
  (`https://x.com/akichika`)、`© 2026 akichika`のコピーライト表示。
  ポップアップにも簡易的な著作権+Xリンクを追加。i18nキーは
  `aboutHeading`/`aboutGithubDesc`のみ(GitHub/Issues/X等の固有名詞は
  訳さずそのまま表示する方針)。
- **説明文の簡略化**: `appDesc`を「Claude / ChatGPT / Geminiで生成された
  コードを p5.js Web Editor 等へ簡単転送。バイブコーディングなどの用途に。」
  に統一(各言語で同趣旨に翻訳)。manifest.jsonの`description`文字数上限
  (132字)を全10言語で確認済み。
- **Edge対応**: Manifest V3・`chrome.*`名前空間はEdge(Chromium系)でも
  そのまま動作するため、コード変更は不要だった。`manifest.json`の
  `options_page`をMV3標準の`options_ui`(`open_in_tab: true`)に変更した
  のみ。README/store-listing.mdにEdgeでのインストール手順と
  Microsoft Edge Add-onsへの提出手順を追記。
