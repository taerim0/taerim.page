/**
 * 블록 단위 미리보기 (관리자 편집 화면용).
 *
 * 긴 글을 입력할 때마다 전체를 렌더링하면 느려서(200,000자 약 40ms),
 * 본문을 블록으로 나눠 **바뀐 블록만** 다시 렌더링하고 나머지는 기억해 둔 결과를 쓴다.
 *
 * 주의: 블록을 따로 렌더링하면 전체 렌더링과 드물게 결과가 다를 수 있다.
 * (예: 빈 줄을 사이에 둔 목록이 목록 두 개로 보임) → 미리보기 전용.
 * 편집 화면은 입력이 멈추면 전체 렌더링으로 덮어써서 실제 화면과 똑같이 맞춘다. 저장·빌드는 항상 전체 렌더링.
 */
import type { RenderFn } from "./types.ts";

/** 코드 블록 여는 줄: 앞 공백 3칸까지 + ``` 또는 ~~~ (3개 이상) */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const BLANK = /^[ \t]*$/;

/**
 * 본문을 블록으로 나눈다.
 * - 빈 줄이 블록을 나눈다 (빈 줄 자체는 블록에 넣지 않음)
 * - 코드 블록(``` · ~~~)은 안에 빈 줄이 있어도 통째로 한 블록
 * - 닫는 기호는 여는 기호와 같은 문자이고 길이가 같거나 길어야 한다 (Markdown 규칙과 같게)
 * - 닫지 않은 코드 블록은 글 끝까지 한 블록 (Markdown 규칙과 같게)
 */
export function splitBlocks(markdown: string): string[] {
  return scanBlocks(markdown).map((block) => block.text);
}

/**
 * 글의 offset번째 글자(편집기 커서 위치)가 몇 번째 블록인지. 미리보기를 고친 블록으로 스크롤할 때 쓴다.
 * - 블록 사이 빈 줄에 있으면 **다음** 블록 (거기 쓰는 글이 다음 블록 쪽에 붙으므로)
 * - 마지막 블록 뒤 빈 줄이면 마지막 블록
 * - 블록이 하나도 없으면 -1
 */
export function blockIndexAt(markdown: string, offset: number): number {
  const blocks = scanBlocks(markdown);
  if (blocks.length === 0) return -1;
  const line = normalizeNewlines(markdown.slice(0, Math.max(0, offset))).split("\n").length - 1;
  const index = blocks.findIndex((block) => block.lastLine >= line);
  return index === -1 ? blocks.length - 1 : index;
}

/** 블록 하나: 글자와, 이 블록의 마지막 줄 번호(0부터) */
interface ScannedBlock {
  text: string;
  lastLine: number;
}

/** splitBlocks·blockIndexAt 공통: 줄 단위로 훑으며 블록을 나눈다 */
function scanBlocks(markdown: string): ScannedBlock[] {
  const blocks: ScannedBlock[] = [];
  let current: string[] = [];
  /** 열려 있는 코드 블록의 기호 (예: "```"). 없으면 null */
  let fence: string | null = null;
  let lineNo = -1;

  /** 지금까지 모은 줄을 블록으로. lastLine = 모은 마지막 줄 */
  const flush = (lastLine: number) => {
    if (current.length > 0) blocks.push({ text: current.join("\n"), lastLine });
    current = [];
  };

  for (const line of normalizeNewlines(markdown).split("\n")) {
    lineNo++;
    if (fence !== null) {
      current.push(line);
      if (isFenceClose(line, fence)) {
        fence = null;
        flush(lineNo);
      }
      continue;
    }

    const open = FENCE_OPEN.exec(line);
    if (open) {
      // 코드 블록은 앞 문단과 붙어 있어도 따로 떼서, 바로 앞 문단을 고쳐도 코드 블록은 다시 렌더링하지 않게
      flush(lineNo - 1);
      fence = open[1]!;
      current.push(line);
      continue;
    }

    if (BLANK.test(line)) flush(lineNo - 1);
    else current.push(line);
  }
  flush(lineNo);
  return blocks;
}

/** Windows(\r\n)·옛 Mac(\r) 줄바꿈을 \n으로 */
function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** 이 줄이 열린 코드 블록(fence)을 닫는지 */
function isFenceClose(line: string, fence: string): boolean {
  const char = fence[0]!;
  const match = /^ {0,3}(`+|~+)[ \t]*$/.exec(line);
  return match !== null && match[1]![0] === char && match[1]!.length >= fence.length;
}

/** 블록 미리보기 결과 */
export interface BlockPreview {
  html: string;
  /** 블록별 결과 (순서대로, 합치면 html). 미리보기에서 블록마다 위치 표시를 달 때 쓴다 */
  parts: string[];
  /** 이번에 새로 렌더링한 블록 수 (나머지는 기억해 둔 결과) */
  rendered: number;
  /** 전체 블록 수 */
  total: number;
}

/**
 * 바뀐 블록만 다시 렌더링하는 미리보기 함수를 만든다.
 * 블록 글자가 같으면 지난번 결과를 그대로 쓴다. 지금 글에 없는 블록의 결과는 버린다(기억이 계속 늘지 않게).
 */
export function createBlockPreview(render: RenderFn): (markdown: string) => BlockPreview {
  let cache = new Map<string, string>();

  return (markdown) => {
    const next = new Map<string, string>();
    let rendered = 0;
    const blocks = splitBlocks(markdown);
    const parts = blocks.map((block) => {
      let html = next.get(block) ?? cache.get(block);
      if (html === undefined) {
        html = render(block);
        rendered++;
      }
      next.set(block, html);
      return html;
    });
    cache = next;
    return { html: parts.join(""), parts, rendered, total: blocks.length };
  };
}
