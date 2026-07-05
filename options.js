// p5.js Relay - options page logic
const EDITORS = [
  "auto",
  "codemirror5",
  "codemirror6",
  "monaco",
  "ace",
  "textarea",
  "contenteditable"
];
const MSG = (k, subs) => P5R_I18N.t(k, subs);

const rowsEl = document.getElementById("rows");
const statusEl = document.getElementById("status");
const clearBeforeEl = document.getElementById("clearBefore");

let state = { rules: [], defaultRuleId: null, clearBefore: true };

init();

async function init() {
  await P5R_PAGE_READY;
  const saved = await chrome.storage.sync.get([
    "rules",
    "defaultRuleId",
    "clearBefore",
    "theme",
    "lang"
  ]);
  state.rules = saved.rules || [];
  state.defaultRuleId =
    saved.defaultRuleId || (state.rules[0] && state.rules[0].id);
  state.clearBefore = saved.clearBefore !== false;
  clearBeforeEl.checked = state.clearBefore;

  const theme = saved.theme || "system";
  const radio = document.querySelector(`input[name="theme"][value="${theme}"]`);
  if (radio) radio.checked = true;
  document.querySelectorAll('input[name="theme"]').forEach((r) => {
    r.addEventListener("change", () => {
      chrome.storage.sync.set({ theme: r.value });
    });
  });

  const langSel = document.getElementById("lang");
  langSel.value = saved.lang || "system";
  langSel.addEventListener("change", () => {
    chrome.storage.sync.set({ lang: langSel.value });
  });

  render();
}

function render() {
  rowsEl.innerHTML = "";
  state.rules.forEach((rule, i) => rowsEl.appendChild(buildRow(rule, i)));
}

function buildRow(rule, i) {
  const tr = document.createElement("tr");

  const tdDefault = document.createElement("td");
  tdDefault.className = "col-default";
  const radio = document.createElement("input");
  radio.type = "radio";
  radio.name = "defaultRule";
  radio.checked = rule.id === state.defaultRuleId;
  radio.addEventListener("change", () => (state.defaultRuleId = rule.id));
  tdDefault.appendChild(radio);

  const tdEnabled = document.createElement("td");
  tdEnabled.className = "col-enabled";
  const chk = document.createElement("input");
  chk.type = "checkbox";
  chk.checked = rule.enabled !== false;
  chk.addEventListener("change", () => (rule.enabled = chk.checked));
  tdEnabled.appendChild(chk);

  const mkText = (key, placeholder, cls) => {
    const td = document.createElement("td");
    if (cls) td.className = cls;
    const input = document.createElement("input");
    input.type = "text";
    input.value = rule[key] || "";
    input.placeholder = placeholder || "";
    input.addEventListener("input", () => (rule[key] = input.value));
    td.appendChild(input);
    return td;
  };

  const tdEditor = document.createElement("td");
  tdEditor.className = "col-editor";
  const sel = document.createElement("select");
  for (const e of EDITORS) {
    const opt = document.createElement("option");
    opt.value = e;
    opt.textContent = e;
    if (rule.editor === e) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => (rule.editor = sel.value));
  tdEditor.appendChild(sel);

  // ファイル振り分け(off: そのまま / tabs: ファイルタブ切替 / panels: パネル別セレクタ)
  const tdSplit = document.createElement("td");
  tdSplit.className = "col-split";
  const split = document.createElement("select");
  for (const m of ["off", "tabs", "panels"]) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    if ((rule.splitMode || "off") === m) opt.selected = true;
    split.appendChild(opt);
  }
  split.addEventListener("change", () => {
    rule.splitMode = split.value;
    if (split.value === "tabs" && !rule.fileMap) {
      rule.fileMap = { js: "sketch.js", html: "index.html", css: "style.css" };
    }
    if (split.value === "panels" && !rule.panelMap) {
      rule.panelMap = { html: "", css: "", js: "" };
    }
  });
  tdSplit.appendChild(split);

  const tdDel = document.createElement("td");
  tdDel.className = "col-del";
  const del = document.createElement("button");
  del.className = "del";
  del.textContent = "🗑";
  del.addEventListener("click", () => {
    state.rules.splice(i, 1);
    if (state.defaultRuleId === rule.id) {
      state.defaultRuleId = state.rules[0] ? state.rules[0].id : null;
    }
    render();
  });
  tdDel.appendChild(del);

  tr.appendChild(tdDefault);
  tr.appendChild(tdEnabled);
  tr.appendChild(mkText("name", "p5.js Web Editor", "col-name"));
  tr.appendChild(mkText("urlPattern", "https://editor.p5js.org/*"));
  tr.appendChild(mkText("openUrl", "https://editor.p5js.org/"));
  tr.appendChild(tdEditor);
  tr.appendChild(mkText("selector", ""));
  tr.appendChild(tdSplit);
  tr.appendChild(tdDel);
  return tr;
}

document.getElementById("add").addEventListener("click", () => {
  const rule = {
    id: "rule_" + Date.now().toString(36),
    name: "",
    urlPattern: "",
    openUrl: "",
    editor: "auto",
    selector: "",
    initDelay: 2000,
    splitMode: "off",
    enabled: true
  };
  state.rules.push(rule);
  if (!state.defaultRuleId) state.defaultRuleId = rule.id;
  render();
});

// v2.6.0: host_permissions: <all_urls> を撤廃し、既知の8サイト以外は
// optional_host_permissionsで個別リクエストする方式に変更した。
// urlPatternからオリジン部分(スキーム+ホスト)だけを取り出す。
// background.jsにも同名の関数がある(共有モジュールが無い構成のため複製)。
function patternToOrigin(pattern) {
  const m = /^https?:\/\/[^/*]+/.exec(pattern || "");
  return m ? m[0] + "/*" : null;
}

document.getElementById("save").addEventListener("click", async () => {
  for (const r of state.rules) {
    if (!r.name || !r.urlPattern) {
      flash(MSG("msgNeed"), true);
      return;
    }
    if (!/^https?:\/\//.test(r.urlPattern)) {
      flash(MSG("msgHttp", [r.name]), true);
      return;
    }
  }

  // 未許可のオリジンがあれば、保存前にまとめて権限をリクエストする
  // (ボタンのクリック=ユーザー操作の文脈でなければリクエストできないため、
  // send時ではなくここで行う)。
  const origins = [];
  for (const r of state.rules) {
    const origin = patternToOrigin(r.urlPattern);
    if (!origin || origins.includes(origin)) continue;
    origins.push(origin);
  }
  const needed = [];
  for (const origin of origins) {
    const has = await chrome.permissions.contains({ origins: [origin] });
    if (!has) needed.push(origin);
  }
  let permissionDenied = false;
  if (needed.length) {
    let granted = false;
    try {
      granted = await chrome.permissions.request({ origins: needed });
    } catch (e) {}
    // 権限が無いと動かないだけで、設定自体は保存して続行する
    permissionDenied = !granted;
  }

  await chrome.storage.sync.set({
    rules: state.rules,
    defaultRuleId: state.defaultRuleId,
    clearBefore: clearBeforeEl.checked
  });
  flash(permissionDenied ? MSG("msgPermissionDenied") : MSG("msgSaved"), permissionDenied);
});

function flash(msg, isError) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "var(--danger)" : "";
  setTimeout(() => (statusEl.textContent = ""), 3000);
}
