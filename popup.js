// p5.js Relay - popup logic
const MSG = (k, subs) => P5R_I18N.t(k, subs);
const targetEl = document.getElementById("target");
const previewEl = document.getElementById("preview");
const resendEl = document.getElementById("resend");
const resultEl = document.getElementById("result");
const showButtonEl = document.getElementById("showButton");

let lastCode = null;

init();

async function init() {
  await P5R_PAGE_READY;
  previewEl.textContent = MSG("popNone");
  const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
  const rules = (state.rules || []).filter((r) => r.enabled !== false);

  targetEl.innerHTML = "";
  for (const r of rules) {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.name;
    if (r.id === state.defaultRuleId) opt.selected = true;
    targetEl.appendChild(opt);
  }
  targetEl.addEventListener("change", () => {
    chrome.storage.sync.set({ defaultRuleId: targetEl.value });
  });

  if (state.lastCode) {
    lastCode = state.lastCode;
    previewEl.textContent = state.lastCode.slice(0, 400);
    resendEl.disabled = false;
  }
  if (state.lastResult) showResult(state.lastResult);

  showButtonEl.checked = state.buttonVisible !== false;
  showButtonEl.addEventListener("change", () => {
    chrome.storage.sync.set({ buttonVisible: showButtonEl.checked });
  });
}

function showResult(res) {
  if (res.ok) {
    const detail = res.files && res.files.length ? res.files.join(", ") : res.method || "";
    let txt = MSG("popAppliedTo", [res.ruleName || "", detail]);
    if (res.warnings && res.warnings.length) {
      txt += "\n⚠ " + res.warnings.join(" / ");
    }
    resultEl.textContent = txt;
    resultEl.style.whiteSpace = "pre-line";
  } else {
    let txt = "✕ " + (res.error || MSG("stFail"));
    if (res.warnings && res.warnings.length) {
      txt += "\n⚠ " + res.warnings.join(" / ");
    }
    resultEl.textContent = txt;
    resultEl.style.whiteSpace = "pre-line";
  }
}

resendEl.addEventListener("click", async () => {
  if (!lastCode) return;
  resendEl.textContent = MSG("stSending");
  const res = await chrome.runtime.sendMessage({
    type: "SEND_CODE",
    code: lastCode,
    ruleId: targetEl.value
  });
  resendEl.textContent = MSG("popResend");
  showResult({ ...res, ruleName: targetEl.selectedOptions[0]?.textContent });
});

document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// 既定の送信先は開いているエディタタブに自動追従するため、
// ポップアップ表示中の変更もライブで反映する
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.defaultRuleId) {
    const id = changes.defaultRuleId.newValue;
    if ([...targetEl.options].some((o) => o.value === id)) targetEl.value = id;
  }
});
