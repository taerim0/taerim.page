// @ts-check
/**
 * 태그 화면 (/tags)
 * - 태그 칩 모음: #이름 + 글 개수 (휴지통 글은 세지 않음). 누르면 그 태그로 거른 글 목록(/?tag=…)
 * - 정렬(이름순 ↔ 글 많은 순)과 찾기는 화면에서만 한다. 태그 목록은 처음에 한 번만 받아 온다
 * - 정렬·찾기 조건은 주소(?sort=count&q=…)에 담아 새로고침해도 그대로. 칠 때마다 기록이 쌓이지 않게 replaceState
 */
import { ApiError, listTags } from "./api.js";
import { normalizeTag } from "./lib.js";
import { el, notify } from "./ui.js";

/** @typedef {import("./api.js").TagCount} TagCount */
/** @typedef {{ sort: "name" | "count", query: string }} TagsState */

const cloud = /** @type {HTMLElement} */ (document.getElementById("tag-cloud"));
const summary = /** @type {HTMLElement} */ (document.getElementById("summary"));
const search = /** @type {HTMLInputElement} */ (document.getElementById("tag-search"));

/** 서버에서 받은 태그 (이름순) */
let allTags = /** @type {TagCount[]} */ ([]);

/** @returns {TagsState} */
function readState() {
  const params = new URLSearchParams(location.search);
  return { sort: params.get("sort") === "count" ? "count" : "name", query: params.get("q") ?? "" };
}

/** @param {TagsState} state */
function writeState(state) {
  const params = new URLSearchParams();
  if (state.sort === "count") params.set("sort", "count");
  if (state.query) params.set("q", state.query);
  const text = params.toString();
  history.replaceState(null, "", text ? `?${text}` : location.pathname);
}

/**
 * 찾기: 태그 정리 규칙(소문자, 띄어쓰기 → -)을 그대로 적용해서 비교 → "Dev Log"로 찾아도 dev-log가 나옴
 * @param {TagCount[]} tags @param {string} query
 */
function filterTags(tags, query) {
  const needle = normalizeTag(query);
  return needle ? tags.filter((tag) => tag.name.includes(needle)) : tags;
}

/**
 * 글 많은 순: 개수가 같으면 이름순 그대로 (sort는 순서를 유지하므로 서버의 이름순이 남는다)
 * @param {TagCount[]} tags @param {TagsState["sort"]} sort
 */
function sortTags(tags, sort) {
  return sort === "count" ? [...tags].sort((a, b) => b.count - a.count) : tags;
}

function render() {
  const state = readState();
  for (const tab of document.querySelectorAll("[data-sort]")) {
    tab.setAttribute("aria-selected", String(/** @type {HTMLElement} */ (tab).dataset.sort === state.sort));
  }

  const shown = sortTags(filterTags(allTags, state.query), state.sort);
  cloud.replaceChildren(
    ...shown.map((tag) =>
      el(
        "a",
        { class: "tag-chip", href: `/?tag=${encodeURIComponent(tag.name)}`, title: `#${tag.name} 글 보기` },
        `#${tag.name}`,
        el("span", { class: "tag-count" }, tag.count),
      ),
    ),
  );

  summary.textContent =
    allTags.length === 0
      ? "아직 태그가 없어요. 글을 편집할 때 태그를 붙이면 여기에 모여요."
      : shown.length === 0
        ? `‘${state.query}’가 들어간 태그가 없어요.`
        : shown.length === allTags.length
          ? `태그 ${allTags.length}개`
          : `태그 ${allTags.length}개 중 ${shown.length}개`;
}

async function load() {
  try {
    allTags = await listTags();
  } catch (error) {
    summary.textContent = "";
    notify(error instanceof ApiError ? error.message : "태그를 불러오지 못했어요");
    return;
  }
  render();
}

// ── 이벤트 ──────────────────────────────────────────

for (const tab of document.querySelectorAll("[data-sort]")) {
  tab.addEventListener("click", () => {
    writeState({ ...readState(), sort: /** @type {HTMLElement} */ (tab).dataset.sort === "count" ? "count" : "name" });
    render();
  });
}

search.value = readState().query;
search.addEventListener("input", () => {
  writeState({ ...readState(), query: search.value.trim() });
  render();
});

void load();
