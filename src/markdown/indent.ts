import type { MarkdownIt } from "markdown-it";
import type { MarkdownModule } from "./types.ts";

/**
 * 들여쓰기 (설계 13-11): 노션처럼 줄 앞 공백 2칸 = 한 단계 들여쓴 블록, 위 블록에 붙어 보임.
 *
 * ```
 * 네트워크 계층은 패킷을 보낸다.
 *   라우터가 경로를 고른다.        ← <div class="indent"><p>…</p></div>
 *     IPv4는 32비트다.            ← 그 안에 한 단계 더
 * ```
 *
 * - 지금 위치(blkIndent)보다 2칸 이상 더 들어간 줄에서 시작. 그만큼 들어간 줄이 이어지는 동안 한 블록
 *   (사이의 빈 줄은 다음 줄도 들여쓴 줄이면 포함 → 블록 안에서 문단이 나뉨)
 * - 블록 안은 blkIndent를 2칸 올려 다시 Markdown으로 읽음 (목록 항목과 같은 방식) → 목록·굵게·코드 등 그대로, 더 들여쓰면 한 단계 더
 * - 바로 위 문단에 빈 줄 없이 이어 써도 시작됨 (문단을 끊음)
 * - 목록 안의 하위 목록·이어지는 문단은 목록 규칙이 먼저 (항목 글자 위치 기준이라 여기 걸리지 않음)
 * - 위 블록에 붙어 보이는 간격은 CSS (.indent)
 */
const STEP = 2;

export const indentModule: MarkdownModule = {
  name: "indent",
  setup(md) {
    md.block.ruler.before("table", "indent", indentRule(md), { alt: ["paragraph"] });
  },
};

type BlockRule = Parameters<MarkdownIt["block"]["ruler"]["before"]>[2];

function indentRule(md: MarkdownIt): BlockRule {
  return (state, startLine, endLine, silent) => {
    if (!isIndented(state, startLine)) return false;
    if (silent) return true;

    // 블록 끝: 들여쓴 줄이 이어지는 동안 (빈 줄은 뒤에 들여쓴 줄이 또 오면 포함)
    let nextLine = startLine + 1;
    let last = startLine;
    for (; nextLine < endLine; nextLine++) {
      if (isBlank(state, nextLine)) continue;
      if (!isIndented(state, nextLine)) break;
      last = nextLine;
    }
    const end = last + 1;

    const open = state.push("indent_open", "div", 1);
    open.attrSet("class", "indent");
    open.block = true;
    open.map = [startLine, end];

    const oldIndent = state.blkIndent;
    const oldParent = state.parentType;
    const oldLineMax = state.lineMax;
    state.blkIndent = oldIndent + STEP;
    state.parentType = "indent";
    state.lineMax = end;
    md.block.tokenize(state, startLine, end);
    state.blkIndent = oldIndent;
    state.parentType = oldParent;
    state.lineMax = oldLineMax;

    const close = state.push("indent_close", "div", -1);
    close.block = true;
    state.line = end;
    return true;
  };
}

type State = Parameters<BlockRule>[0];

function isBlank(state: State, line: number): boolean {
  return state.bMarks[line]! + state.tShift[line]! >= state.eMarks[line]!;
}

function isIndented(state: State, line: number): boolean {
  return !isBlank(state, line) && state.sCount[line]! - state.blkIndent >= STEP;
}
