import type { MarkdownIt } from "markdown-it";

/** 목차 항목 하나 = 본문의 제목 하나 */
export interface TocItem {
  /** 제목 단계. # → 1, ## → 2 … */
  level: number;
  /** 제목에 붙인 id. 주소 뒤 #id 로 바로 이동한다 */
  id: string;
  /** 제목 글자 (꾸밈 기호 없이) */
  text: string;
}

/**
 * 렌더링 한 번 동안 제목 정보를 모으는 곳 (markdown-it의 env로 넘긴다)
 * (interface가 아니라 type: markdown-it의 env 타입(아무 키나 받는 객체)에 넘길 수 있게)
 */
export type HeadingEnv = {
  toc?: TocItem[];
};

/**
 * 제목 글자 → id.
 * - 앞뒤 공백 제거, 영어는 소문자로, 한글 등 글자·숫자는 그대로
 * - 띄어쓰기는 -, 글자·숫자·-·_ 가 아닌 기호는 지움 (예: "C++ 설치하기!" → "c-설치하기")
 * - 남는 게 없으면 "section"
 */
export function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "section";
}

/**
 * 제목(h1~h6)에 id를 붙이고, 목차 정보를 env.toc에 모으는 규칙을 등록한다.
 * - 같은 글 안에서 id가 겹치면 뒤에 -2, -3 … (이미 그 이름이 있으면 다음 번호)
 * - 렌더링마다 새로 센다. 관리자의 블록 미리보기는 블록마다 따로 렌더링해서 겹침 번호가 다를 수 있다
 *   (입력이 멈추면 전체 렌더링으로 바로잡히고, 빌드는 항상 전체 렌더링)
 */
export function addHeadingIds(md: MarkdownIt): void {
  md.core.ruler.push("heading_ids", (state) => {
    const used = new Set<string>();
    const env = state.env as HeadingEnv;
    const tokens = state.tokens;

    for (let i = 0; i < tokens.length; i++) {
      const open = tokens[i]!;
      if (open.type !== "heading_open") continue;

      // heading_open 바로 다음이 제목 내용(inline). 꾸밈(굵게·링크 등)을 뺀 글자만 모은다
      const inline = tokens[i + 1];
      const text = (inline?.children ?? [])
        .filter((child) => child.type === "text" || child.type === "code_inline")
        .map((child) => child.content)
        .join("");

      const base = slugify(text);
      let id = base;
      for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
      used.add(id);

      open.attrSet("id", id);
      env.toc?.push({ level: Number(open.tag.slice(1)), id, text: text.trim() });
    }
  });
}
