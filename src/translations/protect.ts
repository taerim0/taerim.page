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
