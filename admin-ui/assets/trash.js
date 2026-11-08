// @ts-check
/**
 * 휴지통 화면 (/trash)
 * - 최근에 버린 순으로 10개씩 (서버 정렬). 페이지는 주소(?page=)에 담아 새로고침·뒤로 가기 그대로
 * - 되살리기: 항상 초안으로 돌아간다 (작업본이 있던 글은 그 내용으로). 되살린 뒤에도 휴지통에 머문다
 * - 완전 삭제·휴지통 비우기: 되돌릴 수 없어서 가운데 팝업으로 확인
 */
import { ApiError, trashApi } from "./api.js";
import { clearNotice, confirmDialog, el, formatDateTime, notify, setQuery } from "./ui.js";

/** @typedef {import("./api.js").PostSummary} PostSummary */

const list = /** @type {HTMLUListElement} */ (document.getElementById("trash-list"));
const summary = /** @type {HTMLElement} */ (document.getElementById("summary"));
const pager = /** @type {HTMLElement} */ (document.getElementById("pager"));
const emptyButton = /** @type {HTMLButtonElement} */ (document.getElementById("empty-trash"));

/** 지금 휴지통 전체 글 수 (비우기 버튼·팝업 문구용) */
let total = 0;
/** 요청 중이면 모든 버튼을 잠근다 (두 번 누르기·동시에 여러 동작 방지) */
let busy = false;
/** 마지막 요청만 화면에 반영 (늦게 온 옛 응답이 덮어쓰지 않게) */
let renderCount = 0;

function readPage() {
  const page = Number(new URLSearchParams(location.search).get("page"));
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/** @param {number} page */
function writePage(page) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  setQuery(params);
}

async function render() {
  const mine = ++renderCount;
  const requested = readPage();
  try {
    let result = await trashApi.list({ page: requested });
    // 되살리기·삭제로 마지막 페이지가 비면 한 페이지 앞으로
    if (result.items.length === 0 && result.totalPages > 0 && requested > result.totalPages) {
      writePage(result.totalPages);
      result = await trashApi.list({ page: result.totalPages });
    }
    if (mine !== renderCount) return;

    total = result.total;
    list.replaceChildren(...result.items.map(trashRow));
    summary.textContent = total === 0 ? "휴지통이 비어 있어요." : `휴지통 ${total}개`;
    emptyButton.textContent = total === 0 ? "휴지통 비우기" : `휴지통 비우기 (${total}개)`;
    renderPager(result.page, result.totalPages);
    setBusy(busy);
  } catch (error) {
    if (mine !== renderCount) return;
    summary.textContent = "";
    list.replaceChildren();
    pager.replaceChildren();
    notify(error instanceof ApiError ? error.message : "휴지통을 불러오지 못했어요");
  }
}

/** 글 한 줄 @param {PostSummary} post */
function trashRow(post) {
  const wasPublished = post.status === "published";
  return el(
    "li",
    { class: "post-row" },
    el("span", { class: "title" }, post.title),
    el(
      "span",
      { class: "badges" },
      el(
        "span",
        { class: `pill ${post.status}`, title: wasPublished ? "되살리면 초안으로 돌아가요" : undefined },
        wasPublished ? "공개였음" : "초안",
      ),
    ),
    el("span", { class: "tags" }, ...post.tags.map((tag) => el("span", { class: "tag-plain" }, `#${tag}`))),
    el("time", { class: "muted", datetime: post.deletedAt ?? "", title: "휴지통에 넣은 시각" }, `버림 ${formatDateTime(post.deletedAt)}`),
    el(
      "span",
      { class: "row-actions" },
      el("button", { type: "button", class: "button", "data-action": "", onClick: () => void restore(post) }, "되살리기"),
      el("button", { type: "button", class: "button danger", "data-action": "", onClick: () => void purge(post) }, "완전 삭제"),
    ),
  );
}

/** @param {number} current @param {number} totalPages */
function renderPager(current, totalPages) {
  if (totalPages <= 1) {
    pager.replaceChildren();
    return;
  }
  const go = (/** @type {number} */ page) => () => {
    writePage(page);
    void render();
    window.scrollTo(0, 0);
  };
  pager.replaceChildren(
    el("button", { type: "button", class: "button", disabled: current <= 1, onClick: go(current - 1) }, "‹ 이전"),
    el("span", { class: "muted" }, `${current} / ${totalPages}`),
    el("button", { type: "button", class: "button", disabled: current >= totalPages, onClick: go(current + 1) }, "다음 ›"),
  );
}

/** @param {boolean} value */
function setBusy(value) {
  busy = value;
  emptyButton.disabled = busy || total === 0;
  for (const button of list.querySelectorAll("button[data-action]")) /** @type {HTMLButtonElement} */ (button).disabled = busy;
}

/**
 * 동작 하나를 잠금 상태로 실행하고, 끝나면 목록을 다시 그린 뒤 알림을 보여준다
 * @param {() => Promise<string>} task 성공하면 보여줄 알림 문구를 돌려준다
 */
async function run(task) {
  if (busy) return;
  setBusy(true);
  clearNotice();
  /** @type {string | null} */
  let message = null;
  try {
    message = await task();
  } catch (error) {
    notify(error instanceof ApiError ? error.message : "요청을 처리하지 못했어요");
  }
  setBusy(false);
  await render();
  if (message) notify(message, "info"); // 다시 그린 뒤에 (그리기가 알림 줄을 지우지 않게)
}

/** @param {PostSummary} post */
function restore(post) {
  return run(async () => {
    await trashApi.restore(post.id);
    return `‘${post.title}’을(를) 초안으로 되살렸어요`;
  });
}

/** @param {PostSummary} post */
async function purge(post) {
  if (busy) return;
  const ok = await confirmDialog({
    title: "완전히 삭제할까요?",
    message: `‘${post.title}’을(를) 영구 삭제해요. 작업본도 함께 지워지고 되돌릴 수 없어요.`,
    confirmLabel: "영구 삭제",
  });
  if (!ok) return;
  await run(async () => {
    await trashApi.purge(post.id);
    return `‘${post.title}’을(를) 영구 삭제했어요`;
  });
}

emptyButton.addEventListener("click", async () => {
  if (busy || total === 0) return;
  const count = total;
  const ok = await confirmDialog({
    title: "휴지통을 비울까요?",
    message: `휴지통의 글 ${count}개를 영구 삭제해요. 되돌릴 수 없어요.`,
    confirmLabel: `${count}개 영구 삭제`,
  });
  if (!ok) return;
  await run(async () => {
    const { removed } = await trashApi.empty();
    return `${removed}개를 영구 삭제했어요`;
  });
});

// 뒤로·앞으로 가기로 페이지가 바뀌면 다시 그림
window.addEventListener("popstate", () => void render());

void render();
