// @ts-check
/**
 * 관리자 메인 = 글 목록 (/, 설계 16-11 · 시안 M-6)
 * - 위: 상태(전체·초안·공개·수정본 + 개수) · 찾기(제목, "#태그"는 태그로 거름) · [+ 새 글]
 * - 왼쪽 목록: 줄마다 제목 / 태그·고친 때, 오른쪽 칸에 상태·영어·조회. 카드 안 맨 아래 이전·다음
 * - 오른쪽 상세(넓은 화면): 줄을 누르면 고르기, 두 번 누르거나 Enter면 편집. ↑↓로 줄 옮기기
 *   좁은 화면(1000px 미만)은 상세 없이 줄을 누르면 바로 편집
 * - 조건·고른 글은 주소(?status=…&q=…&page=…&id=…)에 → 새로고침·뒤로 가기 그대로
 */
import { ApiError, postsApi, translationsApi, viewsApi } from "./api.js";
import { normalizeTag } from "./lib.js";
import { clearNotice, confirmDialog, el, formatDateTime, notify, setQuery, showFlash } from "./ui.js";

/** @typedef {import("./api.js").PostSummary} PostSummary */
/** @typedef {import("./api.js").TranslationListItem} TranslationListItem */
/** @typedef {"" | "draft" | "published" | "edited"} StatusFilter */
/** @typedef {"" | "post" | "note"} KindFilter 종류 (설계 17) */
/** 화면 상태 = 주소의 ?… @typedef {{ status: StatusFilter, kind: KindFilter, q: string, page: number, id: number | null }} ListState */

/** 공개 사이트 주소 ([사이트에서 보기]) */
const SITE_ORIGIN = "https://taerim.page";
/** 이 폭 이상이면 오른쪽 상세 (CSS의 .list-layout과 같게) */
const WIDE = matchMedia("(min-width: 1000px)");

/** @returns {ListState} */
function readState() {
  const params = new URLSearchParams(location.search);
  const status = params.get("status");
  const page = Number(params.get("page"));
  const id = Number(params.get("id"));
  return {
    status: status === "draft" || status === "published" || status === "edited" ? status : "",
    kind: params.get("kind") === "post" || params.get("kind") === "note" ? /** @type {KindFilter} */ (params.get("kind")) : "",
    q: params.get("q") ?? "",
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    id: Number.isInteger(id) && id >= 1 ? id : null,
  };
}

/** @param {ListState} state @param {{ replace?: boolean }} [options] */
function writeState(state, options = {}) {
  const params = new URLSearchParams();
  if (state.status) params.set("status", state.status);
  if (state.kind) params.set("kind", state.kind);
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.page > 1) params.set("page", String(state.page));
  if (state.id !== null) params.set("id", String(state.id));
  if (options.replace) {
    const search = params.toString();
    history.replaceState(null, "", search ? `?${search}` : location.pathname);
  } else setQuery(params);
}

/** 조건을 바꾸고 다시 그린다. 조건이 바뀌면 1쪽부터, 고른 글은 새로 @param {Partial<ListState>} change */
function update(change) {
  writeState({ ...readState(), page: 1, id: null, ...change });
  void render();
}

/** 찾기 글자 → 제목 글자 + 태그들 ("#react 훅" → q "훅", tags ["react"]) @param {string} text */
function parseSearch(text) {
  const tags = [];
  const words = [];
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    if (word.startsWith("#") && word.length > 1) {
      const tag = normalizeTag(word.slice(1));
      if (tag) tags.push(tag);
    } else words.push(word);
  }
  return { q: words.join(" "), tags: [...new Set(tags)] };
}

const list = /** @type {HTMLUListElement} */ (document.getElementById("post-list"));
const summary = /** @type {HTMLElement} */ (document.getElementById("summary"));
const pager = /** @type {HTMLElement} */ (document.getElementById("pager"));
const detail = /** @type {HTMLElement} */ (document.getElementById("detail"));
const search = /** @type {HTMLInputElement} */ (document.getElementById("search"));

/** 지금 쪽의 글들과 그 글의 영어·조회 (상세에 씀) */
let items = /** @type {PostSummary[]} */ ([]);
let translationById = /** @type {Map<number, TranslationListItem>} */ (new Map());
let viewsById = /** @type {Record<string, number>} */ ({});
/** 마지막 요청만 화면에 반영 (늦게 온 옛 응답이 덮어쓰지 않게) */
let renderCount = 0;

async function render() {
  const state = readState();
  const mine = ++renderCount;
  renderFilters(state);
  summary.textContent = "불러오는 중…";
  const { q, tags } = parseSearch(state.q);
  try {
    const [page, translations, views, counts] = await Promise.all([
      postsApi.list({
        status: state.status === "draft" || state.status === "published" ? state.status : undefined,
        kind: state.kind || undefined,
        edited: state.status === "edited" || undefined,
        q: q || undefined,
        tags,
        page: state.page,
      }),
      // 영어·조회·개수는 없어도 목록은 보이게
      translationsApi.list("en").catch(() => /** @type {TranslationListItem[]} */ ([])),
      viewsApi.get().catch(() => /** @type {Record<string, number>} */ ({})),
      postsApi.counts().catch(() => null),
    ]);
    if (mine !== renderCount) return;
    clearNotice();
    items = page.items;
    translationById = new Map(translations.map((item) => [item.postId, item]));
    viewsById = views;
    renderCounts(counts);
    summary.textContent =
      page.total === 0 ? (state.status || state.q.trim() ? "조건에 맞는 글이 없어요." : "아직 글이 없어요. ‘+ 새 글’로 첫 글을 써 보세요.") : "";
    summary.hidden = page.total !== 0;
    // 고른 글: 주소의 id가 이 쪽에 있으면 그것, 아니면 첫 줄
    const selected = items.find((post) => post.id === state.id) ?? items[0] ?? null;
    if (selected && selected.id !== state.id) writeState({ ...state, id: selected.id }, { replace: true });
    list.replaceChildren(...items.map((post) => postRow(post, post.id === selected?.id)));
    renderDetail(selected);
    renderPager(page.page, page.totalPages);
  } catch (error) {
    if (mine !== renderCount) return;
    summary.hidden = false;
    summary.textContent = "";
    list.replaceChildren();
    pager.replaceChildren();
    detail.hidden = true;
    notify(error instanceof ApiError ? error.message : "목록을 불러오지 못했어요");
  }
}

/** @param {ListState} state */
function renderFilters(state) {
  for (const button of document.querySelectorAll("[data-status]")) {
    button.setAttribute("aria-pressed", String(/** @type {HTMLElement} */ (button).dataset.status === state.status));
  }
  for (const button of document.querySelectorAll("[data-kind]")) {
    button.setAttribute("aria-pressed", String(/** @type {HTMLElement} */ (button).dataset.kind === state.kind));
  }
  if (document.activeElement !== search) search.value = state.q;
}

/** @param {import("../../src/posts/types.ts").PostCounts | null} counts */
function renderCounts(counts) {
  for (const slot of document.querySelectorAll("[data-count]")) {
    const key = /** @type {keyof import("../../src/posts/types.ts").PostCounts} */ (/** @type {HTMLElement} */ (slot).dataset.count);
    slot.textContent = counts ? String(counts[key]) : "";
  }
}

/** 영어 번역 상태 → [글자, 종류] @param {TranslationListItem | undefined} t @returns {[string, string]} */
function englishState(t) {
  if (!t || (!t.published && !t.hasDraft)) return ["없음", "none"];
  if (t.published) return t.outdated ? ["원문 바뀜", "outdated"] : ["번역됨", "done"];
  return ["초안", "draft"];
}

/** 상태 표시 (공개·초안 + 수정본) @param {PostSummary} post */
function statusPills(post) {
  return [
    post.kind === "note" ? el("span", { class: "pill note", title: "노트 (공부 정리, 설계 17)" }, "노트") : "",
    el("span", { class: `pill ${post.status}` }, post.status === "published" ? "공개" : "초안"),
    post.hasDraft ? el("span", { class: "pill editing", title: "반영하지 않은 수정본이 있어요" }, "수정본") : "",
  ];
}

/** 목록 한 줄 @param {PostSummary} post @param {boolean} selected */
function postRow(post, selected) {
  const [english, kind] = englishState(translationById.get(post.id));
  const views = viewsById[String(post.id)];
  const link = el(
    "a",
    { class: "admin-row", href: `/posts/edit/${post.id}`, "data-id": String(post.id), "aria-current": selected ? "true" : "false" },
    el(
      "span",
      { class: "row-main" },
      el("span", { class: "row-title" }, post.title),
      el(
        "span",
        { class: "row-sub" },
        post.tags.length > 0 ? el("span", { class: "row-tags" }, post.tags.map((tag) => `#${tag}`).join(" ")) : "",
        el("time", { datetime: post.updatedAt, title: "마지막으로 고친 시각" }, formatDateTime(post.updatedAt)),
      ),
    ),
    el("span", { class: "row-status" }, ...statusPills(post)),
    el("span", { class: `row-english en-${kind}` }, post.status === "draft" && kind === "none" ? "" : `EN ${english}`),
    el("span", { class: "row-views" }, views ? views.toLocaleString("ko-KR") : "—", el("small", {}, "조회")),
  );
  return el("li", {}, link);
}

/** 오른쪽 상세 @param {PostSummary | null} post */
function renderDetail(post) {
  if (!post || !WIDE.matches) {
    detail.hidden = true;
    return;
  }
  const [english, kind] = englishState(translationById.get(post.id));
  const views = viewsById[String(post.id)] ?? 0;
  const published = post.status === "published";
  const applyButton = post.hasDraft
    ? el("button", { type: "button", class: "button", onClick: () => void applyEdits(post) }, "수정본 반영")
    : "";
  detail.replaceChildren(
    post.thumbnail ? el("img", { class: "detail-thumb", src: post.thumbnail, alt: "" }) : "",
    el(
      "div",
      { class: "detail-head" },
      el("p", { class: "detail-pills" }, ...statusPills(post)),
      el("h2", { class: "detail-title" }, post.title),
      post.summary ? el("p", { class: "detail-summary" }, post.summary) : "",
    ),
    el(
      "div",
      { class: "detail-stats" },
      el("div", {}, el("strong", {}, views.toLocaleString("ko-KR")), el("span", {}, "조회")),
      el("div", {}, el("strong", { class: `en-${kind}` }, english), el("span", {}, "영어")),
      el("div", {}, el("strong", {}, post.publishedAt ? formatDateTime(post.publishedAt).split(" ")[0] ?? "" : "—"), el("span", {}, "공개일")),
    ),
    el(
      "dl",
      { class: "detail-meta" },
      el("dt", {}, "고친 때"),
      el("dd", {}, formatDateTime(post.updatedAt), post.hasDraft ? " (수정본 저장)" : ""),
      el("dt", {}, "태그"),
      el("dd", { class: "detail-tags" }, post.tags.length > 0 ? post.tags.map((tag) => `#${tag}`).join(" ") : "—"),
      el("dt", {}, "주소"),
      el("dd", {}, published ? `/posts/${post.id}` : "공개 전"),
    ),
    el(
      "div",
      { class: "detail-actions" },
      el("a", { class: "button primary", href: `/posts/edit/${post.id}` }, "편집"),
      applyButton,
      el("a", { class: "button", href: `/posts/translate/${post.id}/en` }, "영어 번역"),
      published ? el("a", { class: "button", href: `${SITE_ORIGIN}/posts/${post.id}`, target: "_blank", rel: "noopener" }, "사이트에서 보기 ↗") : "",
    ),
  );
  detail.hidden = false;
}

/** 수정본을 공개 글에 반영 (편집 화면의 [반영하기]와 같음) @param {PostSummary} post */
async function applyEdits(post) {
  const ok = await confirmDialog({
    title: "수정본을 반영할까요?",
    message: `“${post.title}”의 저장된 수정본이 공개 글이 돼요. 공개 사이트는 배포해야 바뀌어요.`,
    confirmLabel: "반영하기",
  });
  if (!ok) return;
  try {
    await postsApi.applyEdits(post.id);
    notify("수정본을 반영했어요. 배포하면 공개 사이트에 보여요", "info");
    void render();
  } catch (error) {
    notify(error instanceof ApiError ? error.message : "반영하지 못했어요");
  }
}

/** 카드 안 맨 아래 이전 · n / m · 다음 @param {number} current @param {number} totalPages */
function renderPager(current, totalPages) {
  if (totalPages <= 1) {
    pager.replaceChildren();
    return;
  }
  const go = (/** @type {number} */ page) => () => {
    writeState({ ...readState(), page, id: null });
    void render();
    window.scrollTo(0, 0);
  };
  pager.replaceChildren(
    el("button", { type: "button", class: "pager-link", disabled: current <= 1, onClick: go(current - 1) }, "‹ 이전"),
    el("span", { class: "muted" }, `${current} / ${totalPages}`),
    el("button", { type: "button", class: "pager-link", disabled: current >= totalPages, onClick: go(current + 1) }, "다음 ›"),
  );
}

/** 줄 고르기 (넓은 화면) @param {number} id @param {{ focus?: boolean }} [options] */
function select(id, options = {}) {
  const post = items.find((item) => item.id === id);
  if (!post) return;
  writeState({ ...readState(), id }, { replace: true });
  for (const row of list.querySelectorAll(".admin-row")) {
    const mine = /** @type {HTMLElement} */ (row).dataset.id === String(id);
    row.setAttribute("aria-current", String(mine));
    if (mine && options.focus) /** @type {HTMLElement} */ (row).focus();
  }
  renderDetail(post);
}

// ── 이벤트 ──────────────────────────────────────────

for (const button of document.querySelectorAll("[data-kind]")) {
  button.addEventListener("click", () => {
    const value = /** @type {HTMLElement} */ (button).dataset.kind;
    update({ kind: value === "post" || value === "note" ? value : "" });
  });
}
for (const button of document.querySelectorAll("[data-status]")) {
  button.addEventListener("click", () => {
    const value = /** @type {HTMLElement} */ (button).dataset.status ?? "";
    update({ status: value === "draft" || value === "published" || value === "edited" ? value : "" });
  });
}

// 찾기: 멈추고 0.3초 뒤에 (한글 조합 중에는 기다림)
let searchTimer = 0;
search.addEventListener("input", (event) => {
  if (/** @type {InputEvent} */ (event).isComposing) return;
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => update({ q: search.value }), 300);
});
search.addEventListener("compositionend", () => {
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => update({ q: search.value }), 300);
});

// 줄: 넓은 화면에서 마우스로 누르면 고르기 (키보드 Enter = detail 0 → 링크대로 편집), 두 번 누르면 편집
list.addEventListener("click", (event) => {
  const row = /** @type {HTMLElement | null} */ (/** @type {Element} */ (event.target).closest(".admin-row"));
  if (!row || !WIDE.matches || event.detail === 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
  event.preventDefault();
  if (event.detail >= 2) location.href = /** @type {HTMLAnchorElement} */ (row).href;
  else select(Number(row.dataset.id));
});

// ↑↓: 줄 옮기기 (넓은 화면, 찾기 칸에 글자를 쓰는 중이 아닐 때)
document.addEventListener("keydown", (event) => {
  if (!WIDE.matches || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
  const target = event.target;
  if (target instanceof Element && target.closest("input, textarea, select, dialog")) return;
  const current = items.findIndex((post) => post.id === readState().id);
  const next = items[Math.min(items.length - 1, Math.max(0, current + (event.key === "ArrowDown" ? 1 : -1)))];
  if (!next) return;
  event.preventDefault();
  select(next.id, { focus: true });
});

// 창 폭이 바뀌면 상세를 보이거나 숨김
WIDE.addEventListener("change", () => renderDetail(items.find((post) => post.id === readState().id) ?? null));
// 뒤로·앞으로 가기로 주소가 바뀌면 다시 그림
window.addEventListener("popstate", () => void render());

// 첫 목록을 그린 뒤에 남겨 둔 알림을 보여준다
void render().then(showFlash);
