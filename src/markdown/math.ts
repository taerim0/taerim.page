import type { StateBlock } from "markdown-it";
import type { MarkdownModule } from "./types.ts";

/**
 * 수식 모듈 (설계 13-8): `$…$` 문장 안 수식, `$$…$$` 블록 수식
 *
 * - 돈 표시와 헷갈리지 않게 (Pandoc 규칙): 여는 `$` 바로 뒤가 공백이면 수식 아님,
 *   닫는 `$` 바로 앞이 공백이거나 바로 뒤가 숫자면 수식 아님 → "가격은 $5이고 $10이다"는 글자 그대로
 * - `\$`는 글자 $ (markdown-it 이스케이프 규칙이 먼저 처리)
 * - 코드(`…`, ```…```) 안의 $는 그대로 (코드 규칙이 먼저 읽음)
 * - 그리기: 준비된 수식 그리개(setMathRenderer, KaTeX)가 꽂혀 있으면 HTML로, 아니면 원문을 회색 코드 모양으로.
 *   렌더러는 동기라서 KaTeX는 빌드·관리자 미리보기가 따로 준비해서 꽂는다 (katex.ts) — 코드 색칠과 같은 구조
 */
export const mathModule: MarkdownModule = {
  name: "math",
  setup(md) {
    md.block.ruler.before("fence", "math_block", mathBlock, { alt: ["paragraph", "reference", "blockquote", "list"] });
    md.inline.ruler.before("escape", "math_inline", (state, silent) => {
      if (state.src.charCodeAt(state.pos) !== DOLLAR) return false;
      const end = inlineMathEnd(state.src, state.pos);
      if (end === -1) return false;
      if (!silent) {
        const token = state.push("math_inline", "", 0);
        token.content = state.src.slice(state.pos + 1, end);
        token.markup = "$";
      }
      state.pos = end + 1;
      return true;
    });

    md.renderer.rules.math_inline = (tokens, idx) => {
      const tex = tokens[idx]!.content;
      return mathRenderer ? mathRenderer(tex, false) : `<code class="math-src">${md.utils.escapeHtml(`$${tex}$`)}</code>`;
    };
    md.renderer.rules.math_block = (tokens, idx) => {
      const tex = tokens[idx]!.content;
      const inner = mathRenderer ? mathRenderer(tex, true) : `<pre class="math-src">${md.utils.escapeHtml(`$$\n${tex}\n$$`)}</pre>`;
      return `<div class="math-block">${inner}</div>\n`;
    };
  },
};

// ── 수식 그리개 (빌드·미리보기가 꽂음) ───────────────────

/** TeX → HTML. displayMode = 블록 수식. 틀린 수식도 오류 없이 (빨간 원문 등) HTML을 돌려줘야 한다 */
export type MathRenderer = (tex: string, displayMode: boolean) => string;

let mathRenderer: MathRenderer | null = null;

/** 수식 그리개를 꽂는다 (null이면 뺌). 이후의 렌더링부터 적용 */
export function setMathRenderer(next: MathRenderer | null): void {
  mathRenderer = next;
}

// ── 찾기 규칙 (렌더러와 번역 보호가 같이 씀) ───────────────

const DOLLAR = 0x24;
const BACKSLASH = 0x5c;

/**
 * src[start]의 `$`에서 시작하는 문장 안 수식의 닫는 `$` 위치. 수식이 아니면 -1
 * - `$$`(블록 표시)는 문장 안 수식으로 보지 않음
 * - 여는 $ 뒤 공백 ✗, 닫는 $ 앞 공백 ✗, 닫는 $ 뒤 숫자 ✗, 빈 수식 ✗, \$ 는 건너뜀
 */
export function inlineMathEnd(src: string, start: number): number {
  if (src.charCodeAt(start) !== DOLLAR || src.charCodeAt(start + 1) === DOLLAR) return -1;
  const first = src[start + 1];
  if (first === undefined || /\s/.test(first)) return -1;
  for (let i = start + 1; i < src.length; i++) {
    const code = src.charCodeAt(i);
    if (code === BACKSLASH) {
      i++; // \$ 등 다음 글자는 건너뜀
      continue;
    }
    if (src[i] === "\n" && src[i + 1] === "\n") return -1; // 문단을 넘지 않음
    if (code !== DOLLAR) continue;
    if (/\s/.test(src[i - 1]!) || /[0-9]/.test(src[i + 1] ?? "")) continue; // 닫는 $가 아님 → 계속 찾기
    return i;
  }
  return -1;
}

/** 블록 수식: 줄 처음(들여쓰기 3칸까지)의 `$$`부터 `$$`로 끝나는 줄까지. 한 줄에 `$$ … $$`도 됨 */
function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const start = state.bMarks[startLine]! + state.tShift[startLine]!;
  const max = state.eMarks[startLine]!;
  if (state.sCount[startLine]! - state.blkIndent >= 4) return false;
  if (!state.src.startsWith("$$", start)) return false;

  const firstLine = state.src.slice(start + 2, max);
  let content: string;
  let nextLine = startLine;
  const sameLineEnd = firstLine.trimEnd().endsWith("$$") && firstLine.trim().length > 2;
  if (sameLineEnd) {
    content = firstLine.trimEnd().slice(0, -2).trim();
  } else {
    const lines = firstLine.trim() ? [firstLine.trim()] : [];
    let closed = false;
    while (++nextLine < endLine) {
      const lineStart = state.bMarks[nextLine]! + state.tShift[nextLine]!;
      const lineEnd = state.eMarks[nextLine]!;
      if (lineStart < lineEnd && state.sCount[nextLine]! < state.blkIndent) break; // 감싼 블록(인용 등) 밖으로 나감
      const text = state.src.slice(lineStart, lineEnd);
      if (text.trimEnd().endsWith("$$")) {
        const before = text.trimEnd().slice(0, -2).trim();
        if (before) lines.push(before);
        closed = true;
        break;
      }
      lines.push(state.src.slice(state.bMarks[nextLine]!, lineEnd).replace(/^\s+/, ""));
    }
    if (!closed) return false; // 닫히지 않은 $$ 는 수식이 아님 (글자 그대로)
    content = lines.join("\n");
  }
  if (content.trim() === "") return false;
  if (silent) return true;

  const token = state.push("math_block", "math", 0);
  token.block = true;
  token.content = content;
  token.markup = "$$";
  token.map = [startLine, nextLine + 1];
  state.line = nextLine + 1;
  return true;
}
