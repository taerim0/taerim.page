import { inlineMathEnd } from "../markdown/math.ts";

/**
 * 코드 블록 보호 (설계 12-8).
 * 번역 모델에 보내기 전에 ```·~~~ 코드 블록을 `[[CODE_1]]` 한 줄로 바꾸고, 받은 뒤 원래대로 되돌린다.
 * → 모델이 코드를 건드릴 수 없고, 보내는 양도 줄어든다.
 *
 * - 여는 줄: (들여쓰기) + ``` 또는 ~~~ 3개 이상 (+ 언어 이름). 닫는 줄: 같은 글자가 여는 것 이상 + 공백만
 * - 닫히지 않은 블록은 글 끝까지 (Markdown 규칙과 같음)
 * - 자리표 줄은 여는 줄의 들여쓰기를 그대로 둔다 (목록 안 코드 블록의 구조 유지)
 * - 인용(>) 안의 코드 블록은 보호하지 않는다 (그대로 보냄 — 드물고, 안 해도 깨지지는 않음)
 * - 줄바꿈은 \n으로 맞춘다
 */

export interface ProtectedText {
  /** 코드 블록이 자리표로 바뀐 글 */
  text: string;
  /** blocks[0] = [[CODE_1]]의 원래 줄들 */
  blocks: string[];
}

const OPEN = /^([ \t]*)(`{3,}|~{3,})(.*)$/;

export function placeholder(index: number): string {
  return `[[CODE_${index + 1}]]`;
}

export function protectCodeBlocks(markdown: string): ProtectedText {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  const blocks: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = OPEN.exec(lines[i]!);
    // ``` 뒤 언어 이름에 `가 있으면 코드 블록이 아님 (Markdown 규칙)
    if (!open || (open[2]![0] === "`" && open[3]!.includes("`"))) {
      out.push(lines[i]!);
      continue;
    }
    const fence = open[2]!;
    const close = new RegExp(`^[ \\t]*${fence[0] === "`" ? "`" : "~"}{${fence.length},}[ \\t]*$`);
    let end = i + 1;
    while (end < lines.length && !close.test(lines[end]!)) end++;
    const last = Math.min(end, lines.length - 1);
    out.push(open[1]! + placeholder(blocks.length));
    blocks.push(lines.slice(i, last + 1).join("\n"));
    i = last;
  }
  return { text: out.join("\n"), blocks };
}

/** 자리표마다 [개수, 혼자 한 줄에 있는지] */
export function findPlaceholders(text: string, count: number): { index: number; occurrences: number; ownLine: boolean }[] {
  return Array.from({ length: count }, (_, index) => {
    const mark = placeholder(index);
    const occurrences = text.split(mark).length - 1;
    const ownLine = new RegExp(`^[ \\t]*${escape(mark)}[ \\t]*$`, "m").test(text);
    return { index, occurrences, ownLine };
  });
}

/** 모델이 지어낸 자리표 번호(원래 없던 [[CODE_n]])가 있는지 */
export function hasUnknownPlaceholder(text: string, count: number): boolean {
  return [...text.matchAll(/\[\[CODE_(\d+)\]\]/g)].some((match) => {
    const n = Number(match[1]);
    return n < 1 || n > count;
  });
}

/** 자리표 줄을 원래 코드 블록으로 (자리표 검사를 통과한 글에만 쓴다) */
export function restoreCodeBlocks(text: string, blocks: readonly string[]): string {
  let restored = text;
  blocks.forEach((block, index) => {
    // 함수로 넘겨서 코드 안의 $ 같은 글자가 바꾸기 규칙으로 해석되지 않게
    restored = restored.replace(new RegExp(`^[ \\t]*${escape(placeholder(index))}[ \\t]*$`, "m"), () => block);
  });
  return restored;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── 수식 보호 (설계 13-8) ──────────────────────────────
// 코드 블록을 먼저 자리표로 바꾼 글에 쓴다 (코드 안의 $는 이미 빠져 있음)

/** 보호한 수식 하나 */
export interface ProtectedMath {
  /** 원래 글자 ($…$ 또는 $$…$$ 줄들) */
  source: string;
  /** 블록 수식이면 true (자리표가 한 줄에 혼자 있어야 함) */
  block: boolean;
}

export function mathPlaceholder(index: number): string {
  return `[[MATH_${index + 1}]]`;
}

/**
 * 수식을 [[MATH_n]] 자리표로. 블록($$ 줄)은 한 줄로, 문장 안($…$)은 그 자리에.
 * 인라인 코드(`…`) 안의 $는 건드리지 않는다. 찾는 규칙은 렌더러와 같음(inlineMathEnd)
 */
export function protectMath(text: string): { text: string; maths: ProtectedMath[] } {
  const maths: ProtectedMath[] = [];
  // 1) 블록: 줄 처음(들여쓰기 3칸까지) $$ … $$ 로 끝나는 줄까지
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^( {0,3})\$\$(.*)$/.exec(lines[i]!);
    if (!open) {
      out.push(lines[i]!);
      continue;
    }
    const rest = open[2]!.trimEnd();
    let end = -1;
    if (rest.length > 2 && rest.endsWith("$$")) end = i;
    else for (let j = i + 1; j < lines.length; j++) if (lines[j]!.trimEnd().endsWith("$$")) { end = j; break; }
    if (end === -1) {
      out.push(lines[i]!); // 닫히지 않은 $$ 는 수식이 아님 (렌더러와 같음)
      continue;
    }
    out.push(open[1]! + mathPlaceholder(maths.length));
    maths.push({ source: lines.slice(i, end + 1).join("\n"), block: true });
    i = end;
  }
  // 2) 문장 안: 인라인 코드 밖의 $…$
  const joined = out.join("\n");
  let result = "";
  for (let i = 0; i < joined.length; i++) {
    const ch = joined[i]!;
    if (ch === "\\") {
      result += joined.slice(i, i + 2); // \$ 등은 그대로
      i++;
      continue;
    }
    if (ch === "`") {
      const ticks = /^`+/.exec(joined.slice(i))![0];
      const close = joined.indexOf(ticks, i + ticks.length);
      if (close !== -1) {
        result += joined.slice(i, close + ticks.length); // 인라인 코드는 통째로
        i = close + ticks.length - 1;
        continue;
      }
    }
    if (ch === "$") {
      const end = inlineMathEnd(joined, i);
      if (end !== -1) {
        result += mathPlaceholder(maths.length);
        maths.push({ source: joined.slice(i, end + 1), block: false });
        i = end;
        continue;
      }
    }
    result += ch;
  }
  return { text: result, maths };
}

/** 수식 자리표 검사: 문제가 있으면 이유, 없으면 null */
export function checkMathPlaceholders(text: string, maths: readonly ProtectedMath[]): string | null {
  for (const [index, math] of maths.entries()) {
    const mark = mathPlaceholder(index);
    const occurrences = text.split(mark).length - 1;
    if (occurrences === 0) return `수식 ${mark}이 빠졌어요`;
    if (occurrences > 1) return `수식 ${mark}이 여러 번 나와요`;
    if (math.block && !new RegExp(`^[ \\t]*${escape(mark)}[ \\t]*$`, "m").test(text)) return `블록 수식 ${mark}이 한 줄에 혼자 있지 않아요`;
  }
  const unknown = [...text.matchAll(/\[\[MATH_(\d+)\]\]/g)].some((match) => {
    const n = Number(match[1]);
    return n < 1 || n > maths.length;
  });
  return unknown ? "원문에 없는 수식 자리표가 생겼어요" : null;
}

/** 수식 자리표를 원래 수식으로 (검사를 통과한 글에만) */
export function restoreMath(text: string, maths: readonly ProtectedMath[]): string {
  let restored = text;
  maths.forEach((math, index) => {
    const mark = mathPlaceholder(index);
    restored = math.block
      ? restored.replace(new RegExp(`^[ \\t]*${escape(mark)}[ \\t]*$`, "m"), () => math.source)
      : restored.split(mark).join(math.source);
  });
  return restored;
}
