# Privacy Policy / プライバシーポリシー — p5.js Relay

**Last updated: 2026-07-04**

Applies to both the Chrome Web Store and Microsoft Edge Add-ons builds of p5.js Relay.
Chrome / Microsoft Edge 版どちらの p5.js Relay にも共通して適用されます。

## English

p5.js Relay does not collect, transmit, or sell any personal data.

- **No remote servers.** All processing (code extraction, splitting, and pasting) happens locally in your browser. The extension makes no network requests to any external service.
- **What is stored, and where.** Destination settings (URL patterns, editor types, selectors), theme, language preference, and the most recently transferred code snippet are stored using the browser's `storage.sync` / `storage.local` APIs (Chrome or Microsoft Edge). This data stays within your browser profile sync and is never sent to the developer or any third party.
- **Clipboard.** When you press the Apply button, the code is also copied to your clipboard as a manual-paste fallback. The extension only writes to the clipboard; it never reads it.
- **Permissions.** `tabs`/`scripting` are used solely to find or open your registered destination editor tab and insert the code you explicitly chose to transfer. Host access is required because destinations are user-defined (any editor site you register).
- **No analytics, no ads, no tracking.**

## 日本語

p5.js Relay は個人情報を収集・送信・販売しません。

- **外部サーバーなし。** コードの抽出・分割・貼り付けはすべてブラウザ内で完結し、外部サービスへの通信は一切行いません。
- **保存されるデータと保存先。** 送信先設定（URLパターン、エディタ種別、セレクタ）、テーマ、言語設定、直近に転送したコードは、ブラウザ（Chrome / Microsoft Edge）の `storage.sync` / `storage.local` に保存されます。これらは利用者のブラウザプロファイル同期の範囲に留まり、開発者や第三者に送信されることはありません。
- **クリップボード。** 反映ボタン押下時に、手動貼り付け用のフォールバックとしてコードをクリップボードへコピーします（書き込みのみで、読み取りは行いません）。
- **権限。** `tabs`/`scripting` は、登録済み送信先タブの検索・オープンと、利用者が明示的に転送したコードの挿入のためだけに使用します。送信先は利用者が自由に登録できるため、ホストアクセス権限が必要です。
- **解析・広告・トラッキングは一切ありません。**

## お問い合わせ / Contact

- GitHub: https://github.com/akichika/p5js-relay
- X: https://x.com/akichika
