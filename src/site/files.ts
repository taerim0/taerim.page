import { LOCALES, localizedPath } from "./i18n.ts";
import { SEARCH_BODY_PATH, SEARCH_INDEX_PATH } from "./paths.ts";

/**
 * 주소 → 정적 파일 이름. 빌드 스크립트가 dist/site 아래에 이 이름으로 쓴다.
 *
 * Cloudflare 정적 파일의 기본 HTML 규칙(auto-trailing-slash)에서는 /posts/7 요청이 posts/7.html을 찾는다.
 * 그래서 HTML 페이지는 주소 뒤에 .html, 홈(/)은 index.html.
 * HTML이 아닌 파일(언어별 rss.xml·검색 파일 json, sitemap.xml)만 이름 그대로. "점이 있으면 그대로"로 정하면
 * /tags/v1.0 같은 태그 페이지가 .html 없이 저장되므로, 그대로 둘 파일은 목록으로 정해 둔다.
 *
 * 인코딩된 주소(/tags/%EC%9D%BC%EC%83%81)는 **풀어서(디코딩)** 파일 이름으로 쓴다 → tags/일상.html
 * Cloudflare가 요청 주소를 풀어서 파일을 찾기 때문 (2026-11-08 wrangler dev로 확인: 인코딩된 이름의 파일은 404)
 */
const NON_HTML_FILES = new Set([
  "/sitemap.xml",
  ...LOCALES.flatMap((locale) => ["/rss.xml", SEARCH_INDEX_PATH, SEARCH_BODY_PATH].map((path) => localizedPath(locale, path))),
]);

export function fileNameFor(urlPath: string): string {
  if (urlPath === "/") return "index.html";
  const name = decodeURIComponent(urlPath.replace(/^\//, ""));
  return NON_HTML_FILES.has(urlPath) ? name : `${name}.html`;
}
