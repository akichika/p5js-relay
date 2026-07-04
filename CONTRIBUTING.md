# Contributing / 開発ガイド

このプロジェクトは GitHub (https://github.com/akichika/p5js-relay) で管理しています。
Issue報告・機能要望・Pull Requestは以下からお願いします。

- Issues: https://github.com/akichika/p5js-relay/issues
- Pull Requests: https://github.com/akichika/p5js-relay/pulls

## セットアップ

1. このリポジトリをクローン
2. `chrome://extensions`（Edgeの場合は `edge://extensions`）→ デベロッパーモードON
   → 「パッケージ化されていない拡張機能を読み込む」（Edgeは「展開して読み込み」）
   → このフォルダ（`manifest.json`のある階層）を選択
3. コードを変更したら拡張機能一覧の更新ボタンを押し、
   **対象タブ（AIチャット側・送信先エディタ側の両方）を必ずリロード**する
   （拡張の更新はcontent scriptを再注入しないため、開きっぱなしのタブは
   古いコードのまま動き続けます）

## アーキテクチャを把握する

まず `HANDOFF.md` を読んでください。特に以下は変更前に必ず確認:

- **background.js の送信先ルール(rule)スキーマ**と `splitCode()` の分割ロジック
- **content/source.js のボタン重複防止機構**(`LIVE` / `WRAP_HOST` /
  `globalCleanup`) — ここを変更する場合は、ChatGPT / Claude / Gemini の
  3サイトで数分間放置しても転送ボタンが複数化しないことを必ず確認してください
  （過去に複数回、この確認不足で再発しています）

## デバッグ

- ログはすべて `console.info("[p5.js Relay]", ...)` 形式です
  （`console.warn`はChromeの拡張機能エラー一覧に載るため意図的に避けています）
- 送信先ページ（p5.js Editor等）側のログは、そのタブのDevTools Consoleに出ます
  （`background.js`のMAINワールド実行コードが対象ページの文脈で動くため）
- 拡張機能自体のエラーは `chrome://extensions`（Edgeは `edge://extensions`）の
  対象拡張 →「エラー」から確認できます

## メッセージ（i18n）の追加・変更

対応言語は英語・日本語・中国語（簡体字/繁体字）・韓国語・スペイン語・
フランス語・ドイツ語・ポルトガル語（ブラジル）・ロシア語の10言語です
（`_locales/en, ja, zh_CN, zh_TW, ko, es, fr, de, pt_BR, ru`）。
新しいキーを追加・変更する場合は**この10ファイルすべて**を更新してください。
`content/source.js` 等はランタイムi18n（`i18n.js`が`fetch()`で読み込む）を
使っているため、`chrome.i18n.getMessage`だけを書き換えても反映されません。

新しい言語を追加する場合は、以下をあわせて更新してください:

- `i18n.js` の `FOLDERS` マップ（コード → `_locales`フォルダ名）
- `options.html` の言語セレクタ（`<select id="lang">` に `<option>` を追加）
- 全メッセージファイルへの `lang*`（言語名表示用）キーの追記

## リリース手順

1. `manifest.json` の `version` を上げる
2. `CHANGELOG.md` に変更点を追記
3. ストア（Chrome Web Store / Microsoft Edge Add-ons 共通）アップロード用に
   zip化（`manifest.json`がzip直下）:
   ```
   zip -r p5js-relay-store-vX.Y.Z.zip manifest.json background.js i18n.js \
     theme.js options.html options.js popup.html popup.js content _locales icons \
     -x "icons/icon.svg"
   ```
   （`icons/icon.svg`はアイコン生成元のソースなのでストア提出物には含めなくてよい）
4. `store-submission/store-listing.md` の公開手順チェックリストに従って提出
   （Chrome Web Store・Microsoft Edge Add-onsの両方に同じzipを提出可能）

## Issueを立てる際のお願い

UIの不具合報告は、**可能であればスクリーンショット**を添えてください。
このプロジェクトは対象サイト（ChatGPT/Claude/Gemini/各エディタ）のDOM構造に
依存する部分が多く、実サイトへの継続的なアクセスができない開発環境では
スクリーンショットが最も確実な手がかりになります。使用ブラウザ（Chrome /
Edge）とバージョンもあわせて記載いただけると助かります。
