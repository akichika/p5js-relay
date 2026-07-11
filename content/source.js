// p5.js Relay - source content script
// AIチャットのコードブロック / Canvas / Artifactパネルに転送ボタンを追加する。
// 設計方針:
// - ボタンはブロックあたり1個(右下)。サイト純正のコピー(右上)と重ねない。
// - React系UIは注入ノードを複製/破棄するため、本物のボタンをWeakSetで管理し、
//   複製(リスナーの無い偽物)だけを静かに除去する。全撤去→再追加はしない(点滅防止)。
// - 拡張の更新でcontextが無効化されたら、全通信を止めて静かに自己停止する。

(() => {
  const BTN_CLASS = "coderelay-btn-wrap";
  const LIVE = new WeakSet(); // このスクリプトが生成した本物のボタン
  const WRAP_HOST = new WeakMap(); // ボタン → 設置先要素(pre/panel/body)

  let dead = false; // extension context invalidated後はtrue
  let intervalId = null;
  let observer = null;

  function alive() {
    try {
      return !dead && !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function teardown() {
    dead = true;
    if (intervalId) clearInterval(intervalId);
    if (observer) observer.disconnect();
    // 死んだボタンは誤操作防止のため薄くする
    document.querySelectorAll("." + BTN_CLASS).forEach((w) => {
      w.style.opacity = "0.35";
      w.title = "p5.js Relay updated - please reload this page";
    });
  }

  // 例外安全なsendMessage。context無効化を検知したら自己停止。
  function safeSend(msg, cb) {
    if (!alive()) {
      teardown();
      if (cb) cb(null);
      return;
    }
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        const le = chrome.runtime.lastError; // 消費必須
        if (le && /context invalidated/i.test(le.message || "")) {
          teardown();
          if (cb) cb(null);
          return;
        }
        if (cb) cb(le ? { ok: false, error: le.message } : res);
      });
    } catch (e) {
      if (/context invalidated/i.test(String(e))) teardown();
      if (cb) cb(null);
    }
  }

  // ---- i18n ----
  let dict = {};
  function T(key) {
    const e = dict[key];
    return e ? e.message : key;
  }
  function loadI18n(cb) {
    safeSend({ type: "GET_I18N" }, (res) => {
      if (res && res.dict) dict = res.dict;
      if (cb) cb();
    });
  }

  let rulesCache = { rules: [], defaultRuleId: null };
  let themeSetting = "system";
  let buttonVisible = true; // ポップアップのトグルでON/OFF

  function refreshState() {
    safeSend({ type: "GET_STATE" }, (res) => {
      if (!res) return;
      rulesCache = res;
      themeSetting = res.theme || "system";
      buttonVisible = res.buttonVisible !== false;
      applyThemeAll();
      scan(document);
    });
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (!alive()) return;
      if (area !== "sync") return;
      if (changes.rules || changes.defaultRuleId || changes.theme) refreshState();
      if (changes.buttonVisible) {
        buttonVisible = changes.buttonVisible.newValue !== false;
        scan(document); // ポップアップでの切り替えを即座に反映
      }
      if (changes.lang) loadI18n(updateAllLabels);
    });
  } catch (e) {}

  // ---- テーマ ----
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", () => applyThemeAll());

  function resolvedTheme() {
    if (themeSetting === "light" || themeSetting === "dark") return themeSetting;
    return mql.matches ? "dark" : "light";
  }
  function applyThemeAll() {
    const th = resolvedTheme();
    document
      .querySelectorAll("." + BTN_CLASS)
      .forEach((w) => (w.dataset.crTheme = th));
  }
  function updateAllLabels() {
    document.querySelectorAll("." + BTN_CLASS).forEach((w) => {
      const label = w.querySelector(".coderelay-label");
      if (label && w.dataset.crKey && !w.dataset.state) {
        label.textContent = T(w.dataset.crKey);
      }
    });
  }

  // ---- アイコン: p5.jsを意識した6本スポークのアスタリスク(SVG) ----
  function makeAsteriskSvg() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "coderelay-ico");
    svg.setAttribute("aria-hidden", "true");
    const g = document.createElementNS(ns, "g");
    g.setAttribute("stroke", "currentColor");
    g.setAttribute("stroke-width", "3.4");
    g.setAttribute("stroke-linecap", "round");
    const lines = [
      [12, 3.2, 12, 20.8],
      [4.4, 7.6, 19.6, 16.4],
      [19.6, 7.6, 4.4, 16.4]
    ];
    for (const [x1, y1, x2, y2] of lines) {
      const l = document.createElementNS(ns, "line");
      l.setAttribute("x1", x1);
      l.setAttribute("y1", y1);
      l.setAttribute("x2", x2);
      l.setAttribute("y2", y2);
      g.appendChild(l);
    }
    svg.appendChild(g);
    return svg;
  }

  // ---- コード抽出・送信 ----
  function extractCode(pre) {
    const codeEl = pre.querySelector("code") || pre;
    return codeEl.innerText.replace(/\u00a0/g, " ");
  }

  function handleResult(wrap, res) {
    if (res && res.ok) {
      setBtnState(wrap, "done");
      if (res.warnings && res.warnings.length) {
        console.info("[p5.js Relay] warnings:", res.warnings.join(" / "));
      }
    } else if (res) {
      setBtnState(wrap, "error", formatErr(res));
    } else {
      setBtnState(wrap, "error", "p5.js Relay updated - please reload this page");
    }
  }

  function formatErr(res) {
    if (!res) return "";
    let msg = res.error || "";
    if (res.warnings && res.warnings.length) {
      msg += (msg ? " | " : "") + res.warnings.join(" / ");
    }
    return msg;
  }

  function sendCode(code, ruleId, wrap) {
    setBtnState(wrap, "sending");
    try {
      navigator.clipboard.writeText(code).catch(() => {});
    } catch (e) {}
    safeSend({ type: "SEND_CODE", code, ruleId }, (res) => handleResult(wrap, res));
  }

  function sendCanvas(ruleId, wrap) {
    setBtnState(wrap, "sending");
    safeSend({ type: "SEND_CANVAS", ruleId }, (res) => handleResult(wrap, res));
  }

  function setBtnState(wrap, state, msg) {
    const label = wrap.querySelector(".coderelay-label");
    if (!label) return;
    wrap.dataset.state = state;
    if (state === "sending") label.textContent = T("stSending");
    else if (state === "done") {
      label.textContent = T("stDone");
      setTimeout(() => {
        delete wrap.dataset.state;
        label.textContent = T(wrap.dataset.crKey);
      }, 2500);
    } else if (state === "error") {
      label.textContent = T("stFail");
      label.title = msg || "";
      wrap.title = msg || "";
      console.info("[p5.js Relay]", msg);
      setTimeout(() => {
        delete wrap.dataset.state;
        label.textContent = T(wrap.dataset.crKey);
      }, 4000);
    }
  }

  // ドラッグで位置を動かせるようにする。
  // ドラッグは左端のグリップ(斜線部分)のみ。ボタン本体はドラッグ対象外なので
  // クリック/プルダウンの動作を妨げない。位置は保存せずリロードでリセット。
  function enableDrag(wrap, grip) {
    let pid = null, sx = 0, sy = 0, ox = 0, oy = 0;
    grip.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      pid = e.pointerId;
      sx = e.clientX;
      sy = e.clientY;
      const r = wrap.getBoundingClientRect();
      if (getComputedStyle(wrap).position === "fixed") {
        ox = r.left;
        oy = r.top;
      } else {
        const p = wrap.offsetParent
          ? wrap.offsetParent.getBoundingClientRect()
          : { left: 0, top: 0 };
        ox = r.left - p.left;
        oy = r.top - p.top;
      }
      try { grip.setPointerCapture(pid); } catch (err) {}
    });
    grip.addEventListener("pointermove", (e) => {
      if (pid === null || e.pointerId !== pid) return;
      wrap.style.left = ox + (e.clientX - sx) + "px";
      wrap.style.top = oy + (e.clientY - sy) + "px";
      wrap.style.right = "auto";
      wrap.style.bottom = "auto";
    });
    const end = () => {
      if (pid === null) return;
      try { grip.releasePointerCapture(pid); } catch (err) {}
      pid = null;
    };
    grip.addEventListener("pointerup", end);
    grip.addEventListener("pointercancel", end);
  }

  // ---- ボタン生成 (ブロックあたり1個・右上やや下、ドラッグ移動可) ----
  function createSendWrap(labelKey, onSend, onMenu) {
    const wrap = document.createElement("div");
    wrap.className = BTN_CLASS + " coderelay-pos-top";
    wrap.dataset.crTheme = resolvedTheme();
    wrap.dataset.crKey = labelKey;
    LIVE.add(wrap);

    // 左端のドラッグ用グリップ(斜線)。ここをつかんだ時だけ移動できる
    const grip = document.createElement("div");
    grip.className = "coderelay-grip";
    grip.title = T("tipDrag");

    const main = document.createElement("button");
    main.type = "button";
    main.className = "coderelay-main";
    main.title = T("tipApply");

    const label = document.createElement("span");
    label.className = "coderelay-label";
    label.textContent = T(labelKey);
    main.appendChild(makeAsteriskSvg());
    main.appendChild(label);

    main.addEventListener("click", (e) => {
      e.stopPropagation();
      onSend(wrap);
    });

    const more = document.createElement("button");
    more.type = "button";
    more.className = "coderelay-more";
    more.textContent = "▾";
    more.title = T("tipPick");
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      onMenu(wrap);
    });

    wrap.appendChild(grip);
    wrap.appendChild(main);
    wrap.appendChild(more);
    enableDrag(wrap, grip);
    return wrap;
  }

  function buildMenu(wrap, send) {
    let menu = wrap.querySelector(".coderelay-menu");
    if (menu) {
      menu.remove();
      return;
    }
    menu = document.createElement("div");
    // 右上配置のボタンはメニューを下に展開、FAB(右下固定)は上に展開
    const below = !wrap.classList.contains("coderelay-fab");
    menu.className = "coderelay-menu" + (below ? " coderelay-menu-below" : "");
    const rules = (rulesCache.rules || []).filter((r) => r.enabled !== false);
    if (!rules.length) {
      const empty = document.createElement("div");
      empty.className = "coderelay-menu-item coderelay-menu-empty";
      empty.textContent = T("menuEmpty");
      menu.appendChild(empty);
    }
    for (const r of rules) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "coderelay-menu-item";
      item.textContent =
        (r.id === rulesCache.defaultRuleId ? "★ " : "") + r.name;
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.remove();
        send(r.id, wrap);
      });
      menu.appendChild(item);
    }
    wrap.appendChild(menu);
    setTimeout(() => {
      const close = (ev) => {
        if (!menu.contains(ev.target)) {
          menu.remove();
          document.removeEventListener("click", close, true);
        }
      };
      document.addEventListener("click", close, true);
    }, 0);
  }

  // 入れ子になったpre(別のpreの内側にあるpre)か判定。
  // ChatGPTはコードブロックをCodeMirrorビューアで描画するようになり、
  // 外側のpre(markdown)の中にpre.cm-contentが入る二重構造になった。
  // 両方にボタンを付けると2個表示になるため、外側のpreだけを設置先にする。
  function isNestedPre(el) {
    return (
      el.tagName === "PRE" &&
      el.parentElement &&
      !!el.parentElement.closest("pre")
    );
  }

  // 全ボタンの整合チェック:
  // - 複製(LIVEでない偽物)は除去
  // - 本物でも、Reactの再構成で設置先(host)の外へ移動させられたものは除去
  //   (設置先側のスキャンで正しい位置に再付与される)
  // - 本物でも、設置先が入れ子preなら除去(外側preのボタンに一本化)
  function globalCleanup() {
    document.querySelectorAll("." + BTN_CLASS).forEach((w) => {
      if (!LIVE.has(w)) {
        w.remove();
        return;
      }
      const host = WRAP_HOST.get(w);
      if (!host || !host.isConnected || !host.contains(w)) {
        w.remove();
        return;
      }
      if (isNestedPre(host)) w.remove();
    });
  }

  // 複製された偽ボタン(リスナー無し)を除去し、本物の有無を返す
  function cleanClones(container) {
    let hasLive = false;
    container.querySelectorAll("." + BTN_CLASS).forEach((w) => {
      if (LIVE.has(w) && WRAP_HOST.get(w) === container) {
        if (hasLive) w.remove(); // 万一の重複は最初の1個だけ残す
        else hasLive = true;
      } else if (!LIVE.has(w)) {
        w.remove(); // クローンは静かに除去(本物は触らない=点滅しない)
      }
    });
    return hasLive;
  }

  // ---- チャット内コードブロック ----
  function attachButton(pre) {
    if (isNestedPre(pre)) return; // 入れ子pre(ChatGPTのCMビューア内部)はスキップ
    if (cleanClones(pre)) return; // 本物が既に居るなら何もしない
    if (extractCode(pre).trim().length < 8) return;
    pre.dataset.coderelay = "1";

    const style = getComputedStyle(pre);
    if (style.position === "static") pre.style.position = "relative";

    const onSend = (wrap) => sendCode(extractCode(pre), null, wrap);
    const onMenu = (wrap) =>
      buildMenu(wrap, (ruleId, w) => sendCode(extractCode(pre), ruleId, w));

    const wrap = createSendWrap("btnApply", onSend, onMenu);
    WRAP_HOST.set(wrap, pre);
    pre.appendChild(wrap);
  }

  // ---- Canvas / Artifact パネル ----
  const PANEL_SELECTORS = [
    "code-immersive-panel",
    "immersive-panel",
    "[class*='immersive-panel']",
    "[class*='code-immersive']",
    ".cm-editor",
    ".monaco-editor",
    ".CodeMirror"
  ].join(",");

  function panelLabelKey() {
    const h = location.hostname;
    if (h.includes("claude.ai")) return "btnArtifact";
    return "btnCanvas";
  }

  function deepQueryAll(selector, root = document, acc = []) {
    if (root.querySelectorAll) {
      root.querySelectorAll(selector).forEach((el) => acc.push(el));
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) deepQueryAll(selector, el.shadowRoot, acc);
      }
    }
    return acc;
  }

  function attachCanvasButton(panel) {
    if (cleanClones(panel)) return;
    // 祖先/子孫に本物ボタン付きパネルがあれば二重付与しない
    if (panel.closest) {
      const marked = panel.closest("[data-coderelay-canvas]");
      if (marked && marked !== panel && cleanClones(marked)) return;
    }
    if (panel.querySelector) {
      const inner = panel.querySelector("[data-coderelay-canvas]");
      if (inner && cleanClones(inner)) return;
    }
    try {
      panel.dataset.coderelayCanvas = "1";
    } catch (e) {
      return;
    }

    const style = getComputedStyle(panel);
    if (style.position === "static") panel.style.position = "relative";

    const key = panelLabelKey();
    const onSend = (wrap) => sendCanvas(null, wrap);
    const onMenu = (wrap) =>
      buildMenu(wrap, (ruleId, w) => sendCanvas(ruleId, w));

    const btn = createSendWrap(key, onSend, onMenu);
    btn.classList.add("coderelay-canvas");
    WRAP_HOST.set(btn, panel);
    panel.appendChild(btn);
  }

  function scanPanels() {
    for (const el of deepQueryAll(PANEL_SELECTORS)) {
      if (el.closest && el.closest("pre[data-coderelay]")) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 300 || rect.height < 150) continue;
      const isEditorEl =
        el.matches && el.matches(".cm-editor, .monaco-editor, .CodeMirror");
      attachCanvasButton(isEditorEl ? el.parentElement || el : el);
    }
  }

  // claude.ai: Artifactはプレビュー表示だとコードがDOM上に無いため、
  // 画面右下に常設の転送ボタンを置く(bodyの直下なのでReactに壊されない)。
  function ensureFab() {
    if (!location.hostname.includes("claude.ai")) return;
    const existing = document.querySelector(".coderelay-fab");
    if (existing && LIVE.has(existing)) return;
    if (existing) existing.remove();
    const key = panelLabelKey();
    const onSend = (wrap) => sendCanvas(null, wrap);
    const onMenu = (wrap) =>
      buildMenu(wrap, (ruleId, w) => sendCanvas(ruleId, w));
    const fab = createSendWrap(key, onSend, onMenu);
    fab.classList.add("coderelay-fab", "coderelay-canvas");
    WRAP_HOST.set(fab, document.body);
    document.body.appendChild(fab);
  }

  function scan(root) {
    if (!alive()) return;
    if (!buttonVisible) {
      document.querySelectorAll("." + BTN_CLASS).forEach((w) => w.remove());
      return;
    }
    globalCleanup();
    (root.querySelectorAll ? root.querySelectorAll("pre") : []).forEach(
      attachButton
    );
    scanPanels();
    ensureFab();
  }

  // ---- 起動 ----
  loadI18n(() => {
    refreshState();
    scan(document);
    let timer = null;
    observer = new MutationObserver(() => {
      if (!alive()) return;
      clearTimeout(timer);
      timer = setTimeout(() => scan(document), 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // 保険: 仮想化UIやShadow DOM内の変化を拾う定期スキャン
    intervalId = setInterval(() => scan(document), 3000);
  });
})();
