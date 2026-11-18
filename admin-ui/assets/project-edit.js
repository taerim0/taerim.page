// @ts-check
/**
 * 프로젝트 본문 편집 (/projects/edit/:id, 설계 18-7)
 * - 글 편집 화면(E-8)과 같은 틀: 쓰기 카드 + 눈 동그라미 미리보기, 이미지 붙여넣기·끌어놓기, Tab 들여쓰기, 단축키, 콜아웃 도움말
 * - 본문만 저장 (PUT /api/projects/:id/body). 초안 없음 — 저장하면 다음 배포에 상세 페이지로
 * - 저장 안 하고 떠나면 확인
 */
import { ApiError, projectsApi } from "./api.js";
import { bindCalloutHelp } from "./callout-help.js";
import { bindCodeCopy, loadEmbedsFor, loadHighlighterFor, loadMathFor } from "./code-blocks.js";
import { bindImageUpload } from "./image-upload.js";
import { bindIndent } from "./indent.js";
import { charCount, renderMarkdown } from "./lib.js";
import { bindShortcuts } from "./shortcuts.js";
import { clearNotice, formatDateTime, notify } from "./ui.js";

/** 서버 제한과 같게 (src/projects/projects.ts PROJECT_LIMITS.body) */
const BODY_LIMIT = 50000;
const PREVIEW_PREF_KEY = "project-preview";

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const editor = $("editor");
const body = /** @type {HTMLTextAreaElement} */ ($("body"));
const preview = $("preview");
const saveButton = /** @type {HTMLButtonElement} */ ($("save"));
const previewToggle = /** @type {HTMLButtonElement} */ ($("preview-toggle"));
const narrowScreen = matchMedia("(max-width: 899px)");

const id = Number(location.pathname.split("/").pop());
let saved = "";
let busy = false;

const isDirty = () => body.value !== saved;

function refresh() {
  $("dirty-mark").hidden = !isDirty();
  saveButton.disabled = busy || !isDirty();
  const count = charCount(body.value);
  const target = document.querySelector('[data-count-for="body"]');
  if (target) {
    // 앞 "본문 "은 CSS가 붙임 (.write-counts)
    target.textContent = `${count.toLocaleString("ko-KR")} / ${BODY_LIMIT.toLocaleString("ko-KR")}자`;
    target.className = `count${count > BODY_LIMIT ? " over" : count > BODY_LIMIT * 0.9 ? " warn" : ""}`;
  }
  schedulePreview();
}

let previewTimer = 0;
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = window.setTimeout(renderPreview, 150);
}

/** 미리보기 (렌더러가 안전하게 만든 HTML만) */
function renderPreview() {
  if (editor.dataset.preview !== "open") return;
  loadHighlighterFor(body.value, renderPreview);
  loadMathFor(body.value, renderPreview);
  loadEmbedsFor(body.value, renderPreview);
  preview.innerHTML = renderMarkdown(body.value);
}

/** @param {boolean} open @param {{ remember?: boolean }} [options] */
function setPreviewOpen(open, { remember = false } = {}) {
  editor.dataset.preview = open ? "open" : "closed";
  previewToggle.setAttribute("aria-pressed", String(open));
  previewToggle.title = open ? "미리보기 접기" : "미리보기 펴기";
  previewToggle.setAttribute("aria-label", previewToggle.title);
  if (remember && !narrowScreen.matches) {
    try {
      localStorage.setItem(PREVIEW_PREF_KEY, open ? "open" : "closed");
    } catch {
      // 기억 못 해도 동작에는 문제없음
    }
  }
  if (open) renderPreview();
}

function initialPreviewState() {
  if (narrowScreen.matches) return false;
  try {
    return localStorage.getItem(PREVIEW_PREF_KEY) !== "closed";
  } catch {
    return true;
  }
}

async function save() {
  if (busy || !isDirty()) return;
  busy = true;
  refresh();
  const target = document.querySelector('[data-error-for="body"]');
  if (target) target.textContent = "";
  try {
    const project = await projectsApi.updateBody(id, body.value);
    saved = project.body;
    body.value = project.body;
    $("saved-at").textContent = `저장 ${formatDateTime(project.updatedAt)}`;
    notify("저장했어요. 배포하면 상세 페이지에 반영돼요", "info");
  } catch (error) {
    if (error instanceof ApiError) {
      const issue = error.issues.find((i) => i.field === "body");
      if (issue && target) target.textContent = issue.message;
      notify(error.message);
    } else notify("저장하지 못했어요");
  } finally {
    busy = false;
    refresh();
  }
}

async function load() {
  try {
    const project = await projectsApi.get(id);
    if (project.deletedAt !== null) throw new ApiError(409, "conflict", "휴지통에 있는 프로젝트예요. 먼저 되살려 주세요");
    /** @type {HTMLInputElement} */ ($("title")).value = project.title;
    $("preview-title").textContent = project.title;
    document.title = `${project.title} 본문 · taerim.page 관리자`;
    body.value = project.body;
    saved = project.body;
    $("saved-at").textContent = `저장 ${formatDateTime(project.updatedAt)}`;
  } catch (error) {
    $("loading").textContent = error instanceof ApiError ? error.message : "프로젝트를 불러오지 못했어요.";
    return;
  }
  $("loading").hidden = true;
  editor.hidden = false;
  setPreviewOpen(initialPreviewState());
  refresh();
  body.focus();
}

// ── 이벤트 ──────────────────────────────────────────

body.addEventListener("input", refresh);
saveButton.addEventListener("click", () => void save());
previewToggle.addEventListener("click", () => setPreviewOpen(editor.dataset.preview !== "open", { remember: true }));
narrowScreen.addEventListener("change", () => setPreviewOpen(initialPreviewState()));
bindIndent(body);
bindShortcuts(body);
bindImageUpload({ textarea: body, button: /** @type {HTMLButtonElement} */ ($("image-button")), fileInput: /** @type {HTMLInputElement} */ ($("image-file")) });
bindCodeCopy(preview);
bindCalloutHelp("ko");

window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void save();
  }
  if (event.key === "Escape" && narrowScreen.matches && editor.dataset.preview === "open" && !document.querySelector("dialog[open]")) setPreviewOpen(false);
});

window.addEventListener("beforeunload", (event) => {
  if (!isDirty()) return;
  event.preventDefault();
  event.returnValue = "";
});

clearNotice();
void load();
