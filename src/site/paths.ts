/**
 * 블로그 주소(경로) 만들기.
 * 글·태그 링크는 반드시 여기 함수로 만든다. 직접 문자열을 이어 붙이지 않는다.
 */

/** 글 주소. 예) 42 → "/posts/42" */
export function postPath(id: number): string {
  return `/posts/${id}`;
}

/**
 * 태그(카테고리) 주소. 태그 이름의 특수문자를 인코딩한다.
 * 예) "react" → "/tags/react", "c/c++" → "/tags/c%2Fc%2B%2B", "개발" → "/tags/%EA%B0%9C%EB%B0%9C"
 * (브라우저 주소창에는 한글이 그대로 보인다)
 */
export function tagPath(tag: string): string {
  return `/tags/${encodePathSegment(tag)}`;
}

/** 전체 글 목록 주소 (설계 15-4: 홈에서 옮김) */
export const POSTS_PATH = "/posts";

/** 아카이브 주소 (설계 15-5) */
export const ARCHIVE_PATH = "/archive";

/** 아카이브 안 활동 자리 (홈의 최근 활동이 가리킴). 예) 3 → "#activity-3" */
export function activityAnchor(id: number): string {
  return `activity-${id}`;
}

/** 검색 페이지와 검색 파일 (설계 15-7) */
export const SEARCH_PATH = "/search";
export const SEARCH_INDEX_PATH = "/search-index.json";
export const SEARCH_BODY_PATH = "/search-body.json";

/** 태그 모음 주소 */
export const TAGS_PATH = "/tags";

/**
 * 목록의 n번째 페이지 주소. 1페이지는 목록 주소 그대로, 2페이지부터 뒤에 /page/n
 * 예) ("/", 1) → "/", ("/", 2) → "/page/2", ("/tags/react", 3) → "/tags/react/page/3"
 * @param listPath 목록 주소 ("/" 또는 tagPath(…))
 */
export function pagePath(listPath: string, page: number): string {
  if (page <= 1) return listPath;
  return `${listPath === "/" ? "" : listPath}/page/${page}`;
}

/**
 * 주소의 한 칸(/와 / 사이)에 넣을 값을 인코딩한다.
 * - / ? # % & + 공백 등 주소에서 의미가 있는 문자는 %XX로 바꾼다 (encodeURIComponent)
 * - "." 이나 ".." 처럼 점만 있으면 브라우저가 "현재/상위 폴더"로 해석하므로 점도 %2E로 바꾼다
 */
export function encodePathSegment(value: string): string {
  const encoded = encodeURIComponent(value);
  return /^\.+$/.test(encoded) ? encoded.replaceAll(".", "%2E") : encoded;
}

/**
 * 인코딩된 주소 한 칸을 원래 값으로 되돌린다. 잘못된 인코딩이면 null.
 * 예) "c%2Fc%2B%2B" → "c/c++"
 */
export function decodePathSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}
