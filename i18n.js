// p5.js Relay - ランタイム言語切替対応のi18n
// chrome.i18n.getMessage は実行時に言語を切り替えられないため、
// _locales/*/messages.json を自前で読み込む。
// 設定 lang: "system"(既定・ブラウザ言語に追従) | 対応言語コード
// システム言語が非対応の場合は英語にフォールバックする。

const P5R_I18N = (() => {
  // コード(storageに保存する値・UI言語判定用) -> _locales以下のフォルダ名
  const FOLDERS = {
    en: "en",
    ja: "ja",
    "zh-cn": "zh_CN",
    "zh-tw": "zh_TW",
    ko: "ko",
    es: "es",
    fr: "fr",
    de: "de",
    "pt-br": "pt_BR",
    ru: "ru"
  };
  const SUPPORTED = Object.keys(FOLDERS);
  let dict = {};
  let current = "en";

  // ブラウザのUI言語(例: "zh-CN", "pt-BR", "en-US")を対応コードへ変換
  function detectFromUI(ui) {
    const low = (ui || "en").toLowerCase();
    if (low.startsWith("zh")) {
      return /tw|hk|hant|mo/.test(low) ? "zh-tw" : "zh-cn";
    }
    if (low.startsWith("pt")) return "pt-br"; // ポルトガル語はブラジル表記のみ提供
    const primary = low.split("-")[0];
    return SUPPORTED.includes(primary) ? primary : null;
  }

  async function load() {
    let lang = "system";
    try {
      const saved = await chrome.storage.sync.get("lang");
      lang = saved.lang || "system";
    } catch (e) {}
    let code = lang;
    if (code === "system" || !SUPPORTED.includes(code)) {
      code = detectFromUI(chrome.i18n.getUILanguage()) || "en";
    }
    const folder = FOLDERS[code] || "en";
    const res = await fetch(chrome.runtime.getURL(`_locales/${folder}/messages.json`));
    dict = await res.json();
    current = code;
    return code;
  }

  function t(key, subs) {
    const entry = dict[key];
    if (!entry) return key;
    let msg = entry.message;
    if (entry.placeholders) {
      const arr = subs == null ? [] : Array.isArray(subs) ? subs : [subs];
      for (const [name, def] of Object.entries(entry.placeholders)) {
        const idx = parseInt(String(def.content).replace("$", ""), 10) - 1;
        msg = msg.replace(
          new RegExp("\\$" + name + "\\$", "gi"),
          arr[idx] != null ? String(arr[idx]) : ""
        );
      }
    }
    return msg;
  }

  return {
    load,
    t,
    get dict() { return dict; },
    get lang() { return current; },
    get supported() { return SUPPORTED.slice(); }
  };
})();
