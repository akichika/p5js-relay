// p5.js Relay - background service worker
// - コード受信 → 分割(splitMode: off/tabs/panels) → 送信先へMAINワールド反映
// - 送信先タブのアクティブ化/読み込みを監視して「既定の送信先」を自動追従
importScripts("i18n.js");

const t = (key, subs) => P5R_I18N.t(key, subs);
let i18nReady = P5R_I18N.load();

const DEFAULT_RULES = [
  {
    id: "p5js",
    name: "p5.js Web Editor",
    urlPattern: "https://editor.p5js.org/*",
    openUrl: "https://editor.p5js.org/",
    editor: "auto",
    selector: "",
    initDelay: 2000,
    splitMode: "tabs",
    htmlMode: "merge",
    fileMap: { js: "sketch.js", html: "index.html", css: "style.css" },
    enabled: true
  },
  {
    id: "openprocessing",
    name: "OpenProcessing",
    urlPattern: "https://openprocessing.org/sketch/*",
    openUrl: "https://openprocessing.org/sketch/create",
    editor: "auto",
    selector: "",
    initDelay: 2500,
    splitMode: "tabs",
    htmlMode: "merge",
    htmlModeNotice: true,
    fileMap: { js: "mySketch.js", html: "index.html", css: "style.css" },
    enabled: true
  },
  {
    id: "codepen",
    name: "CodePen",
    urlPattern: "https://codepen.io/*",
    openUrl: "https://codepen.io/pen/",
    editor: "auto",
    selector: "#box-js",
    initDelay: 2500,
    splitMode: "panels",
    panelMap: { html: "#box-html", css: "#box-css", js: "#box-js" },
    enabled: true
  }
];

chrome.runtime.onInstalled.addListener(async () => {
  await i18nReady;
  const { rules } = await chrome.storage.sync.get("rules");
  if (!rules || !rules.length) {
    await chrome.storage.sync.set({
      rules: DEFAULT_RULES,
      defaultRuleId: "p5js",
      clearBefore: true,
      theme: "system",
      lang: "system"
    });
  } else {
    // 既存ルールの移行
    let changed = false;
    // JSFiddleは対応終了(貼り付け先として不安定なため)
    const jf = rules.findIndex((r) => r.id === "jsfiddle");
    if (jf >= 0) {
      rules.splice(jf, 1);
      changed = true;
    }
    for (const r of rules) {
      // OpenProcessing: HTML/CSS/JSモード対応の設定に更新
      if (r.id === "openprocessing") {
        if (!r.htmlModeNotice || r.modeButton || r.prepareClick ||
            !r.fileMap || r.fileMap.js !== "mySketch.js") {
          r.splitMode = "tabs";
          r.htmlMode = "merge";
          r.fileMap = { js: "mySketch.js", html: "index.html", css: "style.css" };
          r.htmlModeNotice = true;
          delete r.modeButton;
          delete r.prepareClick;
          changed = true;
        }
      }
      if (
        (r.id === "p5js" || r.id === "openprocessing") &&
        r.editor === "codemirror5" &&
        (!r.selector || r.selector === ".CodeMirror")
      ) {
        r.editor = "auto";
        r.selector = "";
        changed = true;
      }
      if (r.id === "p5js" && r.htmlMode === undefined) {
        r.htmlMode = "merge";
        changed = true;
      }
      if (r.splitMode === undefined) {
        const preset = DEFAULT_RULES.find((d) => d.id === r.id);
        if (r.multiFile) {
          r.splitMode = "tabs";
          if (!r.fileMap && preset) r.fileMap = preset.fileMap;
        } else if (preset && preset.splitMode) {
          r.splitMode = preset.splitMode;
          if (preset.fileMap && !r.fileMap) r.fileMap = preset.fileMap;
          if (preset.panelMap && !r.panelMap) r.panelMap = preset.panelMap;
          if (preset.editor === "auto") { r.editor = "auto"; r.selector = preset.selector; }
        } else {
          r.splitMode = "off";
        }
        delete r.multiFile;
        changed = true;
      }
    }
    if (changed) await chrome.storage.sync.set({ rules });
    const cur = await chrome.storage.sync.get(["theme", "lang"]);
    const patch = {};
    if (!cur.theme) patch.theme = "system";
    if (!cur.lang) patch.lang = "system";
    if (Object.keys(patch).length) await chrome.storage.sync.set(patch);
  }
  await rebuildContextMenu();
});

async function rebuildContextMenu() {
  await i18nReady;
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "coderelay-send-selection",
      title: t("ctxSend"),
      contexts: ["selection"]
    });
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.lang) {
    i18nReady = P5R_I18N.load().then(() => rebuildContextMenu());
  }
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === "coderelay-send-selection" && info.selectionText) {
    try {
      await handleSend(info.selectionText, null);
    } catch (e) {
      console.error("[p5.js Relay]", e);
    }
  }
});

// ---- 既定の送信先の自動追従 ----
// 登録済み送信先のタブがアクティブ化/読み込み完了したら、その送信先を既定にする。
function patternToRegex(pattern) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("^" + pattern.split("*").map(esc).join(".*") + "$");
}

async function maybeFollowDefault(url) {
  if (!url || !/^https?:/.test(url)) return;
  const { rules = [], defaultRuleId } = await chrome.storage.sync.get([
    "rules",
    "defaultRuleId"
  ]);
  for (const r of rules) {
    if (r.enabled === false || !r.urlPattern) continue;
    try {
      if (patternToRegex(r.urlPattern).test(url)) {
        if (defaultRuleId !== r.id) {
          await chrome.storage.sync.set({ defaultRuleId: r.id });
        }
        return;
      }
    } catch (e) {}
  }
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    maybeFollowDefault(tab.url);
  } catch (e) {}
});
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete") maybeFollowDefault(tab.url);
});

// ---- メッセージ ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SEND_CODE") {
    handleSend(msg.code, msg.ruleId)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  if (msg.type === "SEND_CANVAS") {
    extractFromTab(sender.tab.id)
      .then((code) => {
        if (!code || !code.trim()) throw new Error(t("errCanvasExtract"));
        return handleSend(code, msg.ruleId);
      })
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  if (msg.type === "GET_STATE") {
    chrome.storage.sync
      .get(["rules", "defaultRuleId", "clearBefore", "theme", "lang"])
      .then(async (sync) => {
        const local = await chrome.storage.local.get([
          "lastCode",
          "lastAt",
          "lastResult"
        ]);
        sendResponse({ ...sync, ...local });
      });
    return true;
  }
  if (msg.type === "GET_I18N") {
    i18nReady.then(() =>
      sendResponse({ dict: P5R_I18N.dict, lang: P5R_I18N.lang })
    );
    return true;
  }
});

async function handleSend(code, ruleId) {
  await i18nReady;
  const { rules = [], defaultRuleId, clearBefore = true } =
    await chrome.storage.sync.get(["rules", "defaultRuleId", "clearBefore"]);

  const enabled = rules.filter((r) => r.enabled !== false);
  const rule =
    enabled.find((r) => r.id === ruleId) ||
    enabled.find((r) => r.id === defaultRuleId) ||
    enabled[0];
  if (!rule) throw new Error(t("errNoRule"));

  await chrome.storage.local.set({ lastCode: code, lastAt: Date.now() });

  const mode = rule.splitMode || "off";
  let payload;
  if (mode === "off") {
    payload = { raw: code };
  } else {
    const parts = splitCode(code);
    payload = {};
    if (parts.css) payload.css = parts.css;
    if (parts.js) payload.js = parts.js;
    if (mode === "panels") {
      // CodePen等: HTMLパネルには「ライブラリ<script src> + <body>内容」を入れる
      // (p5等のライブラリはHTMLパネル先頭のscriptタグとして読み込ませる)
      const pieces = [...(parts.cssLinks || []), ...(parts.libs || [])];
      if (parts.body) pieces.push(parts.body);
      const panelHtml = pieces.join("\n").trim();
      if (panelHtml) payload.html = panelHtml;
      else if (payload.js && parts.libs && parts.libs.length) {
        payload.html = parts.libs.join("\n");
      }
      // 生成コードがJSのみ(HTML/CSSを含まない)場合でも、実行に必要な
      // デフォルトのHTML(p5.js CDN読込)とCSSを外挿して必ず3パネル転送する
      if (!payload.html && payload.js) {
        const defLibs = [];
        if (/\b(setup|draw)\s*\(/.test(payload.js)) {
          defLibs.push(
            '<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js"></script>'
          );
          if (/\b(loadSound|p5\.SoundFile|userStartAudio|getAudioContext)\b/.test(payload.js)) {
            defLibs.push(
              '<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/addons/p5.sound.min.js"></script>'
            );
          }
        }
        if (defLibs.length) payload.html = defLibs.join("\n");
      }
      if (!payload.css && (payload.js || payload.html)) {
        payload.css = "html, body {\n  margin: 0;\n  padding: 0;\n}\ncanvas {\n  display: block;\n}";
      }
    } else if (rule.htmlMode === "merge") {
      // p5.js Web Editor: index.htmlは置き換えず、既存内容に
      // 不足しているライブラリタグだけを差し込む(エディタ標準のp5読込を壊さない)
      const inject = [...(parts.cssLinks || []), ...(parts.extraLibs || [])];
      if (inject.length) {
        payload.mergeLibs = inject;
        // merge経路が失敗した場合の保険: index.htmlを丸ごと置き換える完全HTML
        if (parts.full) payload.fallbackHtml = parts.full;
      }
    } else if (parts.full) {
      payload.html = parts.full;
    }
    if (!payload.css && !payload.js && !payload.html && !payload.mergeLibs) {
      payload = { raw: code }; // 分割できなければそのまま
    }
  }

  let tabs = await chrome.tabs.query({ url: rule.urlPattern });
  let tab = tabs[0];
  let created = false;
  if (!tab) {
    tab = await chrome.tabs.create({
      url: rule.openUrl || rule.urlPattern.replace(/\*.*$/, "")
    });
    created = true;
    await waitForTabLoad(tab.id);
  } else {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  }

  if (created && rule.initDelay) await sleep(rule.initDelay);

  const messages = {
    editorNotFound: t("errEditorNotFound", [
      rule.editor,
      rule.selector || "(default)"
    ]),
    modeNotice: t("opModeNotice")
  };

  const [res] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: applyCodeInPage,
    args: [payload, rule, clearBefore, messages]
  });

  const result = res?.result || { ok: false, error: t("errInject") };
  await chrome.storage.local.set({
    lastResult: { ...result, ruleName: rule.name, at: Date.now() }
  });
  return result;
}

function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15000);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function extractFromTab(tabId) {
  // claude.aiのArtifactは、プレビューだけでなくコード表示も
  // a.claude.ai等の別オリジンiframe内でレンダリングされる(2026年時点)。
  // メインフレームだけを見ても何も取れないため、allFrames:trueで
  // 全フレーム(クロスオリジンiframe含む)を対象に実行し、最も長い
  // 結果を採用する。host_permissions:<all_urls>によりiframeの
  // オリジンを問わず注入できる。
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    world: "MAIN",
    func: extractCanvasCodeInPage
  });
  let best = "";
  for (const r of results) {
    const val = r && r.result;
    if (typeof val === "string" && val.length > best.length) best = val;
  }
  return best;
}

// ---- コード分割 (SWにはDOMParserが無いため正規表現ベース) ----
// 戻り値: { full, body, css, js, libs, extraLibs, cssLinks }
//   full      : 分割後の完全なHTML (index.htmlをまるごと置き換える場合用)
//   body      : <body>内のみ (CodePen/JSFiddle等のHTMLパネル用)
//   libs      : 外部<script src>タグ全部 (p5含む・重複除去)
//   extraLibs : p5.js標準(p5/p5.sound)以外の外部ライブラリタグ
//   cssLinks  : 外部スタイルシート<link>タグ (Googleフォント等)
function splitCode(code) {
  function dedent(s) {
    const lines = s.replace(/^\n+|\s+$/g, "").split("\n");
    let min = Infinity;
    for (const l of lines) {
      if (!l.trim()) continue;
      const n = l.match(/^[ \t]*/)[0].length;
      if (n < min) min = n;
    }
    if (!isFinite(min) || min === 0) return lines.join("\n");
    return lines.map((l) => l.slice(min)).join("\n");
  }

  const src = code.replace(/\r\n/g, "\n");
  const looksHtml =
    /<!doctype\s+html/i.test(src) ||
    /<html[\s>]/i.test(src) ||
    (/<\/script>/i.test(src) && /<(head|body)[\s>]/i.test(src));

  if (!looksHtml) {
    const hasJsTokens =
      /\b(function|const|let|var|return|=>|setup\s*\(|draw\s*\()/i.test(src);
    const looksCss =
      !hasJsTokens && /[.#a-zA-Z\*\[][^{}]*\{[^{}]*:[^{}]*\}/.test(src);
    if (looksCss) return { css: src };
    return { js: src };
  }

  let html = src;
  let css = "";
  let js = "";

  // 外部ライブラリ<script src>を収集 (タグはHTML側にも残す)
  const libs = [];
  const seenSrc = new Set();
  const isP5Core = (u) => /\bp5(\.min|\.sound(\.min)?)?\.js\b/i.test(u);
  html.replace(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi,
    (tag, url) => {
      if (/^https?:|^\/\//i.test(url) && !seenSrc.has(url)) {
        seenSrc.add(url);
        libs.push({ tag: tag.trim(), url });
      }
      return tag;
    });
  // 外部スタイルシート<link>を収集
  const cssLinks = [];
  html.replace(/<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*>/gi, (tag) => {
    const m = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (m && /^https?:|^\/\//i.test(m[1])) cssLinks.push({ tag: tag.trim(), url: m[1] });
    return tag;
  });

  html = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (m, body) => {
    if (body.trim()) css += (css ? "\n\n" : "") + dedent(body) + "\n";
    return "%%P5R_STYLE%%";
  });

  html = html.replace(
    /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi,
    (m, body) => {
      if (!body.trim()) return "";
      js += (js ? "\n\n" : "") + dedent(body) + "\n";
      return "%%P5R_SCRIPT%%";
    }
  );

  let styleDone = false;
  html = html.replace(/[ \t]*%%P5R_STYLE%%\n?/g, () =>
    styleDone ? "" : ((styleDone = true), '<link rel="stylesheet" href="style.css">\n')
  );
  let scriptDone = false;
  html = html.replace(/[ \t]*%%P5R_SCRIPT%%\n?/g, () =>
    scriptDone ? "" : ((scriptDone = true), '<script src="sketch.js"></script>\n')
  );

  if (css && !styleDone && /<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, '  <link rel="stylesheet" href="style.css">\n</head>');
  }
  if (js && !scriptDone && /<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, '  <script src="sketch.js"></script>\n</body>');
  }

  // JSがp5スケッチなのにp5読込が無ければCDNを補完
  const P5_CDN =
    "https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js";
  if (js && /\b(setup|draw)\s*\(/.test(js) && !libs.some((l) => isP5Core(l.url))) {
    const tag = `<script src="${P5_CDN}"></script>`;
    libs.unshift({ tag, url: P5_CDN });
    if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, "  " + tag + "\n</head>");
  }

  html = html.replace(/\n{3,}/g, "\n\n").trim() + "\n";

  // <body>内のみ抽出 (パネル型エディタ用)。style.css/sketch.js参照タグは除去。
  let body = "";
  const bm = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bm) {
    body = bm[1]
      .replace(/[ \t]*<link[^>]*href\s*=\s*["']style\.css["'][^>]*>\n?/gi, "")
      .replace(/[ \t]*<script[^>]*src\s*=\s*["']sketch\.js["'][^>]*>\s*<\/script>\n?/gi, "")
      .replace(/[ \t]*<script\b[^>]*\bsrc\s*=[^>]*>\s*<\/script>\n?/gi, "") // 外部libはlibsで別管理
      .replace(/\n{3,}/g, "\n\n");
    body = dedent(body).trim();
  }

  const out = {
    full: html,
    body,
    libs: libs.map((l) => l.tag),
    extraLibs: libs.filter((l) => !isP5Core(l.url)).map((l) => l.tag),
    cssLinks: cssLinks.map((l) => l.tag)
  };
  if (css.trim()) out.css = css;
  if (js.trim()) out.js = js;
  return out;
}

// ---- MAINワールド: Canvas/Artifact等のエディタから全文を抽出 ----
// Claudeのアーティファクトはプレビュー表示だとコードがDOMに無いため、
// コード表示トグルのクリックを試みてから再抽出する。
async function extractCanvasCodeInPage() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function deepQueryAll(selector, root = document, acc = []) {
    if (root.querySelectorAll) {
      root.querySelectorAll(selector).forEach((el) => acc.push(el));
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) deepQueryAll(selector, el.shadowRoot, acc);
      }
    }
    return acc;
  }

  function collect() {
    const candidates = [];
    for (const el of deepQueryAll(".cm-content")) {
      const view = el.cmView && el.cmView.view;
      if (view) candidates.push(view.state.doc.toString());
    }
    if (window.monaco && window.monaco.editor) {
      for (const model of window.monaco.editor.getModels()) {
        candidates.push(model.getValue());
      }
    }
    for (const el of deepQueryAll(".CodeMirror")) {
      if (el.CodeMirror) candidates.push(el.CodeMirror.getValue());
    }
    for (const el of deepQueryAll("pre code, pre")) {
      const txt = el.innerText;
      if (txt && txt.trim().length > 20) candidates.push(txt);
    }
    if (!candidates.length) return "";
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0].replace(/\u00a0/g, " ");
  }

  let best = collect();
  if (best.length >= 40) return best;

  // コードがDOMに無い(プレビュー表示等) → コード表示トグルを探してクリック
  const togglePat = /code|コード|source|ソース/i;
  const buttons = deepQueryAll("button, [role='tab'], [role='button']");
  for (const b of buttons) {
    const label =
      (b.getAttribute("aria-label") || "") +
      " " +
      (b.getAttribute("title") || "") +
      " " +
      (b.getAttribute("data-testid") || "");
    if (!togglePat.test(label)) continue;
    const rect = b.getBoundingClientRect();
    if (rect.width === 0 || rect.width > 120) continue;
    try {
      b.click();
    } catch (e) {}
    await sleep(800);
    const again = collect();
    if (again.length > best.length) best = again;
    if (best.length >= 40) break;
  }
  return best;
}

// ---- MAINワールド: コードをエディタへ反映 ----
// parts: {raw} または {html, css, js}
// splitMode "tabs": ファイルタブをクリックで切替 / "panels": ロールごとのセレクタに反映
async function applyCodeInPage(parts, rule, clearBefore, messages) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => { try { console.info("[p5.js Relay]", ...a); } catch (e) {} };

  function deepQuery(selector, root = document) {
    if (!root.querySelectorAll) return null;
    const direct = root.querySelector(selector);
    if (direct) return direct;
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) {
        const found = deepQuery(selector, el.shadowRoot);
        if (found) return found;
      }
    }
    return null;
  }

  function deepAll(selector, root = document, acc = []) {
    if (root.querySelectorAll) {
      root.querySelectorAll(selector).forEach((el) => acc.push(el));
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) deepAll(selector, el.shadowRoot, acc);
      }
    }
    return acc;
  }

  function fireInput(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // 各エディタ実装。selはスコープ用セレクタ(空なら既定)。
  const methods = {
    codemirror5(sel, code) {
      let el = deepQuery(sel || ".CodeMirror");
      if (el && !el.CodeMirror) el = el.querySelector(".CodeMirror") || el;
      if (!el || !el.CodeMirror) return null;
      const cm = el.CodeMirror;
      if (clearBefore) cm.setValue(code);
      else cm.replaceRange("\n" + code, { line: cm.lastLine() + 1, ch: 0 });
      cm.focus();
      return { ok: true, method: "CodeMirror5" };
    },
    codemirror6(sel, code) {
      let el = deepQuery(sel || ".cm-content");
      if (el && !(el.cmView && el.cmView.view)) {
        el = el.querySelector(".cm-content") || el;
      }
      const view = el && el.cmView && el.cmView.view;
      if (!view) return null;
      const from = clearBefore ? 0 : view.state.doc.length;
      const to = view.state.doc.length;
      view.dispatch({
        changes: { from, to, insert: clearBefore ? code : "\n" + code }
      });
      view.focus();
      return { ok: true, method: "CodeMirror6" };
    },
    monaco(sel, code) {
      if (!window.monaco || !window.monaco.editor) return null;
      const models = window.monaco.editor.getModels();
      if (!models.length) return null;
      if (clearBefore) models[0].setValue(code);
      else models[0].setValue(models[0].getValue() + "\n" + code);
      return { ok: true, method: "Monaco" };
    },
    ace(sel, code) {
      const el = deepQuery(sel || ".ace_editor");
      if (!el || !window.ace) return null;
      const target = el.classList.contains("ace_editor")
        ? el
        : el.querySelector(".ace_editor") || el;
      const editor = window.ace.edit(target);
      if (clearBefore) editor.setValue(code, -1);
      else
        editor.session.insert(
          { row: editor.session.getLength(), column: 0 },
          "\n" + code
        );
      editor.focus();
      return { ok: true, method: "Ace" };
    },
    textarea(sel, code) {
      let el = deepQuery(sel || "textarea");
      if (el && el.tagName !== "TEXTAREA") el = el.querySelector("textarea") || el;
      if (!el || el.tagName !== "TEXTAREA") return null;
      el.value = clearBefore ? code : el.value + "\n" + code;
      fireInput(el);
      el.focus();
      return { ok: true, method: "textarea" };
    },
    contenteditable(sel, code) {
      let el = deepQuery(sel || "[contenteditable=true]");
      if (el && el.getAttribute && el.getAttribute("contenteditable") !== "true") {
        el = el.querySelector("[contenteditable=true]") || el;
      }
      if (!el) return null;
      el.focus();
      if (clearBefore) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(range);
      }
      document.execCommand("insertText", false, code);
      return { ok: true, method: "contenteditable" };
    }
  };

  const AUTO_ORDER = [
    "codemirror5",
    "codemirror6",
    "monaco",
    "ace",
    "textarea",
    "contenteditable"
  ];
  // panelsモードではセレクタ内に限定するためグローバル前提のmonacoを除外
  const SCOPED_ORDER = ["codemirror5", "codemirror6", "ace", "textarea", "contenteditable"];

  function tryApply(code, elapsed, selOverride) {
    if (selOverride !== undefined) {
      for (const n of SCOPED_ORDER) {
        const r = methods[n](selOverride, code);
        if (r) return r;
      }
      return null;
    }
    if (rule.editor === "auto") {
      for (const n of AUTO_ORDER) {
        const r = methods[n](rule.selector, code) || methods[n]("", code);
        if (r) return r;
      }
      return null;
    }
    const fn = methods[rule.editor];
    if (!fn) return { ok: false, error: "unknown editor: " + rule.editor };
    let res = fn(rule.selector, code);
    if (!res && elapsed > 5000) {
      for (const n of AUTO_ORDER) {
        res = methods[n]("", code);
        if (res) {
          res.method += " (auto fallback)";
          break;
        }
      }
    }
    return res;
  }

  async function applyWithRetry(code, timeout, selOverride) {
    const start = Date.now();
    for (;;) {
      const elapsed = Date.now() - start;
      const res = tryApply(code, elapsed, selOverride);
      if (res) return res;
      if (elapsed > timeout) return null;
      await sleep(400);
    }
  }

  function locateFileTab(name) {
    const lower = name.toLowerCase();
    const els = deepAll("a, button, span, div, li, [role='tab']");
    let best = null;
    let hiddenBest = null;
    for (const el of els) {
      const txt = (el.textContent || "").trim().toLowerCase();
      if (txt !== lower) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width > 300) continue;
      if (rect.width === 0 || rect.height === 0) {
        // サイドバーが閉じている等で非表示。クリックイベント自体は届くので候補として保持
        if (!hiddenBest) hiddenBest = el;
        continue;
      }
      if (!best || rect.width * rect.height < best.r) {
        best = { el, r: rect.width * rect.height };
      }
    }
    // 可視要素を優先、無ければ非表示要素(React等はハンドラが発火する)
    return best ? best.el : hiddenBest;
  }

  async function clickFileTab(name) {
    const el = locateFileTab(name);
    if (!el) return false;
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      el.dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true, view: window })
      );
    }
    await sleep(600);
    return true;
  }

  // 現在アクティブなエディタの内容を読み取る(mergeLibs用)
  function readCurrent() {
    let el = deepQuery(".CodeMirror");
    if (el && el.CodeMirror) return el.CodeMirror.getValue();
    el = deepQuery(".cm-content");
    if (el && el.cmView && el.cmView.view) return el.cmView.view.state.doc.toString();
    if (window.monaco && window.monaco.editor) {
      const m = window.monaco.editor.getModels();
      if (m.length) return m[0].getValue();
    }
    el = deepQuery(".ace_editor");
    if (el && window.ace) return window.ace.edit(el).getValue();
    el = deepQuery("textarea");
    if (el) return el.value;
    return null;
  }

  // ---- 反映本体 ----
  if (parts.raw !== undefined) {
    const res = await applyWithRetry(parts.raw, 12000);
    return res || { ok: false, error: messages.editorNotFound };
  }

  const applied = [];
  const warnings = [];
  let lastMethod = "";
  let firstTimeout = 12000;
  const mode = rule.splitMode || "tabs";

  if (mode === "panels") {
    // CodePen / JSFiddle等: ロールごとのパネルセレクタへ反映
    const order = ["html", "css", "js"].filter((role) => parts[role]);
    const panelMap = rule.panelMap || {};
    for (const role of order) {
      const sel = panelMap[role];
      let res = null;
      if (sel) {
        res = await applyWithRetry(parts[role], firstTimeout, sel);
      } else if (role === "js") {
        res = await applyWithRetry(parts[role], firstTimeout);
      }
      firstTimeout = 6000;
      if (res) {
        applied.push(role);
        lastMethod = res.method;
      } else {
        warnings.push("apply failed: " + role);
      }
    }
  } else {
    // tabsモード: p5.js / OpenProcessing等のファイルタブをクリックで切替
    const fileMap = rule.fileMap || {
      js: "sketch.js",
      html: "index.html",
      css: "style.css"
    };

    // OpenProcessing等: 複数ファイル転送時はエディタのモード切替ボタン
    // (例: "HTML/CSS/JS")を先にクリックして3ファイル構成にする。
    // JSのみの転送ならモードは変更しない。
    // OpenProcessing等: index.htmlタブが無い(=HTML/CSS/JSモードでない)状態で
    // ライブラリ追加が必要な場合は、モード自動切替はせず案内ダイアログを表示する。
    // (モード切替UIは設定パネル内にあり自動操作が不安定なため、手動切替を案内)
    if (
      rule.htmlModeNotice &&
      parts.mergeLibs &&
      parts.mergeLibs.length &&
      !locateFileTab(fileMap.html || "index.html")
    ) {
      log("htmlModeNotice: not in HTML/CSS/JS mode -> showing dialog");
      try {
        alert(messages.modeNotice);
      } catch (e) {}
      warnings.push("HTML/CSS/JS mode required for libraries");
      delete parts.mergeLibs;
      delete parts.fallbackHtml;
    }

    // index.htmlへのライブラリ差し込み(mergeモード):
    // 既存のindex.htmlを読み取り、不足している外部ライブラリタグだけを</head>直前に挿入。
    // エディタ標準のp5.js読込やHTML構造は壊さない。
    if (parts.mergeLibs && parts.mergeLibs.length) {
      const tabName = fileMap.html || "index.html";
      log("merge: switching to", tabName);
      const switched = await clickFileTab(tabName);
      log("merge: tab click", switched ? "ok" : "NOT FOUND");
      let mergeDone = false;
      if (switched) {
        // タブ切替直後はエディタの内容差し替えが非同期のためリトライして読む
        let current = null;
        for (let i = 0; i < 16 && current == null; i++) {
          await sleep(300);
          current = readCurrent();
        }
        log("merge: read", current == null ? "FAILED" : current.length + " chars");
        if (current != null) {
          const urlOf = (tag) => {
            const m = tag.match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/i);
            return m ? m[1] : null;
          };
          const missing = parts.mergeLibs.filter((tag) => {
            const u = urlOf(tag);
            return u && !current.includes(u);
          });
          log("merge: libs missing =", missing.length, "of", parts.mergeLibs.length);
          if (missing.length) {
            let merged;
            const inject = missing.map((s) => "    " + s).join("\n") + "\n";
            if (/<\/head>/i.test(current)) {
              merged = current.replace(/<\/head>/i, inject + "  </head>");
            } else {
              merged = inject + current;
            }
            // mergeは常に全置換で書き込む
            const res = await (async () => {
              const saved = clearBefore;
              clearBefore = true;
              const r = await applyWithRetry(merged, firstTimeout);
              clearBefore = saved;
              return r;
            })();
            firstTimeout = 6000;
            if (res) {
              applied.push(tabName + " (+libs)");
              lastMethod = res.method;
              mergeDone = true;
              log("merge: injected via", res.method);
            } else {
              warnings.push("merge write failed: " + tabName);
            }
          } else {
            applied.push(tabName + " (libs ok)");
            mergeDone = true;
          }
        } else {
          warnings.push("read failed: " + tabName);
        }
      } else {
        warnings.push("tab not found: " + tabName);
      }
      // フォールバック: merge経路が失敗したら生成HTML全体でindex.htmlを置き換える
      // (これでライブラリは確実にindex.htmlへ入る)
      if (!mergeDone && parts.fallbackHtml) {
        log("merge: falling back to full index.html replace");
        await clickFileTab(tabName); // 再試行(既に切替済みでも無害)
        const res = await (async () => {
          const saved = clearBefore;
          clearBefore = true;
          const r = await applyWithRetry(parts.fallbackHtml, firstTimeout);
          clearBefore = saved;
          return r;
        })();
        firstTimeout = 6000;
        if (res) {
          applied.push(tabName + " (full)");
          lastMethod = res.method;
          log("merge fallback: replaced via", res.method);
          // フォールバックで解決したのでmerge経路の警告は取り下げる
          for (let i = warnings.length - 1; i >= 0; i--) {
            if (warnings[i].endsWith(tabName)) warnings.splice(i, 1);
          }
        } else {
          warnings.push("fallback failed: " + tabName);
        }
      }
    }

    const order = ["html", "css", "js"].filter((role) => parts[role]);
    for (const role of order) {
      const tabName = fileMap[role];
      const switched = await clickFileTab(tabName);
      log("tabs:", role, "->", tabName, switched ? "ok" : "tab NOT FOUND");
      if (!switched && order.length > 1 && role !== "js") {
        // html/cssのタブが無ければスキップ(JSエディタを汚さない)
        warnings.push("tab not found: " + tabName);
        continue;
      }
      const res = await applyWithRetry(parts[role], firstTimeout);
      firstTimeout = 6000;
      if (res) {
        applied.push(tabName);
        lastMethod = res.method;
      } else {
        warnings.push("apply failed: " + tabName);
      }
    }
  }

  if (!applied.length) {
    return { ok: false, error: messages.editorNotFound, warnings };
  }
  return { ok: true, method: lastMethod, files: applied, warnings };
}
