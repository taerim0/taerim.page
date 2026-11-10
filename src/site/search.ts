/**
 * 검색 (설계 15-7): 빌드가 만드는 검색 파일의 모양 + 방문자 브라우저에서 찾는 순수 함수.
 * 빌드(Node)와 검색 스크립트(search-client.ts → 브라우저)가 같이 쓴다 → DOM·Node 기능 없이
 *
 * 파일은 둘로 나눈다 (방문자가 받는 양 줄이기)
 * - search-index.json: 제목·태그·요약·날짜 (작음, 페이지 열 때)
 * - search-body.json: 본문 글자 (처음 입력할 때). items와 같은 순서
 */

/** 검색 항목 하나 (글 또는 활동) */
export interface SearchItem {
  /** 종류: 글 / 활동 */
  k: "post" | "activity";
  /** 누르면 갈 주소 */
  u: string;
  /** 제목 */
  t: string;
  /** 날짜 YYYY-MM-DD (정렬용) */
  d: string;
  /** 화면에 보일 날짜 ("2026-11-10" / "Nov 10, 2026") */
  dt: string;
  /** 태그 (활동은 빈 배열) */
  g: string[];
  /** 활동 꼬리표 (기본 "활동"이면 없음) */
  b?: string;
  /** 요약 (없으면 "") */
  s: string;
  /** 제목·내용의 언어가 페이지 언어와 다를 때 (영어 페이지의 한글 글) "ko" */
  l?: string;
  /** 번역 언어 페이지에서 아직 번역 안 된 글 */
  kr?: true;
}

export interface SearchIndex {
  items: SearchItem[];
}

export interface SearchBodies {
  /** items와 같은 순서의 본문 글자 */
  b: string[];
}

/** 본문 글자 한도 (글 하나당) */
export const SEARCH_BODY_LIMIT = 20_000;
/** 보여 줄 결과 최대 개수 */
export const SEARCH_RESULT_LIMIT = 50;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

/**
 * 렌더러가 만든 HTML → 순수 글자 (빌드에서 본문 글자 만들 때).
 * 태그를 걷고 문자 참조를 풀고 공백을 하나로. 블록 사이는 띄어 씀 (단어가 붙지 않게)
 */
export function htmlToText(html: string, limit = SEARCH_BODY_LIMIT): string {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    // 화면 장식(코드 줄 번호·diff +/-)은 읽는 글자가 아님 (aria-hidden, 안에 태그 없는 것만)
    .replace(/<span[^>]*\baria-hidden="true"[^>]*>[^<]*<\/span>/g, "")
    // 블록 태그·코드 줄은 띄어 씀 (단어가 붙지 않게), 글자 안의 태그(코드 색칠 span·굵게 등)는 그냥 걷음 → "greet(name" 그대로
    .replace(/<\/?(?:p|div|li|h[1-6]|pre|tr|td|th|br|hr|img|blockquote|ul|ol|table|thead|tbody|figure|figcaption|summary|details|section|article|aside|nav|header|footer|math)\b[^>]*>/gi, " ")
    .replace(/<span class="line\b[^>]*>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (whole, name: string) => {
      if (name in ENTITIES) return ENTITIES[name]!;
      if (name[0] === "#") {
        const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      }
      return whole;
    })
    .replace(/\s+/g, " ")
    .trim();
  return [...text].slice(0, limit).join("");
}

/** 비교용으로 맞추기: 전각/반각·호환 글자 통일(NFKC) + 소문자 */
export function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

/** 찾는 말 → 낱말들 (띄어쓰기로 나눔, 중복 빼기) */
export function queryTerms(query: string): string[] {
  return [...new Set(normalize(query).split(/\s+/).filter(Boolean))];
}

/** 발췌 조각: 찾은 말이면 mark */
export interface Segment {
  text: string;
  mark: boolean;
}

export interface SearchResult {
  item: SearchItem;
  /** 찾은 말 주변 한 줄 (요약이나 본문에서). 제목·태그에서만 찾았으면 요약 앞부분 */
  excerpt: Segment[];
}

/** 순위: 낱말마다 가장 좋은 칸 (제목 0 < 태그 1 < 요약 2 < 본문 3)의 합. 작을수록 위 */
const FIELD_RANK = { title: 0, tags: 1, summary: 2, body: 3 } as const;

/**
 * 찾기. 모든 낱말이 (제목·태그·요약·본문 중 어디든) 들어 있는 항목만, 순위 → 날짜 최신 → 원래 순서.
 * bodies가 없으면(아직 안 받음) 본문은 빼고 찾는다
 */
export function search(query: string, index: SearchIndex, bodies: SearchBodies | null = null, limit = SEARCH_RESULT_LIMIT): { total: number; results: SearchResult[] } {
  const terms = queryTerms(query);
  if (terms.length === 0) return { total: 0, results: [] };
  const found: { item: SearchItem; score: number; order: number; body: string }[] = [];
  index.items.forEach((item, order) => {
    const body = bodies?.b[order] ?? "";
    const fields = { title: normalize(item.t), tags: normalize(item.g.join(" ")), summary: normalize(item.s), body: normalize(body) };
    let score = 0;
    for (const term of terms) {
      const field = (Object.keys(FIELD_RANK) as (keyof typeof FIELD_RANK)[]).find((name) => fields[name].includes(term));
      if (field === undefined) return;
      score += FIELD_RANK[field];
    }
    found.push({ item, score, order, body });
  });
  found.sort((a, b) => a.score - b.score || (a.item.d === b.item.d ? a.order - b.order : a.item.d < b.item.d ? 1 : -1));
  return {
    total: found.length,
    results: found.slice(0, limit).map(({ item, body }) => ({ item, excerpt: excerpt(terms, [item.s, body]) })),
  };
}

/** 발췌 길이 (찾은 말 앞·뒤 글자 수) */
const BEFORE = 30;
const AFTER = 90;

/**
 * 찾은 말 주변 한 줄. texts 중 낱말이 처음 나오는 곳 (요약 → 본문 순), 없으면 첫 글의 앞부분.
 * 그 안의 낱말은 모두 mark
 */
export function excerpt(terms: readonly string[], texts: readonly string[]): Segment[] {
  for (const text of texts) {
    if (!text) continue;
    const chars = [...text];
    const lower = chars.map((c) => normalize(c));
    const at = firstMatch(lower, terms);
    if (at === -1) continue;
    const start = Math.max(0, at - BEFORE);
    const end = Math.min(chars.length, at + AFTER);
    return withMarks(chars.slice(start, end), lower.slice(start, end), terms, start > 0, end < chars.length);
  }
  const first = texts.find(Boolean) ?? "";
  const chars = [...first];
  return chars.length === 0 ? [] : withMarks(chars.slice(0, BEFORE + AFTER), chars.slice(0, BEFORE + AFTER).map((c) => normalize(c)), terms, false, chars.length > BEFORE + AFTER);
}

/** 글자 배열(각 글자를 맞춘 것)에서 낱말이 처음 시작하는 글자 위치 */
function firstMatch(lower: readonly string[], terms: readonly string[]): number {
  let best = -1;
  for (const term of terms) {
    const at = indexIn(lower, term, 0);
    if (at !== -1 && (best === -1 || at < best)) best = at;
  }
  return best;
}

/** lower[from…]에서 term이 시작하는 글자 위치 (글자 하나가 NFKC로 여러 글자가 되어도 맞게) */
function indexIn(lower: readonly string[], term: string, from: number): number {
  for (let i = from; i < lower.length; i++) {
    let joined = "";
    for (let j = i; j < lower.length && joined.length < term.length; j++) joined += lower[j];
    if (joined.startsWith(term)) return i;
  }
  return -1;
}

function withMarks(chars: string[], lower: string[], terms: readonly string[], cutStart: boolean, cutEnd: boolean): Segment[] {
  const marked = new Array<boolean>(chars.length).fill(false);
  for (const term of terms) {
    for (let at = indexIn(lower, term, 0); at !== -1; at = indexIn(lower, term, at + 1)) {
      let length = 0;
      for (let j = at; j < lower.length && length < term.length; j++) {
        marked[j] = true;
        length += lower[j]!.length;
      }
    }
  }
  const segments: Segment[] = [];
  chars.forEach((char, i) => {
    const last = segments.at(-1);
    if (last && last.mark === marked[i]) last.text += char;
    else segments.push({ text: char, mark: marked[i]! });
  });
  if (cutStart) segments.unshift({ text: "…", mark: false });
  if (cutEnd) segments.push({ text: "…", mark: false });
  return segments;
}
