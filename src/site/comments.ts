/**
 * 반응·댓글 = giscus (설계 2-1, docs/05): 글 하나 = GitHub Discussions 토론 하나.
 * giscus.app의 client.js를 그대로 쓰지 않고 iframe 주소를 여기서 만든다 → 남의 스크립트는 iframe 안에서만 돈다.
 * (주소 모양·세션 처리는 giscus client.js(MIT)와 같게)
 *
 * 순수 함수 — 빌드(Node)·방문자 스크립트(comments-client.ts → 브라우저)가 같이 쓴다
 */

export const GISCUS_ORIGIN = "https://giscus.app";

/** 로그인 세션을 기억하는 곳 (giscus client.js와 같은 이름 → 다른 giscus 사이트와 같은 방식) */
export const GISCUS_SESSION_KEY = "giscus-session";

/** 사이트 설정의 giscus 값 (공개 값) */
export interface GiscusConfig {
  /** owner/name */
  repo: string;
  repoId: string;
  category: string;
  categoryId: string;
}

/** 글 ↔ 토론 연결 이름. 한·영 페이지가 같은 토론을 보게 주소 대신 글 id */
export function discussionTerm(postId: number): string {
  return `post-${postId}`;
}

export type GiscusTheme = "light" | "dark";

/**
 * 우리 색 테마 CSS 주소 (설계 2-1 손봄, 시안 C-2): giscus가 iframe 안에 이 CSS를 붙인다.
 * 사이트 주소(canonical) 기준 → 로컬 미리보기에서도 배포된 테마를 씀 (giscus는 https라 localhost CSS를 못 읽음)
 */
export function giscusThemeUrl(siteBase: string, mode: GiscusTheme): string {
  return new URL(`/assets/giscus-${mode}.css`, siteBase).href;
}

export interface WidgetOptions extends GiscusConfig {
  term: string;
  /** "ko" | "en" */
  lang: string;
  /** 테마: 이름("light") 또는 CSS 주소 */
  theme: string;
  /** 이 페이지 주소 (giscus 로그인 후 돌아올 곳, #·?giscus= 뺀 것) */
  origin: string;
  /** 로그인 세션 (없으면 "") */
  session: string;
  /** 토론 첫 글에 들어갈 설명·링크 */
  description: string;
  backLink: string;
}

/** giscus iframe 주소 */
export function giscusWidgetUrl(o: WidgetOptions): string {
  const params = new URLSearchParams({
    origin: o.origin,
    session: o.session,
    theme: o.theme,
    reactionsEnabled: "1",
    emitMetadata: "0",
    inputPosition: "bottom",
    repo: o.repo,
    repoId: o.repoId,
    category: o.category,
    categoryId: o.categoryId,
    strict: "1",
    description: o.description,
    backLink: o.backLink,
    term: o.term,
  });
  return `${GISCUS_ORIGIN}/${o.lang}/widget?${params.toString()}`;
}

/**
 * 페이지 주소에서 giscus 로그인 세션(?giscus=)을 떼어 냄.
 * 돌려주는 cleaned = #과 giscus 값을 뺀 주소 (origin·뒤로 가기용)
 */
export function splitSession(href: string): { cleaned: string; session: string | null } {
  const url = new URL(href);
  const session = url.searchParams.get("giscus");
  url.searchParams.delete("giscus");
  url.hash = "";
  return { cleaned: url.toString(), session };
}
