import MarkdownItFactory from "markdown-it";
import type { Token } from "markdown-it";
import { calloutMarkers } from "../markdown/callout.ts";
import { embedUrls } from "../markdown/embed.ts";
import { parseImageOptions } from "../markdown/image.ts";
import { findPlaceholders, hasUnknownPlaceholder } from "./protect.ts";
import type { TranslationContent } from "./types.ts";

/**
 * 번역 결과 검사 (설계 12-8). 둘 다 코드 블록이 자리표로 바뀐 상태로 비교한다.
 * 문제가 있으면 화면에 보여 줄 이유(한국어), 없으면 null.
 *
 * 이미지·링크·제목 줄·표는 Markdown을 실제로 읽어서 센다 (글자 찾기보다 정확: 인라인 코드 속 ![x](y)는 이미지가 아님)
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
  if (!sameList(before.tables, after.tables)) return "표 모양이 원문과 달라요";
  if (!sameList(embedUrls(source.body), embedUrls(result.body))) return "임베드(!embed) 주소가 원문과 달라요";
  if (!sameList(indents(source.body), indents(result.body))) return "들여쓰기(줄 앞 공백)가 원문과 달라요";
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
  /** 표마다 "줄 수x칸 수" (순서대로) */
  tables: string[];
}

function outline(markdown: string): Outline {
  const result: Outline = { images: [], links: [], headings: 0, tables: [] };
  let table: { rows: number; cols: number } | null = null;
  const visit = (tokens: Token[]) => {
    for (const token of tokens) {
      if (token.type === "heading_open") result.headings++;
      if (token.type === "table_open") table = { rows: 0, cols: 0 };
      if (table && token.type === "tr_open") table.rows++;
      if (table && token.type === "th_open") table.cols++;
      if (table && token.type === "table_close") {
        result.tables.push(`${table.rows}x${table.cols}`);
        table = null;
      }
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

/** 줄 앞 공백이 있는 줄들의 공백 수 (순서대로). 들여쓰기·하위 목록 (설계 13-11). 코드 블록은 자리표라 안 셈 */
function indents(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => /^ */.exec(line)?.[0].length ?? 0)
    .filter((count) => count > 0)
    .map(String);
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}
