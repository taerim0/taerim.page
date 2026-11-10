// @ts-check
/**
 * 태그 칩 팝업 (설계 14): 칩을 누르면 그 아래에 작은 창
 *   "#react의 상위 태그: [입력(자동완성)] [적용] [없음으로]"  + "이 글에서 빼기"
 * 상위 태그는 블로그 전체에 적용된다는 안내를 같이 보여 준다. Esc·바깥 누르기로 닫힘
 */
import { el } from "./ui.js";

/** @type {HTMLElement | null} */
let openPopover = null;

export function closeTagPopover() {
  openPopover?.remove();
  openPopover = null;
}

/**
 * @param {HTMLElement} anchor 누른 칩
 * @param {{
 *   tag: string,
 *   parent: string | null,
 *   suggestions: string[],
 *   onSetParent: (parent: string | null) => Promise<string | null>,
 *   onRemove: () => void,
 * }} options onSetParent는 실패하면 화면에 보일 이유, 성공하면 null
 */
export function openTagPopover(anchor, { tag, parent, suggestions, onSetParent, onRemove }) {
  closeTagPopover();
  const listId = "tag-parent-options";
  const input = el("input", { type: "text", value: parent ?? "", placeholder: "상위 태그 (비우면 맨 위)", list: listId, "aria-label": `#${tag}의 상위 태그` });
  const error = el("p", { class: "field-error" });
  const apply = async (/** @type {string | null} */ value) => {
    error.textContent = "";
    const problem = await onSetParent(value);
    if (problem) error.textContent = problem;
    else closeTagPopover();
  };
  const popover = el(
    "div",
    { class: "tag-popover", role: "dialog", "aria-label": `#${tag} 태그` },
    el("p", { class: "tag-popover-title" }, `#${tag}의 상위 태그`),
    el("div", { class: "tag-popover-row" }, input, el("button", { type: "button", class: "button", onClick: () => void apply(input.value.trim() || null) }, "적용")),
    el("datalist", { id: listId }, ...suggestions.filter((name) => name !== tag).map((name) => el("option", { value: name }))),
    error,
    el("p", { class: "muted tag-popover-note" }, "상하관계는 이 태그를 쓰는 모든 글에 적용돼요"),
    el(
      "div",
      { class: "tag-popover-row" },
      el("button", { type: "button", class: "button", disabled: parent === null, onClick: () => void apply(null) }, "상위 없음으로"),
      el("button", { type: "button", class: "button danger", onClick: () => { closeTagPopover(); onRemove(); } }, "이 글에서 빼기"),
    ),
  );
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      void apply(input.value.trim() || null);
    }
  });
  const box = anchor.getBoundingClientRect();
  popover.style.top = `${box.bottom + window.scrollY + 4}px`;
  popover.style.left = "0px";
  document.body.append(popover);
  // 화면 오른쪽 밖으로 나가지 않게 (좁은 화면에서 페이지가 옆으로 밀리지 않게)
  const left = Math.max(8, Math.min(box.left, document.documentElement.clientWidth - popover.offsetWidth - 8));
  popover.style.left = `${left + window.scrollX}px`;
  openPopover = popover;
  input.focus();
}

// 바깥을 누르거나 Esc면 닫힘
document.addEventListener("pointerdown", (event) => {
  if (openPopover && event.target instanceof Node && !openPopover.contains(event.target)) closeTagPopover();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeTagPopover();
});
