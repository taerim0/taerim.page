// @ts-check
/**
 * 이미지 정리 화면 (/images, 설계 11-16)
 * - [안 쓰임] (기본): 지울 수 있는 이미지만, 오래된 순. 고르기 칸 → [고른 N개 지우기] → 확인 팝업
 * - [전체]: 모든 이미지 + 어디서 쓰는지 (글·활동 링크, 사이트 설정). 쓰이거나 최근 올린 것은 고르기 칸 없음
 * - 지울 때 서버가 쓰임을 다시 확인 → 그새 쓰이게 된 건 남기고 알려 줌
 * - 보기(탭)는 주소 ?view=all 에 남김
 */
import { ApiError, imagesApi } from "./api.js";
import { clearNotice, confirmDialog, el, formatDateTime, notify, setQuery } from "./ui.js";

/** @typedef {import("./api.js").CleanupImage} CleanupImage */

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const grid = $("image-grid");
const summary = $("summary");
const deleteButton = /** @type {HTMLButtonElement} */ ($("delete"));
const selectAllButton = /** @type {HTMLButtonElement} */ ($("select-all"));

/** @type {CleanupImage[]} */
let images = [];
/** 고른 이름 @type {Set<string>} */
const selected = new Set();
let busy = false;

const view = () => (new URLSearchParams(location.search).get("view") === "all" ? "all" : "unused");

/** @param {number} bytes */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/** 쓰는 곳 하나 @param {CleanupImage["usedBy"][number]} owner */
function ownerLink(owner) {
  if (owner.kind === "post") return el("a", { href: `/posts/edit/${owner.id}` }, owner.title);
  if (owner.kind === "activity") return el("a", { href: "/activities" }, `활동: ${owner.title}`);
  return el("a", { href: "/settings" }, "사이트 설정");
}

/** @param {CleanupImage} image */
function card(image) {
  const checkbox = image.deletable
    ? el("input", {
        type: "checkbox",
        class: "image-check",
        "aria-label": `${image.originalName} 고르기`,
        checked: selected.has(image.name),
        onChange: (/** @type {Event} */ event) => {
          if (/** @type {HTMLInputElement} */ (event.target).checked) selected.add(image.name);
          else selected.delete(image.name);
          refreshActions();
        },
      })
    : "";
  const status = image.usedBy.length > 0
    ? el("p", { class: "image-used" }, "쓰는 곳: ", ...image.usedBy.slice(0, 3).flatMap((owner, i) => (i === 0 ? [ownerLink(owner)] : [", ", ownerLink(owner)])), image.usedBy.length > 3 ? ` 외 ${image.usedBy.length - 3}곳` : "")
    : image.recent
      ? el("p", { class: "image-used muted" }, "방금 올림 (24시간 뒤에 지울 수 있어요)")
      : el("p", { class: "image-used muted" }, "안 쓰임");
  return el(
    "li",
    { class: `image-card${image.deletable ? " deletable" : ""}` },
    el("label", { class: "image-thumb" },
      el("img", { src: `/images/${image.name}`, alt: "", loading: "lazy", width: String(image.width), height: String(image.height) }),
      checkbox,
    ),
    el("p", { class: "image-name", title: image.name }, image.originalName),
    el("p", { class: "image-meta muted" }, `${formatSize(image.size)} · ${image.width}×${image.height} · ${formatDateTime(image.createdAt)}`),
    status,
  );
}

function render() {
  const current = view();
  for (const tab of document.querySelectorAll(".tabs button")) {
    tab.setAttribute("aria-selected", String(/** @type {HTMLElement} */ (tab).dataset.view === current));
  }
  const unused = images.filter((image) => image.deletable);
  const shown = current === "all" ? images : unused;
  const total = (/** @type {CleanupImage[]} */ list) => formatSize(list.reduce((sum, image) => sum + image.size, 0));
  summary.textContent = current === "all"
    ? `전체 ${images.length}개 (${total(images)}) · 지울 수 있는 것 ${unused.length}개`
    : `지울 수 있는 이미지 ${unused.length}개 (${total(unused)})`;
  grid.replaceChildren(...shown.map(card));
  if (shown.length === 0) grid.append(el("li", { class: "empty muted" }, current === "all" ? "아직 올린 이미지가 없어요." : "지울 이미지가 없어요. 깨끗해요."));
  refreshActions();
}

function refreshActions() {
  // 지금 화면에서 고를 수 있는 것 중 고른 것만 (탭을 오가도 남아 있지만, 지울 수 없게 된 것은 빼기)
  for (const name of selected) if (!images.some((image) => image.name === name && image.deletable)) selected.delete(name);
  const selectable = images.filter((image) => image.deletable);
  const size = selectable.filter((image) => selected.has(image.name)).reduce((sum, image) => sum + image.size, 0);
  deleteButton.hidden = selectAllButton.hidden = selectable.length === 0;
  deleteButton.disabled = busy || selected.size === 0;
  deleteButton.textContent = selected.size === 0 ? "지우기" : `고른 ${selected.size}개 지우기 (${formatSize(size)})`;
  const allSelected = selectable.length > 0 && selectable.every((image) => selected.has(image.name));
  selectAllButton.textContent = allSelected ? "모두 풀기" : "모두 고르기";
}

async function load() {
  try {
    images = (await imagesApi.listForCleanup()).images;
    clearNotice();
  } catch (error) {
    summary.textContent = "이미지를 불러오지 못했어요.";
    notify(error instanceof ApiError ? error.message : "이미지를 불러오지 못했어요");
    return;
  }
  render();
}

async function remove() {
  if (busy || selected.size === 0) return;
  const chosen = images.filter((image) => selected.has(image.name));
  const size = formatSize(chosen.reduce((sum, image) => sum + image.size, 0));
  const ok = await confirmDialog({
    title: `이미지 ${chosen.length}개를 영구 삭제할까요?`,
    message: `${size} — 되돌릴 수 없어요. 지우는 순간 다시 확인해서, 그사이 글에 쓰인 이미지는 남겨요.`,
    confirmLabel: "영구 삭제",
  });
  if (!ok) return;
  busy = true;
  refreshActions();
  try {
    const result = await imagesApi.deleteUnused([...selected]);
    selected.clear();
    notify(result.kept.length > 0 ? `${result.deleted.length}개를 지웠어요. ${result.kept.length}개는 그새 쓰이게 돼서 남겼어요` : `${result.deleted.length}개를 지웠어요`, "info");
  } catch (error) {
    notify(error instanceof ApiError ? error.message : "지우지 못했어요");
  } finally {
    busy = false;
    await load();
  }
}

// ── 이벤트 ──────────────────────────────────────────

for (const tab of document.querySelectorAll(".tabs button")) {
  tab.addEventListener("click", () => {
    setQuery(new URLSearchParams(/** @type {HTMLElement} */ (tab).dataset.view === "all" ? { view: "all" } : {}));
    render();
  });
}
window.addEventListener("popstate", render);
selectAllButton.addEventListener("click", () => {
  const selectable = images.filter((image) => image.deletable);
  const allSelected = selectable.every((image) => selected.has(image.name));
  for (const image of selectable) {
    if (allSelected) selected.delete(image.name);
    else selected.add(image.name);
  }
  render();
});
deleteButton.addEventListener("click", () => void remove());

void load();
