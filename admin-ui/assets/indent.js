// @ts-check
/**
 * 본문 칸 Tab 들여쓰기 (설계 13-11): 노션처럼 Tab = 줄 앞에 한 단계, Shift+Tab = 한 단계 빼기
 *
 * - 한 단계 = 공백 2칸 (렌더러 indent 모듈과 같음). 커서가 줄 가운데 있어도 그 줄 맨 앞에
 * - 여러 줄을 고르면 고른 줄 전부
 * - 목록 줄: 바로 위 같은 깊이 항목의 글자 시작 위치만큼 (`- ` 2칸, `1. ` 3칸) → Markdown 하위 목록으로 묶임
 * - Esc 누른 뒤 Tab = 원래대로 다음 칸으로 (키보드만 쓸 때 칸에 갇히지 않게)
 * - 브라우저 입력(execCommand insertText)으로 넣어 Ctrl+Z가 됨. input 이벤트도 그대로 나감
 * - 한글 조합 중에는 건드리지 않음
 */

const STEP = 2;
/** 목록 항목 줄: 앞 공백 · 기호(- * + 또는 1. 1)) · 공백 */
const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])( +)/;

/**
 * @param {HTMLTextAreaElement} textarea
 */
export function bindIndent(textarea) {
  let escaped = false;
  textarea.addEventListener("blur", () => {
    escaped = false;
  });
  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      escaped = true;
      return;
    }
    if (event.key !== "Tab" || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) {
      escaped = false;
      return;
    }
    if (escaped) {
      escaped = false;
      return; // 원래대로 다음 칸으로
    }
    event.preventDefault();
    shiftLines(textarea, event.shiftKey ? -1 : 1);
  });
}

/**
 * 고른 줄들을 한 단계 들이거나(1) 뺀다(-1)
 * @param {HTMLTextAreaElement} textarea
 * @param {1 | -1} direction
 */
function shiftLines(textarea, direction) {
  const value = textarea.value;
  const { selectionStart: start, selectionEnd: end } = textarea;
  const from = value.lastIndexOf("\n", start - 1) + 1;
  // 고른 끝이 줄 맨 앞이면 그 줄은 빼고 (줄 몇 개를 통째로 고른 경우)
  const endAt = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const lineEnd = value.indexOf("\n", endAt);
  const to = lineEnd === -1 ? value.length : lineEnd;

  const before = value.slice(0, from);
  const lines = value.slice(from, to).split("\n");
  /** @type {number[]} 줄마다 앞에서 더하거나 뺀 칸 수 */
  const deltas = [];
  const changed = lines.map((line, i) => {
    const above = [...before.split("\n"), ...lines.slice(0, i)];
    const delta = direction === 1 ? indentWidth(line, above) : -outdentWidth(line, above);
    deltas.push(delta);
    return delta >= 0 ? " ".repeat(delta) + line : line.slice(-delta);
  });
  const text = changed.join("\n");
  if (text === value.slice(from, to)) return;

  textarea.focus();
  textarea.setSelectionRange(from, to);
  if (!document.execCommand("insertText", false, text)) {
    textarea.setRangeText(text, from, to, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // 커서·선택 다시: 한 줄이면 커서가 글자와 같이 움직이게, 여러 줄이면 바뀐 줄 전부 선택
  if (lines.length === 1) {
    const delta = deltas[0] ?? 0;
    const clamp = (/** @type {number} */ offset) => Math.max(from, offset + delta);
    textarea.setSelectionRange(clamp(start), clamp(end));
  } else {
    textarea.setSelectionRange(from, from + text.length);
  }
}

/**
 * 들일 칸 수: 목록 줄이면 바로 위 같은 깊이 항목의 글자 시작 위치만큼, 아니면 2칸
 * @param {string} line
 * @param {string[]} above 위쪽 줄들 (가까운 것이 끝)
 */
function indentWidth(line, above) {
  const item = LIST_ITEM.exec(line);
  if (!item) return STEP;
  const depth = item[1]?.length ?? 0;
  for (let i = above.length - 1; i >= 0; i--) {
    const prev = above[i] ?? "";
    if (prev.trim() === "") continue;
    const parent = LIST_ITEM.exec(prev);
    if (!parent) break;
    const parentDepth = parent[1]?.length ?? 0;
    if (parentDepth === depth) return (parent[2]?.length ?? 1) + (parent[3]?.length ?? 1);
    if (parentDepth < depth) break;
  }
  return STEP;
}

/**
 * 뺄 칸 수: 목록 줄이면 위쪽의 더 얕은 항목 깊이로, 아니면 2칸 (있는 공백만큼까지)
 * @param {string} line
 * @param {string[]} above
 */
function outdentWidth(line, above) {
  const leading = /^ */.exec(line)?.[0].length ?? 0;
  if (leading === 0) return 0;
  if (LIST_ITEM.test(line)) {
    for (let i = above.length - 1; i >= 0; i--) {
      const parent = LIST_ITEM.exec(above[i] ?? "");
      if (!parent) continue;
      const parentDepth = parent[1]?.length ?? 0;
      if (parentDepth < leading) return leading - parentDepth;
    }
  }
  return Math.min(STEP, leading);
}
