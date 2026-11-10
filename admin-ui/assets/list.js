// @ts-check
/**
 * 글 목록 화면 (/)
 * - 상태 탭(전체·초안·공개), 여러 태그 거르기(모두 가진 글), 10개씩 페이지
 * - 조건은 주소(?status=…&tag=…&page=…)에 담아서 새로고침·뒤로 가기·북마크가 그대로 동작
 */
import { ApiError, postsApi, translationsApi } from "./api.js";
import { normalizeTag } from "./lib.js";
import { translationBadge } from "./translation-badge.js";
import { bindTagInput, clearNotice, el, formatDateTime, notify, setQuery, showFlash } from "./ui.js";

/** @typedef {import("./api.js").PostSummary} PostSummary */
/** @typedef {import("./api.js").PostStatus} PostStatus */

/**
 * 화면 상태 = 주소의 ?… 와 같은 내용
 * @typedef {{ status: PostStatus | "", tags: string[], page: number }} ListState
 */

/** @returns {ListState} */
function readState() {
  const params = new URLSearchParams(location.search);
  const status = params.get("status");
  const page = Number(params.get("page"));
  return {
    status: status === "draft" || status === "published" ? status : "",
    tags: [...new Set(params.getAll("tag").map(normalizeTag).filter(Boolean))],
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** @param {ListState} state */
function writeState(state) {
  const params = new URLSearchParams();
  if (state.status) params.set("status", state.status);
  for (const tag of state.tags) params.append("tag", tag);
  if (state.page > 1) params.set("page", String(state.page));
  setQuery(params);
}

/** 조건을 바꾸고 다시 그린다. 조건이 바뀌면 1페이지부터. @param {Partial<ListState>} change */
function update(change) {
  const next = { ...readState(), page: 1, ...change };
  writeState(next);
  void render();
}

const list = /** @type {HTMLUListElement} */ (document.getElementById("post-list"));
const summary = /** @type {HTMLElement} */ (document.getElementById("summary"));
const pager = /** @type {HTMLElement} */ (document.getElementById("pager"));
const chips = /** @type {HTMLElement} */ (document.getElementById("tag-chips"));
const tagInput = /** @type {HTMLInputElement} */ (document.getElementById("tag-input"));

/** 마지막 요청만 화면에 반영 (빨리 여러 번 바꿔도 늦게 온 옛 응답이 덮어쓰지 않게) */
let renderCount = 0;

async function render() {
  const state = readState();
  const mine = ++renderCount;
  renderFilters(state);
  summary.textContent = "불러오는 중…";

  try {
    const [page, translations] = await Promise.all([
      postsApi.list({ status: state.status || undefined, tags: state.tags, page: state.page }),
      // 번역 표시는 없어도 목록은 보이게 (실패하면 빈 목록)
      translationsApi.list("en").catch(() => /** @type {import("./api.js").TranslationListItem[]} */ ([])),
    ]);
    if (mine !== renderCount) return;
    clearNotice();

    const statusById = new Map(translations.map((item) => [item.postId, item]));
    list.replaceChildren(...page.items.map((post) => postRow(post, statusById.get(post.id))));
    summary.textContent =
      page.total === 0
        ? state.status || state.tags.length > 0
          ? "조건에 맞는 글이 없어요."
          : "아직 글이 없어요. ‘+ 새 글’로 첫 글을 써 보세요."
        : `${page.total}개`;
    renderPager(page.page, page.totalPages);
  } catch (error) {
    if (mine !== renderCount) return;
    summary.textContent = "";
    list.replaceChildren();
    pager.replaceChildren();
    notify(error instanceof ApiError ? error.message : "목록을 불러오지 못했어요");
  }
}

/** @param {ListState} state */
function renderFilters(state) {
  for (const tab of document.querySelectorAll("[data-status]")) {
    const selected = /** @type {HTMLElement} */ (tab).dataset.status === state.status;
    tab.setAttribute("aria-selected", String(selected));
  }
  chips.replaceChildren(
    ...state.tags.map((tag) =>
      el(
        "button",
        {
          type: "button",
          class: "chip",
          title: `${tag} 거르기 빼기`,
          onClick: () => update({ tags: state.tags.filter((t) => t !== tag) }),
        },
        `#${tag} ×`,
      ),
    ),
  );
}

/**
 * 글 한 줄
 * @param {PostSummary} post
 * @param {import("./api.js").TranslationListItem} [translation] 영어 번역 상태 (없으면 표시 안 함)
 */
function postRow(post, translation) {
  const state = readState();
  return el(
    "li",
    { class: "post-row" },
    el("a", { class: "title", href: `/posts/edit/${post.id}` }, post.title),
    el(
      "span",
      { class: "badges" },
      el("span", { class: `pill ${post.status}` }, post.status === "published" ? "공개" : "초안"),
      post.hasDraft && el("span", { class: "pill editing", title: "반영하지 않은 수정본이 있어요" }, "수정 중"),
      translationBadge(post.id, "en", translation),
    ),
    el(
      "span",
      { class: "tags" },
      ...post.tags.map((tag) =>
        el(
          "button",
          {
            type: "button",
            class: "tag",
            title: `#${tag} 글만 보기`,
            onClick: () => !state.tags.includes(tag) && update({ tags: [...state.tags, tag] }),
          },
          `#${tag}`,
        ),
      ),
    ),
    el("time", { class: "muted", datetime: post.updatedAt, title: "마지막으로 고친 시각" }, formatDateTime(post.updatedAt)),
  );
}

/** @param {number} current @param {number} totalPages */
function renderPager(current, totalPages) {
  if (totalPages <= 1) {
    pager.replaceChildren();
    return;
  }
  const go = (/** @type {number} */ page) => () => {
    writeState({ ...readState(), page });
    void render();
    window.scrollTo(0, 0);
  };
  pager.replaceChildren(
    el("button", { type: "button", class: "button", disabled: current <= 1, onClick: go(current - 1) }, "‹ 이전"),
    el("span", { class: "muted" }, `${current} / ${totalPages}`),
    el("button", { type: "button", class: "button", disabled: current >= totalPages, onClick: go(current + 1) }, "다음 ›"),
  );
}

// ── 이벤트 ──────────────────────────────────────────

for (const tab of document.querySelectorAll("[data-status]")) {
  tab.addEventListener("click", () => {
    const status = /** @type {HTMLElement} */ (tab).dataset.status ?? "";
    update({ status: status === "draft" || status === "published" ? status : "" });
  });
}

// 태그 입력: 띄어쓰기·엔터로 거르기 태그 추가, 빈 칸 백스페이스로 마지막 태그 빼기 (한글 조합 처리는 ui.js)
bindTagInput(tagInput, {
  onAdd: (text) => {
    const tags = readState().tags;
    const tag = normalizeTag(text);
    if (tag && !tags.includes(tag)) update({ tags: [...tags, tag] });
  },
  onRemoveLast: () => {
    const tags = readState().tags;
    if (tags.length > 0) update({ tags: tags.slice(0, -1) });
  },
});

// 뒤로·앞으로 가기로 주소가 바뀌면 다시 그림
window.addEventListener("popstate", () => void render());

// 첫 목록을 그린 뒤에 남겨 둔 알림을 보여준다 (render가 성공하면 알림 줄을 지우므로 그 다음에)
void render().then(showFlash);
