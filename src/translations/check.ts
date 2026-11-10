import MarkdownItFactory from "markdown-it";
import type { Token } from "markdown-it";
import { calloutMarkers } from "../markdown/callout.ts";
import { parseImageOptions } from "../markdown/image.ts";
import { findPlaceholders, hasUnknownPlaceholder } from "./protect.ts";
import type { TranslationContent } from "./types.ts";

/**
 * 번역 결과 검사 (설계 12-8). 둘 다 코드 블록이 자리표로 바뀐 상태로 비교한다.
 * 문제가 있으면 화면에 보여 줄 이유(한국어), 없으면 null.
 *
 * 이미지·링크·제목 줄은 Markdown을 실제로 읽어서 센다 (글자 찾기보다 정확: 인라인 코드 속 ![x](y)는 이미지가 아님)
 */
export function checkTranslation(source: TranslationContent, result: TranslationContent, codeBlocks: number): string | null {
  if (result.title === "") return "제목이 비어 있어요";
  if (result.body.trim() === "") return "본문이 비어 있어요";
  if (source.summary && !result.summary) return "요약이 빠졌어요";
  if (!source.summary && result.summary) return "원문에 없는 요약이 생겼어요";

  for (const found of findPlaceholders(result.body, codeBlocks)) {
    const mark = `[[CODE_${found.index + 1}]]`;
    if (found.occurrences === 0) return `코드 블록 ${mark}이 빠졌어요`;
    if (found.occurrences > 1) return `코드 블록 ${mark}이 여러 번 나와요`;
    if (!found.ownLine) return `코드 블록 ${mark}이 한 줄에 혼자 있지 않아요`;
  }
  if (hasUnknownPlaceholder(result.body, codeBlocks)) return "원문에 없는 코드 블록 자리표가 생겼어요";

  const before = outline(source.body);
  const after = outline(result.body);
  if (!sameList(before.images, after.images)) return "이미지(주소·크기·정렬)가 원문과 달라요";
  if (!sameList([...before.links].sort(), [...after.links].sort())) return "링크 주소가 원문과 달라요";
  if (before.headings !== after.headings) return `제목 줄 개수가 달라요 (원문 ${before.headings}, 번역 ${after.headings})`;
  if (!sameList(calloutMarkers(source.body), calloutMarkers(result.body))) return "콜아웃이 원문과 달라요";
  return null;
}

// 기본 설정(HTML 끔). 검사는 구조만 보므로 블로그 렌더러의 모듈들은 필요 없다
const md = new MarkdownItFactory({ html: false });

interface Outline {
  /** 이미지마다 "주소 크기 정렬" (순서대로) */
  images: string[];
  /** 링크 주소 */
  links: string[];
  /** 제목 줄 개수 */
  headings: number;
}

function outline(markdown: string): Outline {
  const result: Outline = { images: [], links: [], headings: 0 };
  const visit = (tokens: Token[]) => {
    for (const token of tokens) {
      if (token.type === "heading_open") result.headings++;
      if (token.type === "link_open") result.links.push(String(token.attrGet("href") ?? ""));
      if (token.type === "image") {
        const { width, align } = parseImageOptions(token.content);
        result.images.push(`${String(token.attrGet("src") ?? "")} ${width ?? "-"} ${align ?? "-"}`);
      }
      if (token.children) visit(token.children);
    }
  };
  visit(md.parse(markdown, {}));
  return result;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}
