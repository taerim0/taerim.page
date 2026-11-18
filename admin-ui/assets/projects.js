// @ts-check
/**
 * 프로젝트 화면 (/projects, 설계 18)
 * - 왼쪽 목록(보이는 순서)에서 고르면 오른쪽에서 고침, [+ 새 프로젝트]는 빈 칸
 * - ▲▼ = 순서 바꾸기 (바로 저장). 새 프로젝트는 맨 앞
 * - 저장 = 새 것이면 POST, 있던 거면 PUT. 칸별 오류는 칸 아래. 공개 사이트는 [배포]해야 바뀜
 * - 태그는 글·노트와 같은 태그 (이미 있는 태그는 datalist로 고르기). 상하관계는 태그 화면에서
 * - [휴지통으로] → 왼쪽 아래 휴지통에서 되살리기·완전 삭제
 * - 저장 안 하고 다른 프로젝트로 가거나 떠나면 확인
 */
import { ApiError, listTags, projectsApi } from "./api.js";
import { uploadImageFile } from "./image-upload.js";
import { charCount, normalizeTag } from "./lib.js";
import { clearNotice, confirmDialog, el, formatDateTime, notify } from "./ui.js";

/** @typedef {import("./api.js").Project} Project */
/** @typedef {import("./api.js").ProjectInput} ProjectInput */

const TEXT_FIELDS = /** @type {const} */ (["title", "summary", "startedOn", "endedOn", "status", "repoUrl", "siteUrl", "thumbnail", "body"]);
/** 서버 제한과 같게 (src/projects/projects.ts PROJECT_LIMITS) */
const LIMITS = { title: 100, summary: 200, body: 50000 };
const TAG_COUNT = 10;
const STATUS_NAMES = { active: "진행 중", done: "끝남", paused: "쉬는 중" };

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const form = /** @type {HTMLFormElement} */ ($("project-form"));
const inputs = /** @type {Record<typeof TEXT_FIELDS[number], HTMLInputElement>} */ (Object.fromEntries(TEXT_FIELDS.map((field) => [field, $(field)])));
const visibleBox = /** @type {HTMLInputElement} */ ($("visible"));
const tagInput = /** @type {HTMLInputElement} */ ($("tag-input"));
const saveButton = /** @type {HTMLButtonElement} */ ($("save"));
const deleteButton = /** @type {HTMLButtonElement} */ ($("delete"));

/** @type {Project[]} */
let projects = [];
/** @type {Project[]} */
let trash = [];
/** 지금 고치는 프로젝트 (새 것이면 null) @type {Project | null} */
let current = null;
/** @type {string[]} */
let tags = [];
/** 마지막으로 저장된(또는 불러온) 값 (비교용 글자) */
let saved = "";
let busy = false;

const snapshot = () => JSON.stringify(currentInput());
const isDirty = () => snapshot() !== saved;

/** 지금 칸 값 → 서버에 보낼 모양 (빈 칸은 null) @returns {ProjectInput} */
function currentInput() {
  const optional = (/** @type {string} */ value) => (value.trim() === "" ? null : value.trim());
  return {
    title: inputs.title.value,
    summary: optional(inputs.summary.value),
    thumbnail: optional(inputs.thumbnail.value),
    startedOn: inputs.startedOn.value,
    endedOn: optional(inputs.endedOn.value),
    status: /** @type {ProjectInput["status"]} */ (inputs.status.value),
    repoUrl: optional(inputs.repoUrl.value),
    siteUrl: optional(inputs.siteUrl.value),
    body: inputs.body.value,
    tags: [...tags],
    visible: visibleBox.checked,
  };
}

/** 이번 달 YYYY-MM (한국) */
function thisMonth() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date()).slice(0, 7);
}

/** 칸 채우기 @param {Project | null} project */
function fill(project) {
  current = project;
  inputs.title.value = project?.title ?? "";
  inputs.summary.value = project?.summary ?? "";
  inputs.startedOn.value = project?.startedOn ?? thisMonth();
  inputs.endedOn.value = project?.endedOn ?? "";
  inputs.status.value = project?.status ?? "active";
  inputs.repoUrl.value = project?.repoUrl ?? "";
  inputs.siteUrl.value = project?.siteUrl ?? "";
  inputs.thumbnail.value = project?.thumbnail ?? "";
  inputs.body.value = project?.body ?? "";
  visibleBox.checked = project?.visible ?? true;
  tags = [...(project?.tags ?? [])];
  saved = snapshot();
  $("editing-label").textContent = project ? `프로젝트 #${project.id} 고치기` : "새 프로젝트";
  $("saved-at").textContent = project ? `저장 ${formatDateTime(project.updatedAt)}` : "";
  deleteButton.hidden = project === null;
  clearErrors();
  renderList();
  refresh();
}

function refresh() {
  $("dirty-mark").hidden = !isDirty();
  saveButton.disabled = busy || (current !== null && !isDirty());
  deleteButton.disabled = busy;
  for (const [field, max] of Object.entries(LIMITS)) {
    const target = document.querySelector(`[data-count-for="${field}"]`);
    if (!target) continue;
    const count = charCount(inputs[/** @type {keyof typeof LIMITS} */ (field)].value);
    target.textContent = `${count.toLocaleString("ko-KR")} / ${max.toLocaleString("ko-KR")}자`;
    target.className = `count${count > max ? " over" : count > max * 0.9 ? " warn" : ""}`;
  }
  const tagCount = document.querySelector('[data-count-for="tags"]');
  if (tagCount) tagCount.textContent = `${tags.length} / ${TAG_COUNT}개`;
  renderTags();
  renderThumb();
}

function renderTags() {
  $("tag-chips").replaceChildren(
    ...tags.map((tag) => el("button", { type: "button", class: "chip", title: "누르면 빼기", onClick: () => removeTag(tag) }, `#${tag} ×`)),
  );
}

/** @param {string} text */
function addTag(text) {
  const tag = normalizeTag(text.replace(/^#/, ""));
  if (!tag || tags.includes(tag)) return;
  if (tags.length >= TAG_COUNT) {
    const target = document.querySelector('[data-error-for="tags"]');
    if (target) target.textContent = `태그는 ${TAG_COUNT}개까지예요`;
    return;
  }
  tags = [...tags, tag];
  refresh();
}

/** @param {string} tag */
function removeTag(tag) {
  tags = tags.filter((t) => t !== tag);
  refresh();
}

/** 대표 이미지 작은 미리보기 (3:1로 잘린 모양) */
function renderThumb() {
  const value = inputs.thumbnail.value.trim();
  const ok = value.startsWith("/images/") || value.startsWith("https://");
  $("thumb-preview").hidden = !ok;
  const img = /** @type {HTMLImageElement} */ ($("thumb-img"));
  if (ok && img.getAttribute("src") !== value) img.src = value;
}

/** 목록: 줄마다 이름 · 상태 · 기간 · 숨김 + ▲▼ */
function renderList() {
  const list = $("project-list");
  list.replaceChildren(
    ...projects.map((project, index) => {
      const open = el(
        "button",
        { type: "button", class: "activity-item project-item", "aria-current": project.id === current?.id ? "true" : "false", onClick: () => void openProject(project) },
        el("span", { class: "activity-item-title" }, project.title),
        el("span", { class: "project-item-meta" }, `${STATUS_NAMES[project.status]} · ${project.startedOn.replace("-", ".")} ~ ${project.endedOn ? project.endedOn.replace("-", ".") : ""}${project.visible ? "" : " · 숨김"}`),
      );
      const move = (/** @type {number} */ step, /** @type {string} */ label) =>
        el("button", { type: "button", class: "project-move", "aria-label": `${project.title} ${label}`, title: label, disabled: busy || index + step < 0 || index + step >= projects.length, onClick: () => void moveProject(index, step) }, step < 0 ? "▲" : "▼");
      return el("li", { class: "project-row" }, open, el("span", { class: "project-moves" }, move(-1, "앞으로"), move(1, "뒤로")));
    }),
  );
  $("project-empty").hidden = projects.length > 0;
  // 휴지통
  $("project-trash").hidden = trash.length === 0;
  $("trash-count").textContent = `${trash.length}개`;
  $("trash-list").replaceChildren(
    ...trash.map((project) =>
      el(
        "li",
        { class: "project-trash-row" },
        el("span", { class: "activity-item-title" }, project.title),
        el("button", { type: "button", class: "button", disabled: busy, onClick: () => void restoreProject(project) }, "되살리기"),
        el("button", { type: "button", class: "button danger", disabled: busy, onClick: () => void purgeProject(project) }, "완전 삭제"),
      ),
    ),
  );
}

/** 다른 프로젝트(또는 새 것)로 — 고친 게 있으면 확인 @param {Project | null} project */
async function openProject(project) {
  if (project !== null && project.id === current?.id) return;
  if (isDirty()) {
    const leave = await confirmDialog({ title: "저장하지 않은 내용이 있어요", message: "저장하지 않고 넘어가면 고친 내용이 사라져요.", confirmLabel: "버리고 넘어가기" });
    if (!leave) return;
  }
  fill(project);
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
  }
  notify(error.issues.length > 0 ? "입력을 확인해 주세요" : error.message);
}

/** 목록·휴지통 다시 받기 */
async function reload() {
  [projects, trash] = await Promise.all([projectsApi.list(), projectsApi.list({ deleted: true })]);
}

/** 바쁜 동안 버튼 잠그고 실행 @param {() => Promise<void>} task @param {string} fallback */
async function run(task, fallback) {
  if (busy) return;
  busy = true;
  refresh();
  renderList();
  try {
    await task();
  } catch (error) {
    showError(error, fallback);
  } finally {
    busy = false;
    refresh();
    renderList();
  }
}

async function save() {
  if (busy || saveButton.disabled) return;
  clearErrors();
  await run(async () => {
    const result = current ? await projectsApi.update(current.id, currentInput()) : await projectsApi.create(currentInput());
    await reload();
    fill(result);
    notify("저장했어요. 배포하면 공개 사이트에 반영돼요", "info");
  }, "저장하지 못했어요");
}

/** @param {number} index @param {number} step */
async function moveProject(index, step) {
  const ids = projects.map((project) => project.id);
  const target = index + step;
  if (target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [/** @type {number} */ (ids[target]), /** @type {number} */ (ids[index])];
  await run(async () => {
    projects = await projectsApi.reorder(ids);
  }, "순서를 바꾸지 못했어요");
}

async function remove() {
  if (!current) return;
  const target = current;
  const ok = await confirmDialog({ title: "휴지통으로 옮길까요?", message: `"${target.title}" — 왼쪽 아래 휴지통에서 되살릴 수 있어요. 공개 사이트는 배포하면 빠져요.`, confirmLabel: "휴지통으로" });
  if (!ok) return;
  await run(async () => {
    await projectsApi.remove(target.id);
    await reload();
    fill(null);
    notify("휴지통으로 옮겼어요", "info");
  }, "옮기지 못했어요");
}

/** @param {Project} project */
async function restoreProject(project) {
  await run(async () => {
    const restored = await projectsApi.restore(project.id);
    await reload();
    if (!isDirty()) fill(restored);
    notify("되살렸어요 (맨 앞)", "info");
  }, "되살리지 못했어요");
}

/** @param {Project} project */
async function purgeProject(project) {
  const ok = await confirmDialog({ title: "완전히 지울까요?", message: `"${project.title}" — 되돌릴 수 없어요.`, confirmLabel: "완전 삭제" });
  if (!ok) return;
  await run(async () => {
    await projectsApi.purge(project.id);
    await reload();
    notify("완전히 지웠어요", "info");
  }, "지우지 못했어요");
}

async function load() {
  try {
    await reload();
    const nodes = await listTags().catch(() => []);
    $("tag-options").replaceChildren(...nodes.map((/** @type {{ name: string }} */ node) => el("option", { value: node.name })));
  } catch (error) {
    $("loading").textContent = "프로젝트를 불러오지 못했어요.";
    showError(error, "프로젝트를 불러오지 못했어요");
    return;
  }
  $("loading").hidden = true;
  $("projects").hidden = false;
  fill(null);
}

// ── 이벤트 ──────────────────────────────────────────

for (const field of TEXT_FIELDS) inputs[field].addEventListener("input", refresh);
visibleBox.addEventListener("change", refresh);
tagInput.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  if (event.key === "Enter" || event.key === ",") {
    event.preventDefault();
    addTag(tagInput.value);
    tagInput.value = "";
  }
});
// datalist에서 고르면 바로 더하기
tagInput.addEventListener("change", () => {
  if (!tagInput.value.trim()) return;
  addTag(tagInput.value);
  tagInput.value = "";
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  void save();
});
deleteButton.addEventListener("click", () => void remove());
$("new-project").addEventListener("click", () => void openProject(null));

// 대표 이미지 올리기: 지금 이미지 올리기 그대로 (WebP로 줄여서) → 칸에 주소
const thumbFile = /** @type {HTMLInputElement} */ ($("thumb-file"));
$("thumb-button").addEventListener("click", () => thumbFile.click());
thumbFile.addEventListener("change", async () => {
  const file = thumbFile.files?.[0];
  thumbFile.value = "";
  if (!file) return;
  try {
    inputs.thumbnail.value = await uploadImageFile(file);
    refresh();
  } catch (error) {
    notify(error instanceof Error ? error.message : "이미지를 올리지 못했어요");
  }
});

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
