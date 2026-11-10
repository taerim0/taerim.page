// @ts-check
/**
 * 번역본 편집 화면 (/posts/translate/:id/:lang, 설계 12-10 A안)
 *
 * - 칸에는 초안이 있으면 초안, 없으면 공개본, 둘 다 없으면 빈 칸
 * - 저장 = 초안에 저장 (세 칸을 통째로). 공개 = (저장 안 한 게 있으면 먼저 저장) → 초안을 공개본으로
 * - [영어로 번역]: 칸에 내용이 있으면 한 번 더 눌러 확인. 번역하는 동안 칸·버튼 모두 잠금
 * - 오른쪽 칸: 미리보기 / 한글 원문(공개된 한글, 읽기 전용) 전환
 * - 공개 사이트 반영은 글 목록의 [배포]
 */
import { ApiError, getLimits, postsApi, translationsApi } from "./api.js";
import { bindCodeCopy, loadHighlighterFor } from "./code-blocks.js";
import { bindImageUpload } from "./image-upload.js";
import { charCount, renderMarkdown } from "./lib.js";
import { clearNotice, formatDateTime, notify } from "./ui.js";

/** @typedef {import("./api.js").TranslationView} TranslationView */
/** @typedef {import("./api.js").TranslationLang} TranslationLang */
/** @typedef {import("./api.js").Post} Post */
/** @typedef {import("./api.js").Limits} Limits */

/** @typedef {"title" | "body" | "summary"} Field */
/** 편집기 값 (서버가 저장할 모양: 제목·요약은 앞뒤 공백 없이, 빈 요약은 "") @typedef {{ title: string, body: string, summary: string }} Values */

const FIELDS = /** @type {const} */ (["title", "body", "summary"]);
/** 언어 이름 (버튼·안내 글자) */
const LANG_NAMES = /** @type {Record<TranslationLang, string>} */ ({ en: "영어" });

// ── 화면 요소 ────────────────────────────────────────

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const inputs = {
  title: /** @type {HTMLInputElement} */ ($("title")),
  body: /** @type {HTMLTextAreaElement} */ ($("body")),
  summary: /** @type {HTMLInputElement} */ ($("summary")),
};
const editor = $("editor");
const preview = $("preview");
const previewTitle = $("preview-title");
const previewToggle = /** @type {HTMLButtonElement} */ ($("preview-toggle"));
const tabs = {
  preview: /** @type {HTMLButtonElement} */ ($("tab-preview")),
  source: /** @type {HTMLButtonElement} */ ($("tab-source")),
};
const buttons = {
  generate: /** @type {HTMLButtonElement} */ ($("generate")),
  save: /** @type {HTMLButtonElement} */ ($("save")),
  publish: /** @type {HTMLButtonElement} */ ($("publish")),
  unpublish: /** @type {HTMLButtonElement} */ ($("unpublish")),
  discard: /** @type {HTMLButtonElement} */ ($("discard")),
};
const imageButton = /** @type {HTMLButtonElement} */ ($("image-button"));

// ── 상태 ────────────────────────────────────────────

const route = /^\/posts\/translate\/([1-9][0-9]*)\/([a-z]+)$/.exec(location.pathname);
const postId = Number(route?.[1]);
const lang = /** @type {TranslationLang} */ (route?.[2] ?? "en");
const langName = LANG_NAMES[lang] ?? lang;

/** @type {TranslationView} */
let view;
/** 공개된 한글 (한글 원문 칸) @type {Post} */
let source;
/** @type {Limits} */
let limits;
/** 서버에 마지막으로 저장된 값 (초안, 없으면 공개본, 없으면 빈 값) */
let saved = emptyValues();
/** 요청 중이면 버튼을 잠근다 */
let busy = false;
/** 번역(LLM) 중이면 칸까지 잠근다 */
let translating = false;
/** 오른쪽 칸에 보이는 것 */
let paneTab = /** @type {"preview" | "source"} */ ("preview");

/** @returns {Values} */
function emptyValues() {
  return { title: "", body: "", summary: "" };
}

/** @returns {Values} */
function currentValues() {
  return { title: inputs.title.value.trim(), body: inputs.body.value, summary: inputs.summary.value.trim() };
}

/** 지금 칸에 띄울 것: 초안 → 공개본 → 빈 값 @param {TranslationView} v @returns {Values} */
function valuesOf(v) {
  const from = v.draft ?? v.published;
  return from ? { title: from.title, body: from.body, summary: from.summary ?? "" } : emptyValues();
}

const changedFields = () => {
  const now = currentValues();
  return FIELDS.filter((field) => now[field] !== saved[field]);
};
const isDirty = () => changedFields().length > 0;
const hasContent = () => FIELDS.some((field) => inputs[field].value.trim() !== "");

// ── 불러오기 ─────────────────────────────────────────

async function load() {
  if (!route) {
    $("loading").textContent = "주소가 올바르지 않아요.";
    return;
  }
  /** @type {HTMLAnchorElement} */ ($("back")).href = `/posts/edit/${postId}`;
  try {
    const [limitValues, translation, forEdit] = await Promise.all([
      getLimits(),
      translationsApi.get(postId, lang),
      postsApi.get(postId),
    ]);
    limits = limitValues;
    source = forEdit.post;
    setView(translation, { overwriteInputs: true });
  } catch (error) {
    const notFound = error instanceof ApiError && error.code === "not_found";
    $("loading").textContent = notFound ? "글을 찾을 수 없어요. 휴지통에 있거나 지워진 글일 수 있어요." : "번역을 불러오지 못했어요.";
    if (!notFound) showError(error);
    return;
  }
  $("loading").hidden = true;
  editor.hidden = false;
  setPreviewOpen(initialPreviewState());
  refresh();
  inputs.title.focus();
}

/**
 * 서버 응답으로 상태를 맞춘다.
 * overwriteInputs가 false면 요청을 보내는 동안 또 고친 칸은 그대로 두고, 보낸 그대로인 칸만 서버 값으로
 * @param {TranslationView} next
 * @param {{ overwriteInputs: boolean, sent?: Values }} options
 */
function setView(next, { overwriteInputs, sent }) {
  view = next;
  const values = valuesOf(next);
  const before = currentValues();
  for (const field of FIELDS) {
    if (overwriteInputs || (sent !== undefined && before[field] === sent[field])) inputs[field].value = values[field];
  }
  saved = values;
  renderStatus();
  renderPane();
}

// ── 화면 그리기 ──────────────────────────────────────

function renderStatus() {
  const { status, draft, published } = view;
  const code = lang.toUpperCase();
  const pill = $("status-pill");
  pill.className = `pill ${status.published ? "published" : status.hasDraft ? "editing" : "draft"}`;
  pill.textContent = status.published
    ? status.hasDraft
      ? `${code} 공개됨 · 초안 있음`
      : `${code} 공개됨`
    : status.hasDraft
      ? `${code} 초안`
      : `${code} 없음`;

  // 칸에 떠 있는 것(초안 또는 공개본)이 옛 한글 기준이면 "원문 바뀜"
  $("outdated-pill").hidden = !(draft ? status.draftOutdated : status.outdated);
  $("saved-at").textContent = draft
    ? `${draft.model ? `${draft.model} 번역` : "직접 씀"} · 저장 ${formatDateTime(draft.updatedAt)}`
    : published
      ? `공개 ${formatDateTime(published.updatedAt)}`
      : "";

  const help = [];
  if (!view.source.published) help.push("한글이 아직 초안이에요. 한글을 먼저 공개하면 번역·공개할 수 있어요.");
  else if (view.source.hasPendingEdits) help.push("반영하지 않은 한글 수정본이 있어요. 번역은 공개된 한글로 해요.");
  if (!view.translator) help.push("번역 설정이 없어요. 직접 써서 공개할 수 있어요.");
  $("state-help").textContent = help.join(" ");
  $("state-help").hidden = help.length === 0;

  buttons.unpublish.hidden = !published;
  buttons.discard.hidden = !draft;
  buttons.unpublish.textContent = `${langName}본 내리기`;
  buttons.generate.textContent = draft || published ? "다시 번역" : `${langName}로 번역`;
}

/** 입력할 때마다: 글자 수, 저장 안 됨, 버튼 켜고 끄기 */
function refresh() {
  const now = currentValues();
  const over = renderCounts(now);
  const dirty = isDirty();
  const sourceReady = view.source.published;

  $("dirty-mark").hidden = !dirty;
  document.title = `${now.title || "번역"} (${lang.toUpperCase()}) · taerim.page 관리자`;
  if (paneTab === "preview") previewTitle.textContent = now.title;

  const blocked = busy || now.title === "" || over;
  buttons.save.disabled = blocked || !dirty;
  buttons.publish.hidden = !(view.draft || dirty);
  buttons.publish.textContent = `${langName}본 공개`;
  buttons.publish.disabled = blocked || !sourceReady;
  buttons.publish.title = sourceReady ? "" : "한글을 먼저 공개하세요";
  buttons.generate.disabled = busy || !view.translator || !sourceReady;
  buttons.generate.title = !view.translator ? "번역 설정이 없어요" : !sourceReady ? "한글을 먼저 공개하세요" : "";
  buttons.unpublish.disabled = busy;
  buttons.discard.disabled = busy;
  for (const field of FIELDS) inputs[field].disabled = translating;
  imageButton.disabled = translating;
}

/** 칸별 "n / 최대". 넘친 칸이 있으면 true @param {Values} now */
function renderCounts(now) {
  const fmt = (/** @type {number} */ n) => n.toLocaleString("ko-KR");
  let over = false;
  for (const field of FIELDS) {
    const target = document.querySelector(`[data-count-for="${field}"]`);
    if (!target) continue;
    const count = charCount(now[field]);
    const max = limits.translation[field];
    const exceeded = count > max;
    over ||= exceeded;
    target.textContent = `${fmt(count)} / ${fmt(max)}자${exceeded ? ` (${fmt(count - max)}자 초과)` : ""}`;
    target.className = `count${exceeded ? " over" : count > max * 0.9 ? " warn" : ""}`;
  }
  return over;
}

// ── 오른쪽 칸: 미리보기 / 한글 원문 ────────────────────

let previewTimer = 0;

/** 지금 탭 내용 그리기 (렌더러가 HTML을 막고 안전하게 만든 결과만 넣는다) */
function renderPane() {
  clearTimeout(previewTimer);
  if (!isPreviewOpen()) return;
  // 코드 블록이 있으면 색칠기를 (한 번만) 불러와서 다시 그림
  loadHighlighterFor(paneTab === "source" ? source.body : inputs.body.value, renderPane);
  if (paneTab === "source") {
    previewTitle.textContent = source.title;
    preview.innerHTML = renderMarkdown(source.body);
  } else {
    previewTitle.textContent = currentValues().title;
    // 번역 언어로 그림 (콜아웃 기본 제목 등)
    preview.innerHTML = renderMarkdown(inputs.body.value, { locale: lang });
  }
}

/** 입력 중에는 잠깐 멈췄을 때 한 번 그린다 (번역 화면은 블록 단위 미리보기까지는 하지 않음) */
function schedulePreview() {
  if (paneTab !== "preview" || !isPreviewOpen()) return;
  clearTimeout(previewTimer);
  previewTimer = window.setTimeout(renderPane, 200);
}

/** @param {"preview" | "source"} tab */
function setTab(tab) {
  paneTab = tab;
  tabs.preview.setAttribute("aria-selected", String(tab === "preview"));
  tabs.source.setAttribute("aria-selected", String(tab === "source"));
  $("preview-pane").scrollTop = 0;
  renderPane();
}

// 열고 닫기: 편집 화면과 같은 규칙·같은 기억 (넓은 화면은 기억, 좁은 화면은 처음엔 닫힘)
const narrowScreen = matchMedia("(max-width: 899px)");
const PREVIEW_PREF_KEY = "admin-preview-wide";
const isPreviewOpen = () => editor.dataset.preview === "open";

function widePreference() {
  try {
    return localStorage.getItem(PREVIEW_PREF_KEY) !== "closed";
  } catch {
    return true;
  }
}
const initialPreviewState = () => (narrowScreen.matches ? false : widePreference());

/** @param {boolean} open @param {{ remember?: boolean }} [options] */
function setPreviewOpen(open, { remember = false } = {}) {
  editor.dataset.preview = open ? "open" : "closed";
  previewToggle.setAttribute("aria-expanded", String(open));
  previewToggle.textContent = open ? "오른쪽 칸 숨기기" : "미리보기·원문 보기";
  if (remember && !narrowScreen.matches) {
    try {
      localStorage.setItem(PREVIEW_PREF_KEY, open ? "open" : "closed");
    } catch {
      // 기억 못 해도 동작에는 문제없음
    }
  }
  if (open) renderPane();
}

// ── 오류 ────────────────────────────────────────────

/** 입력 오류는 칸 아래에, 나머지는 위쪽 알림 줄에 @param {unknown} error */
function showError(error) {
  if (!(error instanceof ApiError)) {
    notify("요청을 처리하지 못했어요");
    return;
  }
  const fieldIssues = error.issues.filter((issue) => FIELDS.includes(/** @type {Field} */ (issue.field)));
  for (const issue of fieldIssues) {
    const target = document.querySelector(`[data-error-for="${issue.field}"]`);
    if (target) target.textContent = target.textContent ? `${target.textContent} · ${issue.message}` : issue.message;
  }
  notify(fieldIssues.length === 0 ? error.message : "입력을 확인해 주세요");
}

/** @param {Field} [field] */
function clearErrors(field) {
  for (const target of document.querySelectorAll(field ? `[data-error-for="${field}"]` : "[data-error-for]")) {
    target.textContent = "";
  }
}

// ── 동작 ────────────────────────────────────────────

/** 요청 하나를 잠금 상태로 실행. 성공하면 true @param {() => Promise<void>} task */
async function run(task) {
  if (busy) return false;
  busy = true;
  refresh();
  clearErrors();
  try {
    await task();
    return true;
  } catch (error) {
    showError(error);
    return false;
  } finally {
    busy = false;
    refresh();
  }
}

/** 초안에 저장 (세 칸 통째로). 바꿀 게 없으면 true @param {{ quiet?: boolean }} [options] */
async function save({ quiet = false } = {}) {
  if (!isDirty()) return true;
  const sent = currentValues();
  return run(async () => {
    const next = await translationsApi.saveDraft(postId, lang, { ...sent, summary: sent.summary || null });
    setView(next, { overwriteInputs: false, sent });
    if (!quiet) notify("저장했어요", "info");
  });
}

/** LLM 번역 → 초안. 결과로 칸을 채운다 (저장 안 한 내용은 덮어씀 — 확인은 부르는 쪽) */
async function generate() {
  translating = true;
  buttons.generate.textContent = "번역 중…";
  notify(`${langName}로 번역하고 있어요. 글이 길면 1분쯤 걸릴 수 있어요`, "info");
  const ok = await run(async () => {
    setView(await translationsApi.generate(postId, lang), { overwriteInputs: true });
  });
  translating = false;
  renderStatus();
  refresh();
  if (ok) notify("번역했어요. 읽어 보고 고친 뒤 공개해 주세요", "info");
}

/** 공개: 저장 안 한 게 있으면 먼저 저장 */
async function publish() {
  if (!(await save({ quiet: true }))) return;
  await run(async () => {
    setView(await translationsApi.publish(postId, lang), { overwriteInputs: false, sent: saved });
    notify(`${langName}본을 공개했어요. 배포하면 공개 사이트에 나가요`, "info");
  });
}

async function unpublish() {
  await run(async () => {
    setView(await translationsApi.unpublish(postId, lang), { overwriteInputs: false, sent: saved });
    notify(`${langName}본을 내렸어요. 내용은 초안으로 남아 있어요`, "info");
  });
}

/** 초안 버리기 → 칸을 공개본(있으면)으로 되돌림 (저장 안 한 내용도 버려짐) */
async function discard() {
  await run(async () => {
    await translationsApi.deleteDraft(postId, lang);
    setView(await translationsApi.get(postId, lang), { overwriteInputs: true });
    renderPane();
    notify("초안을 버렸어요", "info");
  });
}

/**
 * 한 번 누르면 확인 글자로 바뀌고, 3초 안에 한 번 더 눌러야 실행. needsConfirm이 false면 바로 실행
 * @param {HTMLButtonElement} button
 * @param {string} confirmLabel
 * @param {() => boolean} needsConfirm
 * @param {() => Promise<void>} action
 */
function twoStep(button, confirmLabel, needsConfirm, action) {
  let label = "";
  let timer = 0;
  const reset = () => {
    clearTimeout(timer);
    if (!button.dataset.confirming) return;
    delete button.dataset.confirming;
    button.textContent = label;
  };
  button.addEventListener("click", () => {
    if (button.dataset.confirming || !needsConfirm()) {
      reset();
      void action();
      return;
    }
    label = button.textContent ?? "";
    button.dataset.confirming = "true";
    button.textContent = confirmLabel;
    timer = window.setTimeout(reset, 3000);
  });
}

// ── 이벤트 ──────────────────────────────────────────

/** @param {Field} field */
function onEdit(field) {
  clearErrors(field);
  if (field === "body") schedulePreview();
  refresh();
}

inputs.title.addEventListener("input", () => onEdit("title"));
inputs.body.addEventListener("input", () => onEdit("body"));
inputs.summary.addEventListener("input", () => onEdit("summary"));

// 이미지 올리기: 이미지는 언어와 무관 (한글 글과 같은 주소를 써도 되고, 여기서 새로 올려도 됨)
bindImageUpload({ textarea: inputs.body, button: imageButton, fileInput: /** @type {HTMLInputElement} */ ($("image-file")) });

bindCodeCopy(preview);
tabs.preview.addEventListener("click", () => setTab("preview"));
tabs.source.addEventListener("click", () => setTab("source"));
previewToggle.addEventListener("click", () => setPreviewOpen(!isPreviewOpen(), { remember: true }));
$("preview-close").addEventListener("click", () => setPreviewOpen(false, { remember: true }));
narrowScreen.addEventListener("change", () => setPreviewOpen(initialPreviewState()));
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && narrowScreen.matches && isPreviewOpen()) setPreviewOpen(false);
});

twoStep(buttons.generate, "덮어써요 — 한 번 더", hasContent, generate);
buttons.save.addEventListener("click", () => void save());
buttons.publish.addEventListener("click", () => void publish());
twoStep(buttons.unpublish, "내릴까요? (한 번 더)", () => true, unpublish);
twoStep(buttons.discard, "버릴까요? (한 번 더)", () => true, discard);

// Ctrl+S (맥은 Cmd+S) = 저장
window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    if (!buttons.save.disabled) void save();
  }
});

// 저장 안 한 변경이 있으면 떠날 때 브라우저가 확인 창을 띄운다
window.addEventListener("beforeunload", (event) => {
  if (!view || !isDirty()) return;
  event.preventDefault();
  event.returnValue = "";
});

clearNotice();
void load();
