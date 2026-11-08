// @ts-check
/**
 * 글 쓰기·편집 화면 (/posts/new, /posts/edit/:id)
 *
 * - 상태 3가지: 초안 / 공개 / 공개 + 작업본. 작업본이 있으면 편집기에 작업본 내용을 띄운다
 * - 저장은 **바뀐 칸만** 보낸다. 새 글은 처음 저장할 때 만들고 주소를 /posts/edit/{id}로 바꾼다
 * - 저장 안 한 변경이 있을 때 공개하기·수정본 반영 → 먼저 저장하고 이어서 실행
 * - 미리보기: 입력 중에는 바뀐 블록만, 입력이 멈추면 전체를 한 번 렌더링
 * - 글자 수는 서버와 같은 방식(charCount)으로 세고, 제한값은 서버(GET /api/limits)에서 받는다
 */
import { ApiError, getLimits, postsApi } from "./api.js";
import { blockIndexAt, charCount, createBlockPreview, isAllowedTag, normalizeTag, normalizeTags, renderMarkdown, TAG_CHARS_MESSAGE } from "./lib.js";
import { bindImageUpload } from "./image-upload.js";
import { bindTagInput, clearNotice, confirmDialog, el, flash, formatDateTime, notify } from "./ui.js";

/** @typedef {import("./api.js").Post} Post */
/** @typedef {import("./api.js").PostDraft} PostDraft */
/** @typedef {import("./api.js").PostInput} PostInput */
/** @typedef {import("./api.js").PostPatch} PostPatch */
/** @typedef {import("./api.js").Limits} Limits */

/** 고칠 수 있는 칸 이름 (서버의 칸별 오류 field와 같은 이름) */
/** @typedef {"title" | "body" | "summary" | "thumbnail" | "tags"} Field */

/**
 * 편집기의 값. 서버와 비교할 수 있게 **서버가 저장할 모양으로 정리한 값**이다.
 * (제목·소개·이미지 주소는 앞뒤 공백 없이, 빈 소개·이미지는 "", 태그는 정리·이름순)
 * @typedef {{ title: string, body: string, summary: string, thumbnail: string, tags: string[] }} Values
 */

/**
 * 화면 상태
 * - new: 아직 저장 안 한 새 글
 * - draft: 초안
 * - published: 공개 (작업본 없음) → 저장하면 작업본이 생김
 * - editing: 공개 + 작업본
 * @typedef {"new" | "draft" | "published" | "editing"} Mode
 */

const FIELDS = /** @type {const} */ (["title", "body", "summary", "thumbnail", "tags"]);

// ── 화면 요소 ────────────────────────────────────────

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const inputs = {
  title: /** @type {HTMLInputElement} */ ($("title")),
  body: /** @type {HTMLTextAreaElement} */ ($("body")),
  summary: /** @type {HTMLInputElement} */ ($("summary")),
  thumbnail: /** @type {HTMLInputElement} */ ($("thumbnail")),
};
const tagInput = /** @type {HTMLInputElement} */ ($("tag-input"));
const tagChips = $("tag-chips");
const editor = $("editor");
const preview = $("preview");
const previewPane = $("preview-pane");
const previewTitle = $("preview-title");
const previewToggle = /** @type {HTMLButtonElement} */ ($("preview-toggle"));
const previewClose = /** @type {HTMLButtonElement} */ ($("preview-close"));
const buttons = {
  save: /** @type {HTMLButtonElement} */ ($("save")),
  publish: /** @type {HTMLButtonElement} */ ($("publish")),
  unpublish: /** @type {HTMLButtonElement} */ ($("unpublish")),
  apply: /** @type {HTMLButtonElement} */ ($("apply")),
  discard: /** @type {HTMLButtonElement} */ ($("discard")),
  trash: /** @type {HTMLButtonElement} */ ($("trash")),
};

// ── 상태 ────────────────────────────────────────────

/** 글 번호. 새 글이면 처음 저장하기 전까지 null */
let postId = /** @type {number | null} */ (null);
let mode = /** @type {Mode} */ ("new");
/** 공개본 (수정본 버리기 때 편집기를 되돌릴 내용). 새 글이면 null */
let publishedPost = /** @type {Post | null} */ (null);
/** 서버에 마지막으로 저장된 값 (편집 중인 쪽: 초안이면 글, 공개 글이면 작업본 또는 공개본) */
let saved = emptyValues();
/** 마지막 저장 시각 */
let savedAt = /** @type {string | null} */ (null);
/** 지금 태그 (띄어쓰기·엔터로 완성한 것만. 태그 칸에 치다 만 글자는 넣지 않는다) */
let tags = /** @type {string[]} */ ([]);
/** 요청 중이면 버튼을 잠근다 (두 번 누르기 방지) */
let busy = false;
/** 휴지통으로 보낸 뒤 목록으로 갈 때는 "떠날까요?" 경고를 하지 않는다 */
let leaving = false;
/** @type {Limits} */
let limits;

/** @returns {Values} */
function emptyValues() {
  return { title: "", body: "", summary: "", thumbnail: "", tags: [] };
}

/** 서버의 글·작업본 → 편집기 값 @param {Post | PostDraft} source @returns {Values} */
function toValues(source) {
  return {
    title: source.title,
    body: source.body,
    summary: source.summary ?? "",
    thumbnail: source.thumbnail ?? "",
    tags: [...source.tags],
  };
}

/** 지금 편집기 값 (서버와 같은 방식으로 정리) @returns {Values} */
function currentValues() {
  return {
    title: inputs.title.value.trim(),
    body: inputs.body.value,
    summary: inputs.summary.value.trim(),
    thumbnail: inputs.thumbnail.value.trim(),
    tags: normalizeTags(tags),
  };
}

/** @param {Values} a @param {Values} b @param {Field} field */
function sameField(a, b, field) {
  return field === "tags" ? a.tags.join("\n") === b.tags.join("\n") : a[field] === b[field];
}

/** 저장 이후 바뀐 칸 @returns {Field[]} */
function changedFields() {
  const now = currentValues();
  return FIELDS.filter((field) => !sameField(now, saved, field));
}

const isDirty = () => changedFields().length > 0;

// ── 불러오기 ─────────────────────────────────────────

/** 주소에서 글 번호 읽기. /posts/new 면 null */
function idFromPath() {
  const match = /^\/posts\/edit\/([1-9][0-9]*)$/.exec(location.pathname);
  return match ? Number(match[1]) : null;
}

async function load() {
  const id = idFromPath();
  try {
    const [limitValues, forEdit] = await Promise.all([getLimits(), id === null ? null : postsApi.get(id)]);
    limits = limitValues;
    if (forEdit) {
      postId = forEdit.post.id;
      setFromServer(forEdit.post, forEdit.draft, { overwriteInputs: true });
    } else {
      setMode("new");
    }
  } catch (error) {
    $("loading").textContent =
      error instanceof ApiError && error.code === "not_found"
        ? "글을 찾을 수 없어요. 휴지통에 있거나 지워진 글일 수 있어요."
        : "글을 불러오지 못했어요.";
    if (!(error instanceof ApiError && error.code === "not_found")) showError(error);
    return;
  }
  $("loading").hidden = true;
  editor.hidden = false;
  renderTags();
  setPreviewOpen(initialPreviewState()); // 열려 있으면 전체 렌더링까지
  refresh();
  inputs.title.focus();
}

/**
 * 서버에서 받은 글(+작업본)로 상태를 맞춘다.
 * overwriteInputs가 false면, 요청을 보내는 동안 사용자가 또 고친 칸은 건드리지 않고
 * 보낸 그대로인 칸만 서버 값으로 바꾼다. (서버가 공백·태그를 정리한 결과를 보여주기 위해)
 * @param {Post} post
 * @param {PostDraft | null} draft
 * @param {{ overwriteInputs: boolean, sent?: Values }} options
 */
function setFromServer(post, draft, { overwriteInputs, sent }) {
  publishedPost = post.status === "published" ? post : null;
  const source = draft ?? post;
  const next = toValues(source);
  const before = currentValues();

  for (const field of FIELDS) {
    const untouched = overwriteInputs || (sent !== undefined && sameField(before, sent, field));
    if (!untouched) continue;
    if (field === "tags") tags = [...next.tags];
    else inputs[field].value = next[field];
  }
  saved = next;
  savedAt = source.updatedAt;
  setMode(post.status === "draft" ? "draft" : draft ? "editing" : "published");
  renderTags();
}

// ── 화면 그리기 ──────────────────────────────────────

/** @param {Mode} next */
function setMode(next) {
  mode = next;
  const pill = $("status-pill");
  pill.className = `pill ${mode === "new" || mode === "draft" ? "draft" : "published"}`;
  pill.textContent = { new: "새 글", draft: "초안", published: "공개", editing: "공개 · 수정 중" }[mode];

  const help = $("state-help");
  help.textContent =
    mode === "published"
      ? "공개된 글이에요. 저장하면 수정본으로 임시저장되고, 반영하기 전까지 공개 사이트는 그대로예요."
      : mode === "editing"
        ? "반영하지 않은 수정본이 있어요. 편집기에는 수정본이 열려 있어요."
        : "";
  help.hidden = help.textContent === "";

  // 상태별 버튼 (설계 8-1 표)
  buttons.publish.hidden = !(mode === "new" || mode === "draft");
  buttons.unpublish.hidden = mode !== "published";
  buttons.apply.hidden = mode !== "editing";
  buttons.discard.hidden = mode !== "editing";
  buttons.trash.hidden = mode === "new";
}

/** 입력할 때마다: 글자 수, 저장 안 됨 표시, 버튼 켜고 끄기, 미리보기 제목 */
function refresh() {
  const now = currentValues();
  const over = renderCounts(now);
  const dirty = isDirty();

  $("dirty-mark").hidden = !dirty;
  $("saved-at").textContent = savedAt ? `저장 ${formatDateTime(savedAt)}` : "";
  previewTitle.textContent = now.title;
  document.title = `${now.title || "새 글"} · taerim.page 관리자`;

  // 제목이 비었거나 넘친 칸이 있으면 저장·공개 모두 불가 (서버도 거절할 내용)
  const blocked = busy || now.title === "" || over;
  buttons.save.disabled = blocked || !dirty;
  buttons.publish.disabled = blocked;
  buttons.apply.disabled = blocked;
  buttons.unpublish.disabled = busy;
  buttons.discard.disabled = busy;
  buttons.trash.disabled = busy;
}

/**
 * 칸별 "n / 최대". 90% 넘으면 주의, 넘치면 경고. 넘친 칸이 하나라도 있으면 true
 * @param {Values} now
 */
function renderCounts(now) {
  const fmt = (/** @type {number} */ n) => n.toLocaleString("ko-KR");
  let over = false;

  /** @param {Field} field @param {number} count @param {number} max @param {string} unit */
  const show = (field, count, max, unit) => {
    const target = document.querySelector(`[data-count-for="${field}"]`);
    if (!target) return;
    const exceeded = count > max;
    over ||= exceeded;
    target.textContent = `${fmt(count)} / ${fmt(max)}${unit}${exceeded ? ` (${fmt(count - max)}${unit} 초과)` : ""}`;
    target.className = `count${exceeded ? " over" : count > max * 0.9 ? " warn" : ""}`;
  };

  show("title", charCount(now.title), limits.title, "자");
  show("body", charCount(now.body), limits.body, "자");
  show("summary", charCount(now.summary), limits.summary, "자");
  show("thumbnail", charCount(now.thumbnail), limits.thumbnail, "자");
  show("tags", now.tags.length, limits.tagCount, "개");
  // 태그 하나가 너무 길면 그 태그 칩에 표시 (renderTags) + 저장 불가
  over ||= now.tags.some((tag) => charCount(tag) > limits.tagLength || !isAllowedTag(tag));
  return over;
}

function renderTags() {
  tagChips.replaceChildren(
    ...tags.map((tag) => {
      const tooLong = charCount(tag) > limits.tagLength;
      const badChars = !isAllowedTag(tag);
      return el(
        "button",
        {
          type: "button",
          class: `chip${tooLong || badChars ? " over" : ""}`,
          title: badChars
            ? `${TAG_CHARS_MESSAGE} (눌러서 빼기)`
            : tooLong
              ? `태그는 ${limits.tagLength}자까지예요 (눌러서 빼기)`
              : `${tag} 빼기`,
          onClick: () => {
            tags = tags.filter((t) => t !== tag);
            onEdit("tags");
          },
        },
        `#${tag} ×`,
      );
    }),
  );
}

// ── 미리보기 (B + D) ─────────────────────────────────

const blockPreview = createBlockPreview(renderMarkdown);
/** 입력이 이만큼 멈추면 전체를 한 번 렌더링 (블록 방식의 차이를 바로잡음) */
const FULL_RENDER_DELAY = 1500;
let fullRenderTimer = 0;
let previewFrame = 0;
/** 마지막으로 본문을 입력한 시각. 입력 때문에 생긴 스크롤은 비율 맞추기에서 뺀다 */
let lastEditAt = 0;

const isPreviewOpen = () => editor.dataset.preview === "open";

/**
 * 입력 중: 화면을 그리기 직전에 한 번만 바뀐 블록을 렌더링하고, 멈추면 전체 렌더링 예약.
 * 미리보기가 닫혀 있으면 렌더링하지 않는다 (열 때 전체 렌더링)
 */
function schedulePreview() {
  lastEditAt = performance.now();
  if (!isPreviewOpen()) return;
  if (!previewFrame) {
    previewFrame = requestAnimationFrame(() => {
      previewFrame = 0;
      // 블록마다 번호 표시(div)를 달아서 고친 블록을 찾는다. div는 여백이 없어 보이는 모양은 그대로
      // 내용은 렌더러가 HTML을 막고 안전하게 만든 결과
      preview.innerHTML = blockPreview(inputs.body.value)
        .parts.map((html, index) => `<div data-block="${index}">${html}</div>`)
        .join("");
      followEdit();
    });
  }
  clearTimeout(fullRenderTimer);
  fullRenderTimer = window.setTimeout(renderPreviewNow, FULL_RENDER_DELAY);
}

/** 전체 렌더링 (= 빌드 결과와 같음). 스크롤 위치는 그대로 둔다 */
function renderPreviewNow() {
  cancelAnimationFrame(previewFrame);
  previewFrame = 0;
  clearTimeout(fullRenderTimer);
  if (!isPreviewOpen()) return;
  preview.innerHTML = renderMarkdown(inputs.body.value);
}

/** 편집 따라가기: 커서가 있는 블록이 미리보기 화면 밖이면 가운데로 (보이고 있으면 그대로) */
function followEdit() {
  const index = blockIndexAt(inputs.body.value, inputs.body.selectionStart);
  const target = preview.querySelector(`[data-block="${index}"]`);
  if (!target) return;
  const pane = previewPane.getBoundingClientRect();
  const box = target.getBoundingClientRect();
  const fullyVisible = box.top >= pane.top && box.bottom <= pane.bottom;
  // 화면보다 긴 블록(긴 코드 블록 등)은 조금이라도 보이면 그대로 (계속 튀지 않게)
  const tallAndPartlyVisible = box.height > pane.height && box.bottom > pane.top && box.top < pane.bottom;
  if (fullyVisible || tallAndPartlyVisible) return;
  previewPane.scrollTop += box.top - pane.top - (pane.height - box.height) / 2;
}

/** 비율 맞추기: 입력 없이 본문을 스크롤하면 미리보기도 같은 비율로 (맨 위↔맨 위, 맨 아래↔맨 아래) */
function syncScroll() {
  if (!isPreviewOpen() || performance.now() - lastEditAt < 300) return;
  const body = inputs.body;
  const max = body.scrollHeight - body.clientHeight;
  const ratio = max > 0 ? body.scrollTop / max : 0;
  previewPane.scrollTop = ratio * (previewPane.scrollHeight - previewPane.clientHeight);
}

// ── 미리보기 사이드바 열고 닫기 ──────────────────────────
// 넓은 화면: 처음엔 열림(나란히), 열고 닫은 상태를 기억. 좁은 화면: 처음엔 닫힘, 열면 쓰기 칸 위를 덮음

const narrowScreen = matchMedia("(max-width: 899px)");
const PREVIEW_PREF_KEY = "admin-preview-wide";

/** 넓은 화면에서 마지막으로 고른 상태 (저장이 막힌 브라우저면 열림) */
function widePreference() {
  try {
    return localStorage.getItem(PREVIEW_PREF_KEY) !== "closed";
  } catch {
    return true;
  }
}

/** @param {boolean} open @param {{ remember?: boolean }} [options] remember: 사용자가 버튼으로 바꾼 것 */
function setPreviewOpen(open, { remember = false } = {}) {
  editor.dataset.preview = open ? "open" : "closed";
  previewToggle.setAttribute("aria-expanded", String(open));
  previewToggle.textContent = open ? "미리보기 숨기기" : "미리보기 보기";
  if (remember && !narrowScreen.matches) {
    try {
      localStorage.setItem(PREVIEW_PREF_KEY, open ? "open" : "closed");
    } catch {
      // 기억 못 해도 동작에는 문제없음
    }
  }
  if (open) {
    renderPreviewNow(); // 닫혀 있는 동안 밀린 내용 반영
    syncScroll();
  }
}

const initialPreviewState = () => (narrowScreen.matches ? false : widePreference());

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
  // 칸에 붙일 수 없는 오류, 또는 입력 오류가 아닌 것(상태 충돌·연결 실패 등)은 위쪽에
  if (fieldIssues.length === 0) notify(error.message);
  else notify("입력을 확인해 주세요");
}

/** @param {Field} [field] 생략하면 전부 */
function clearErrors(field) {
  const selector = field ? `[data-error-for="${field}"]` : "[data-error-for]";
  for (const target of document.querySelectorAll(selector)) target.textContent = "";
}

// ── 동작 ────────────────────────────────────────────

/**
 * 요청 하나를 잠금 상태로 실행. 성공하면 true
 * @param {() => Promise<void>} task
 */
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

/**
 * 저장. 새 글이면 만들고, 아니면 바뀐 칸만 보낸다. 성공하면(또는 바꿀 게 없으면) true
 * @param {{ quiet?: boolean }} [options] quiet: 이어서 다른 동작을 할 때 "저장했어요" 알림 생략
 */
async function save({ quiet = false } = {}) {
  if (postId !== null && !isDirty()) return true;
  const sent = currentValues();

  return run(async () => {
    if (postId === null) {
      /** @type {Partial<PostInput>} */
      const input = { ...sent, summary: sent.summary || null, thumbnail: sent.thumbnail || null };
      const post = await postsApi.create(input);
      postId = post.id;
      // 새로고침해도 이 글이 열리게. 뒤로 가기 기록은 남기지 않는다 (/posts/new로 돌아가 같은 글을 또 만들지 않게)
      history.replaceState(null, "", `/posts/edit/${post.id}`);
      setFromServer(post, null, { overwriteInputs: false, sent });
    } else {
      /** @type {PostPatch} */
      const patch = {};
      for (const field of changedFields()) {
        if (field === "tags") patch.tags = sent.tags;
        else if (field === "summary" || field === "thumbnail") patch[field] = sent[field] || null;
        else patch[field] = sent[field];
      }
      const result = await postsApi.save(postId, patch);
      if (result.savedTo === "post") setFromServer(result.post, null, { overwriteInputs: false, sent });
      else if (publishedPost) setFromServer(publishedPost, result.draft, { overwriteInputs: false, sent });
    }
    if (!quiet) notify("저장했어요", "info");
  });
}

/** 공개하기: 저장 안 한 변경이 있으면 먼저 저장 */
async function publish() {
  if (!(await save({ quiet: true })) || postId === null) return;
  const id = postId;
  await run(async () => {
    const post = await postsApi.publish(id);
    setFromServer(post, null, { overwriteInputs: false, sent: saved });
    notify("공개했어요. 배포하면 공개 사이트에 나가요", "info");
  });
}

/** 수정본 반영: 저장 안 한 변경이 있으면 먼저 저장(→ 작업본) 후 반영 */
async function applyEdits() {
  if (!(await save({ quiet: true })) || postId === null) return;
  const id = postId;
  await run(async () => {
    const post = await postsApi.applyEdits(id);
    setFromServer(post, null, { overwriteInputs: false, sent: saved });
    notify("수정본을 반영했어요", "info");
  });
}

async function unpublish() {
  if (postId === null) return;
  const id = postId;
  await run(async () => {
    const post = await postsApi.unpublish(id);
    // 공개본 = 편집 중인 내용이라 저장된 값은 그대로. 저장 안 한 변경도 그대로 둔다 (sent: saved)
    setFromServer(post, null, { overwriteInputs: false, sent: saved });
    notify("비공개(초안)로 바꿨어요", "info");
  });
}

/** 수정본 버리기: 작업본을 지우고 편집기를 공개본 내용으로 되돌린다 (저장 안 한 변경도 버려짐). 확인은 부르는 쪽(팝업)에서 */
async function discardEdits() {
  if (postId === null || !publishedPost) return;
  const id = postId;
  const post = publishedPost;
  await run(async () => {
    await postsApi.discardEdits(id);
    setFromServer(post, null, { overwriteInputs: true });
    renderPreviewNow();
    notify("수정본을 버렸어요", "info");
  });
}

async function moveToTrash() {
  if (postId === null) return;
  const id = postId;
  const ok = await run(() => postsApi.trash(id).then(() => {}));
  if (!ok) return;
  leaving = true;
  flash("휴지통으로 옮겼어요");
  location.assign("/");
}

/**
 * 위험한 버튼: 한 번 누르면 "정말 …?"으로 바뀌고, 3초 안에 한 번 더 눌러야 실행
 * @param {HTMLButtonElement} button
 * @param {string} confirmLabel
 * @param {() => Promise<void>} action
 */
function confirmTwice(button, confirmLabel, action) {
  const label = button.textContent ?? "";
  let timer = 0;
  const reset = () => {
    clearTimeout(timer);
    delete button.dataset.confirming;
    button.textContent = label;
  };
  button.addEventListener("click", () => {
    if (button.dataset.confirming) {
      reset();
      void action();
      return;
    }
    button.dataset.confirming = "true";
    button.textContent = confirmLabel;
    timer = window.setTimeout(reset, 3000);
  });
}

// ── 이벤트 ──────────────────────────────────────────

/** 칸을 고쳤을 때 공통 처리 @param {Field} field */
function onEdit(field) {
  clearErrors(field);
  if (field === "tags") renderTags();
  if (field === "body") schedulePreview();
  refresh();
}

inputs.title.addEventListener("input", () => onEdit("title"));
inputs.body.addEventListener("input", () => onEdit("body"));
inputs.summary.addEventListener("input", () => onEdit("summary"));
inputs.thumbnail.addEventListener("input", () => onEdit("thumbnail"));

/** 태그 하나 완성 @param {string} text */
function addTag(text) {
  const tag = normalizeTag(text);
  if (tag && !tags.includes(tag)) {
    tags = [...tags, tag];
    onEdit("tags");
  }
}

// 태그 입력: 띄어쓰기·엔터로 완성, 빈 칸 백스페이스로 마지막 태그 빼기 (한글 조합 처리는 ui.js)
bindTagInput(tagInput, {
  onAdd: addTag,
  onRemoveLast: () => {
    if (tags.length === 0) return;
    tags = tags.slice(0, -1);
    onEdit("tags");
  },
});

inputs.body.addEventListener("scroll", syncScroll);

// 이미지 올리기: 붙여넣기·끌어놓기·[이미지] 버튼 → 본문에 ![…](/images/…) (image-upload.js)
bindImageUpload({
  textarea: inputs.body,
  button: /** @type {HTMLButtonElement} */ ($("image-button")),
  fileInput: /** @type {HTMLInputElement} */ ($("image-file")),
});

previewToggle.addEventListener("click", () => setPreviewOpen(!isPreviewOpen(), { remember: true }));
previewClose.addEventListener("click", () => setPreviewOpen(false, { remember: true }));
// 창 크기가 넓은↔좁은 경계를 넘으면 그 크기의 처음 상태로
narrowScreen.addEventListener("change", () => setPreviewOpen(initialPreviewState()));
// 좁은 화면에서 덮고 있는 미리보기는 Esc로 닫기
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && narrowScreen.matches && isPreviewOpen()) setPreviewOpen(false);
});

buttons.save.addEventListener("click", () => void save());
buttons.publish.addEventListener("click", () => void publish());
buttons.apply.addEventListener("click", () => void applyEdits());
buttons.unpublish.addEventListener("click", () => void unpublish());
// 수정본 버리기는 되돌릴 수 없어서 가운데 팝업으로 확인 (휴지통은 되살릴 수 있어서 두 번 누르기)
buttons.discard.addEventListener("click", async () => {
  const ok = await confirmDialog({
    title: "수정본을 버릴까요?",
    message: "반영하지 않은 수정본이 지워지고, 편집기가 공개된 내용으로 돌아가요. 되돌릴 수 없어요.",
    confirmLabel: "버리기",
  });
  if (ok) await discardEdits();
});
confirmTwice(buttons.trash, "휴지통으로? (한 번 더)", moveToTrash);

// Ctrl+S (맥은 Cmd+S) = 저장. 브라우저의 "페이지 저장"은 막는다
window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    if (!buttons.save.disabled) void save();
  }
});

// 저장 안 한 변경이 있으면 떠날 때 브라우저가 확인 창을 띄운다
window.addEventListener("beforeunload", (event) => {
  if (leaving || !limits || !isDirty()) return;
  event.preventDefault();
  event.returnValue = ""; // 옛 브라우저용
});

clearNotice();
void load();
