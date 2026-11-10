/**
 * HTML에서 링크 카드 정보 읽기 (설계 13-9): og 태그 → 없으면 <title>·description
 * Worker·Node 어디서나 돌도록 정규식으로 읽는다 (HTML 전체를 해석하지 않음 — <head> 안의 meta면 충분)
 */

export interface PageMeta {
  title: string | null;
  description: string | null;
  siteName: string | null;
  /** 대표 그림 주소 (페이지 주소 기준 절대 주소) */
  image: string | null;
}

const META_TAG = /<meta\b[^>]*>/gi;
const ATTRIBUTE = /([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
const TITLE_TAG = /<title\b[^>]*>([\s\S]*?)<\/title>/i;

/** 제목·설명 최대 길이 (너무 긴 값은 자름) */
const MAX_TEXT = 300;

export function readPageMeta(html: string, pageUrl: string): PageMeta {
  const meta = new Map<string, string>();
  for (const tag of html.match(META_TAG) ?? []) {
    const attributes = new Map<string, string>();
    for (const match of tag.matchAll(ATTRIBUTE)) {
      attributes.set(match[1]!.toLowerCase(), match[3] ?? match[4] ?? match[5] ?? "");
    }
    const key = (attributes.get("property") ?? attributes.get("name") ?? "").toLowerCase();
    const content = attributes.get("content");
    if (key && content !== undefined && !meta.has(key)) meta.set(key, content);
  }
  const titleTag = TITLE_TAG.exec(html)?.[1];
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = meta.get(key);
      if (value && clean(value)) return clean(value);
    }
    return null;
  };
  const image = pick("og:image", "og:image:url", "twitter:image");
  return {
    title: pick("og:title", "twitter:title") ?? (titleTag ? clean(titleTag) : null),
    description: pick("og:description", "twitter:description", "description"),
    siteName: pick("og:site_name"),
    image: image ? absolute(image, pageUrl) : null,
  };
}

/** HTML 문자 참조 풀기 + 공백 정리 + 길이 제한. 비면 null */
function clean(text: string): string | null {
  const decoded = text
    .replace(/&#(\d+);/g, (_, code: string) => safeChar(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => safeChar(parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (_, name: string) => NAMED[name] ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!decoded) return null;
  const chars = [...decoded];
  return chars.length > MAX_TEXT ? `${chars.slice(0, MAX_TEXT - 1).join("")}…` : decoded;
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };

function safeChar(code: number): string {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

/** 상대 주소 → 절대 주소 (http(s)만). 아니면 null */
function absolute(url: string, base: string): string | null {
  try {
    const resolved = new URL(url, base);
    return resolved.protocol === "https:" || resolved.protocol === "http:" ? resolved.href : null;
  } catch {
    return null;
  }
}
