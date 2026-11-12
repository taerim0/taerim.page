// @ts-check
/**
 * 본문 칸 단축키 (설계 13-12): 노션과 같은 키로 고른 글자를 감싸기·풀기
 *
 * | Ctrl+B 굵게 `**` | Ctrl+I 기울임 `*` | Ctrl+E 인라인 코드 `` ` `` | Ctrl+Shift+S 취소선 `~~` | Ctrl+K 링크 `[](…)` | Ctrl+Shift+E 수식 `$` |
 * (Mac은 Cmd)
 *
 * - 고른 글자가 있으면 감쌈, 이미 감싸져 있으면(기호 바깥이든 고른 글자 안이든) 풂 → 두 번 누르면 원래대로
 * - 고른 글자가 없으면 기호 한 쌍 + 커서 가운데. 빈 한 쌍 가운데서 다시 누르면 지움
 * - 앞뒤 공백은 바깥으로 (`**글자 **`는 Markdown이 굵게로 못 읽음). 여러 줄이면 줄마다
 * - 인라인 코드: 고른 글자에 ` 가 있으면 `` 글자 `` 로
 * - 링크: 고른 글자가 주소면 `[](주소)` 커서는 [ ] 안, 아니면 `[글자]()` 커서는 ( ) 안
 * - 브라우저 입력(execCommand insertText) → Ctrl+Z 됨, input 이벤트 나감. 한글 조합 중엔 안 건드림
 * - 키는 event.code로 봄 (한글 자판이어도 같은 키)
 */

/** @typedef {{ open: string, close: string }} Marks */

/** @type {Record<string, Marks>} 키(code + Shift 여부) → 기호 */
const WRAPS = {
  KeyB: { open: "**", close: "**" },
  KeyI: { open: "*", close: "*" },
  KeyE: { open: "`", close: "`" },
  "Shift+KeyS": { open: "~~", close: "~~" },
  "Shift+KeyE": { open: "$", close: "$" },
};

/** 단축키 목록 (도움말 팝업이 보여 줌) */
export const SHORTCUTS = [
  ["B", "굵게"],
  ["I", "기울임"],
  ["E", "인라인 코드"],
  ["Shift+S", "취소선"],
  ["K", "링크"],
  ["Shift+E", "수식"],
];

/** Mac이면 ⌘, 아니면 Ctrl */
export const MOD_LABEL = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

/**
 * @param {HTMLTextAreaElement} textarea
 */
export function bindShortcuts(textarea) {
  textarea.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
    const name = (event.shiftKey ? "Shift+" : "") + event.code;
    if (name === "KeyK") {
      event.preventDefault();
      link(textarea);
      return;
    }
    const marks = WRAPS[name];
    if (!marks) return;
    event.preventDefault();
    toggle(textarea, marks);
  });
}

/**
 * 글자를 바꾸고 선택 영역을 다시 잡는다 (되돌리기 되게 브라우저 입력으로)
 * @param {HTMLTextAreaElement} textarea
 * @param {number} from
 * @param {number} to
 * @param {string} text
 * @param {number} selStart 바꾼 뒤 선택 시작 (글 전체 기준)
 * @param {number} selEnd
 */
function replace(textarea, from, to, text, selStart, selEnd) {
  textarea.focus();
  textarea.setSelectionRange(from, to);
  if (!document.execCommand("insertText", false, text)) {
    textarea.setRangeText(text, from, to, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }
  textarea.setSelectionRange(selStart, selEnd);
}

/**
 * 기호 `*` 처럼 겹쳐 쓰는 것: 굵게(**)와 기울임(*)을 구분하려고 바로 붙은 * 개수를 센다
 * @param {string} text
 * @param {number} at
 * @param {-1 | 1} dir
 */
function starRun(text, at, dir) {
  let count = 0;
  for (let i = dir === 1 ? at : at - 1; i >= 0 && i < text.length && text[i] === "*"; i += dir) count++;
  return count;
}

/**
 * 이 기호로 감싸져 있나: 굵게는 * 2개 이상, 기울임은 1개 또는 3개 (*** = 굵게+기울임)
 * @param {number} before 앞에 붙은 * 수
 * @param {number} after 뒤에 붙은 * 수
 * @param {Marks} marks
 */
function starWrapped(before, after, marks) {
  if (before !== after) return false;
  return marks.open === "**" ? before >= 2 : before === 1 || before === 3;
}

/**
 * 한 줄(또는 고른 영역) 감싸기·풀기
 * @param {HTMLTextAreaElement} textarea
 * @param {Marks} marks
 */
function toggle(textarea, marks) {
  const value = textarea.value;
  const { selectionStart: start, selectionEnd: end } = textarea;
  if (value.slice(start, end).includes("\n")) {
    toggleLines(textarea, marks);
    return;
  }
  let a = start;
  let b = end;
  while (a < b && /\s/.test(value[a] ?? "")) a++;
  while (b > a && /\s/.test(value[b - 1] ?? "")) b--;
  const inner = value.slice(a, b);
  const { open, close } = inner.includes("`") && marks.open === "`" ? { open: "`` ", close: " ``" } : marks;
  const star = open.startsWith("*");

  // 고른 글자가 없음: 빈 한 쌍 가운데면 지우기, 아니면 한 쌍 넣고 커서 가운데
  if (a === b) {
    if (value.slice(start - open.length, start) === open && value.slice(start, start + close.length) === close) {
      replace(textarea, start - open.length, start + close.length, "", start - open.length, start - open.length);
      return;
    }
    replace(textarea, start, end, open + close, start + open.length, start + open.length);
    return;
  }

  // 기호가 고른 글자 바깥에 있음 → 풀기
  const outside = star
    ? starWrapped(starRun(value, a, -1), starRun(value, b, 1), marks)
    : value.slice(a - open.length, a) === open && value.slice(b, b + close.length) === close;
  if (outside) {
    const from = a - open.length;
    replace(textarea, from, b + close.length, inner, from, from + inner.length);
    return;
  }

  // 고른 글자 안에 기호까지 들어 있음 → 풀기
  const inside = star ? starWrapped(starRun(inner, 0, 1), starRun(inner, inner.length, -1), marks) : inner.startsWith(open) && inner.endsWith(close);
  if (inside && inner.length > open.length + close.length) {
    const bare = inner.slice(open.length, inner.length - close.length);
    replace(textarea, a, b, bare, a, a + bare.length);
    return;
  }

  replace(textarea, a, b, open + inner + close, a + open.length, a + open.length + inner.length);
}

/**
 * 여러 줄: 줄마다 감싸기 (모든 줄이 이미 감싸져 있으면 전부 풀기). 빈 줄은 그대로
 * @param {HTMLTextAreaElement} textarea
 * @param {Marks} marks
 */
function toggleLines(textarea, marks) {
  const value = textarea.value;
  const { selectionStart: start, selectionEnd: end } = textarea;
  const lines = value.slice(start, end).split("\n");
  const parts = lines.map((line) => {
    const lead = /^\s*/.exec(line)?.[0] ?? "";
    const trail = /\s*$/.exec(line.slice(lead.length))?.[0] ?? "";
    return { lead, body: line.slice(lead.length, line.length - trail.length), trail };
  });
  const wrapped = (/** @type {string} */ body) =>
    body.length > marks.open.length + marks.close.length && body.startsWith(marks.open) && body.endsWith(marks.close) &&
    (!marks.open.startsWith("*") || starWrapped(starRun(body, 0, 1), starRun(body, body.length, -1), marks));
  const filled = parts.filter((part) => part.body !== "");
  const unwrap = filled.length > 0 && filled.every((part) => wrapped(part.body));
  const text = parts
    .map(({ lead, body, trail }) => {
      if (body === "") return lead + trail;
      const next = unwrap ? body.slice(marks.open.length, body.length - marks.close.length) : marks.open + body + marks.close;
      return lead + next + trail;
    })
    .join("\n");
  replace(textarea, start, end, text, start, start + text.length);
}

/**
 * 링크: [글자](|) 또는 고른 게 주소면 [|](주소)
 * @param {HTMLTextAreaElement} textarea
 */
function link(textarea) {
  const value = textarea.value;
  const { selectionStart: start, selectionEnd: end } = textarea;
  const picked = value.slice(start, end).trim();
  if (/^https?:\/\/\S+$/.test(picked)) {
    const text = `[](${picked})`;
    replace(textarea, start, end, text, start + 1, start + 1);
    return;
  }
  const text = `[${picked}]()`;
  const caret = start + picked.length + 3;
  replace(textarea, start, end, text, caret, caret);
}
