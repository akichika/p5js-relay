// p5.js Relay - 共通: テーマ適用とi18nテキスト差し込み (options / popup)
// i18n.js を先に読み込むこと。

(async () => {
  const { theme = "system" } = await chrome.storage.sync.get("theme");
  applyTheme(theme);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.theme) applyTheme(changes.theme.newValue);
    if (changes.lang) P5R_I18N.load().then(fillI18n);
  });
  function applyTheme(t) {
    if (t === "light" || t === "dark") {
      document.documentElement.dataset.theme = t;
    } else {
      delete document.documentElement.dataset.theme; // system: メディアクエリに委ねる
    }
  }
})();

function fillI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const msg = P5R_I18N.t(el.dataset.i18n);
    if (msg) el.textContent = msg;
  });
}

// 各ページのスクリプトが await できるように公開
const P5R_PAGE_READY = P5R_I18N.load().then(() => {
  if (document.readyState === "loading") {
    return new Promise((r) =>
      document.addEventListener("DOMContentLoaded", () => r())
    );
  }
}).then(fillI18n);
