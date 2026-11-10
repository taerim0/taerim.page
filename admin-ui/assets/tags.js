// @ts-check
/**
 * 태그 화면 (/tags)
 * - 태그 칩 모음: #이름 + 글 개수 (휴지통 글은 세지 않음). 누르면 그 태그로 거른 글 목록(/?tag=…)
 * - 정렬(이름순 ↔ 글 많은 순)과 찾기는 화면에서만 한다. 태그 목록은 처음에 한 번만 받아 온다
 * - 정렬·찾기 조건은 주소(?sort=count&q=…)에 담아 새로고침해도 그대로. 칠 때마다 기록이 쌓이지 않게 replaceState
 * - 상하관계 (설계 14): 이름순·찾기 없음이면 트리(깊이만큼 들여쓰기), 개수는 하위 태그 글까지(total).
 *   상하관계 바꾸기는 글 편집 화면의 태그 칩에서
 */
import { ApiError, listTags } from "./api.js";
import { normalizeTag } from "./lib.js";
import { el, notify } from "./ui.js";

/** @typedef {import("./api.js").TagNode} TagCount */
/** @typedef {{ sort: "name" | "count", query: string }} TagsState */

const cloud = /** @type {HTMLElement} */ (document.getElementById("tag-cloud"));
const summary = /** @type {HTMLElement} */ (document.getElementById("summary"));
const search = /** @type {HTMLInputElement} */ (document.getElementById("tag-search"));

/** 서버에서 받은 태그 (트리 순, 글이 있는 것만) */
let allTags = /** @type {TagCount[]} */ ([]);

/** 태그 → 부모 (깊이 계산용) */
let parents = /** @type {Map<string, string | null>} */ (new Map());

/** 트리 깊이 (맨 위 = 0) @param {TagCount} tag */
function depthOf(tag) {
  let depth = 0;
  const seen = new Set([tag.name]);
  for (let parent = tag.parent; parent && !seen.has(parent); parent = parents.get(parent) ?? null) {
    seen.add(parent);
    depth++;
  }
  return depth;
}

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
  return sort === "count" ? [...tags].sort((a, b) => b.total - a.total) : tags;
}

function render() {
  const state = readState();
  for (const tab of document.querySelectorAll("[data-sort]")) {
    tab.setAttribute("aria-selected", String(/** @type {HTMLElement} */ (tab).dataset.sort === state.sort));
  }

  const shown = sortTags(filterTags(allTags, state.query), state.sort);
  const chip = (/** @type {TagCount} */ tag) =>
    el(
      "a",
      { class: "tag-chip", href: `/?tag=${encodeURIComponent(tag.name)}`, title: `#${tag.name} 글 보기 (하위 태그 글 포함)` },
      `#${tag.name}`,
      el("span", { class: "tag-count" }, tag.total),
    );
  // 이름순이고 찾는 글자가 없으면 트리로 (서버가 트리 순으로 줌 → 깊이만큼 들여쓰기)
  const asTree = state.sort === "name" && !state.query;
  cloud.className = asTree ? "tag-tree" : "tag-cloud";
  cloud.replaceChildren(
    ...shown.map((tag) => (asTree ? el("div", { style: `padding-left:${depthOf(tag) * 1.5}em` }, chip(tag)) : chip(tag))),
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
    const nodes = await listTags();
    parents = new Map(nodes.map((node) => [node.name, node.parent]));
    allTags = nodes.filter((node) => node.total > 0);
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
