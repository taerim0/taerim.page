// @ts-check
/**
 * 이슈 화면 (/issues, 설계 15-5)
 * - 왼쪽 목록(최신 순)에서 고르면 오른쪽에서 고침, [+ 새 이슈]는 빈 칸(날짜 = 오늘)
 * - 미리보기는 아카이브에 보일 모양 (글 편집과 같은 렌더러, 코드 색칠·수식·임베드도)
 * - 저장 = 새 이슈면 POST, 있던 거면 PUT. 칸별 오류는 칸 아래. 공개 사이트는 [배포]해야 바뀜
 * - 지우기 = 확인 후 바로 지움 (휴지통 없음)
 * - 저장 안 하고 다른 이슈로 가거나 떠나면 확인
 */
import { ApiError, issuesApi } from "./api.js";
import { bindCodeCopy, loadEmbedsFor, loadHighlighterFor, loadMathFor } from "./code-blocks.js";
import { bindImageUpload } from "./image-upload.js";
import { charCount, renderMarkdown } from "./lib.js";
import { clearNotice, confirmDialog, el, formatDateTime, notify } from "./ui.js";

/** @typedef {import("./api.js").Issue} Issue */
/** @typedef {import("./api.js").IssueInput} IssueInput */

const FIELDS = /** @type {const} */ (["date", "title", "body", "titleEn", "bodyEn"]);
/** 서버 제한과 같게 (src/issues/issues.ts ISSUE_LIMITS) */
const LIMITS = { title: 100, body: 5000, titleEn: 100, bodyEn: 5000 };

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const form = /** @type {HTMLFormElement} */ ($("issue-form"));
const inputs = /** @type {Record<typeof FIELDS[number], HTMLInputElement | HTMLTextAreaElement>} */ (
  Object.fromEntries(FIELDS.map((field) => [field, $(field)]))
);
const saveButton = /** @type {HTMLButtonElement} */ ($("save"));
const deleteButton = /** @type {HTMLButtonElement} */ ($("delete"));
const preview = $("preview");

/** @type {Issue[]} */
let issues = [];
/** 지금 고치는 이슈 (새 이슈면 null) @type {Issue | null} */
let current = null;
/** 마지막으로 저장된(또는 불러온) 칸 값 */
let saved = /** @type {Record<string, string>} */ ({});
let busy = false;

/** 오늘 (한국 날짜) YYYY-MM-DD */
function today() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
}

const snapshot = () => Object.fromEntries(FIELDS.map((field) => [field, inputs[field].value]));
const isDirty = () => FIELDS.some((field) => inputs[field].value !== (saved[field] ?? ""));

/** 지금 칸 값 → 서버에 보낼 모양 (빈 영어 칸은 null) @returns {IssueInput} */
function currentInput() {
  const optional = (/** @type {string} */ value) => (value.trim() === "" ? null : value);
  return {
    date: inputs.date.value,
    title: inputs.title.value,
    body: inputs.body.value,
    titleEn: optional(inputs.titleEn.value),
    bodyEn: optional(inputs.bodyEn.value),
  };
}

/** 칸 채우기 @param {Issue | null} issue */
function fill(issue) {
  current = issue;
  inputs.date.value = issue?.date ?? today();
  inputs.title.value = issue?.title ?? "";
  inputs.body.value = issue?.body ?? "";
  inputs.titleEn.value = issue?.titleEn ?? "";
  inputs.bodyEn.value = issue?.bodyEn ?? "";
  /** @type {HTMLDetailsElement} */ ($("english")).open = Boolean(issue?.titleEn || issue?.bodyEn);
  saved = snapshot();
  $("editing-label").textContent = issue ? `이슈 #${issue.id} 고치기` : "새 이슈";
  $("saved-at").textContent = issue ? `저장 ${formatDateTime(issue.updatedAt)}` : "";
  deleteButton.hidden = issue === null;
  clearErrors();
  renderList();
  refresh();
}

function refresh() {
  const dirty = isDirty();
  $("dirty-mark").hidden = !dirty;
  saveButton.disabled = busy || (current !== null && !dirty);
  deleteButton.disabled = busy;
  for (const [field, max] of Object.entries(LIMITS)) {
    const target = document.querySelector(`[data-count-for="${field}"]`);
    if (!target) continue;
    const count = charCount(inputs[/** @type {keyof typeof LIMITS} */ (field)].value);
    target.textContent = `${count.toLocaleString("ko-KR")} / ${max.toLocaleString("ko-KR")}자`;
    target.className = `count${count > max ? " over" : count > max * 0.9 ? " warn" : ""}`;
  }
  schedulePreview();
}

let previewTimer = 0;
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = window.setTimeout(renderPreview, 150);
}

/** 미리보기 (렌더러가 HTML을 막고 안전하게 만든 결과만 넣는다) */
function renderPreview() {
  const body = inputs.body.value;
  loadHighlighterFor(body, renderPreview);
  loadMathFor(body, renderPreview);
  loadEmbedsFor(body, renderPreview);
  $("preview-title").textContent = inputs.title.value.trim() || "(제목)";
  preview.innerHTML = renderMarkdown(body);
}

function renderList() {
  const list = $("issue-list");
  list.replaceChildren(
    ...issues.map((issue) => {
      const button = el(
        "button",
        { type: "button", class: "issue-item", "aria-current": issue.id === current?.id ? "true" : "false" },
        el("span", { class: "issue-item-date" }, issue.date),
        el("span", { class: "issue-item-title" }, issue.title),
      );
      button.addEventListener("click", () => void open(issue));
      return el("li", {}, button);
    }),
  );
  $("issue-empty").hidden = issues.length > 0;
}

/** 다른 이슈(또는 새 이슈)로 — 고친 게 있으면 확인 @param {Issue | null} issue */
async function open(issue) {
  if (issue?.id === current?.id && issue !== null) return;
  if (isDirty()) {
    const leave = await confirmDialog({ title: "저장하지 않은 내용이 있어요", message: "저장하지 않고 넘어가면 고친 내용이 사라져요.", confirmLabel: "버리고 넘어가기" });
    if (!leave) return;
  }
  fill(issue);
  inputs.title.focus();
}

function clearErrors() {
  for (const target of document.querySelectorAll("[data-error-for]")) target.textContent = "";
}

/** @param {unknown} error @param {string} fallback */
function showError(error, fallback) {
  if (!(error instanceof ApiError)) {
    notify(fallback);
    return;
  }
  for (const issue of error.issues) {
    const target = document.querySelector(`[data-error-for="${issue.field}"]`);
    if (target) target.textContent = issue.message;
    if (issue.field === "titleEn" || issue.field === "bodyEn") /** @type {HTMLDetailsElement} */ ($("english")).open = true;
  }
  notify(error.issues.length > 0 ? "입력을 확인해 주세요" : error.message);
}

async function save() {
  if (busy || saveButton.disabled) return;
  busy = true;
  refresh();
  clearErrors();
  try {
    const result = current ? await issuesApi.update(current.id, currentInput()) : await issuesApi.create(currentInput());
    issues = await issuesApi.list();
    fill(result);
    notify("저장했어요. 배포하면 공개 사이트에 반영돼요", "info");
  } catch (error) {
    showError(error, "저장하지 못했어요");
  } finally {
    busy = false;
    refresh();
  }
}

async function remove() {
  if (!current || busy) return;
  const ok = await confirmDialog({
    title: "이슈를 지울까요?",
    message: `"${current.title}" — 휴지통 없이 바로 지워져요. 공개 사이트는 배포하면 빠져요.`,
    confirmLabel: "지우기",
  });
  if (!ok) return;
  busy = true;
  refresh();
  try {
    await issuesApi.remove(current.id);
    issues = await issuesApi.list();
    fill(null);
    notify("지웠어요", "info");
  } catch (error) {
    showError(error, "지우지 못했어요");
  } finally {
    busy = false;
    refresh();
  }
}

async function load() {
  try {
    issues = await issuesApi.list();
  } catch (error) {
    $("loading").textContent = "이슈를 불러오지 못했어요.";
    showError(error, "이슈를 불러오지 못했어요");
    return;
  }
  $("loading").hidden = true;
  $("issues").hidden = false;
  fill(null);
}

// ── 이벤트 ──────────────────────────────────────────

for (const field of FIELDS) inputs[field].addEventListener("input", refresh);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  void save();
});
deleteButton.addEventListener("click", () => void remove());
$("new-issue").addEventListener("click", () => void open(null));
bindImageUpload({
  textarea: /** @type {HTMLTextAreaElement} */ (inputs.body),
  button: /** @type {HTMLButtonElement} */ ($("image-button")),
  fileInput: /** @type {HTMLInputElement} */ ($("image-file")),
});
bindCodeCopy(preview);

// Ctrl+S = 저장
window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void save();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!isDirty()) return;
  event.preventDefault();
  event.returnValue = "";
});

clearNotice();
void load();
