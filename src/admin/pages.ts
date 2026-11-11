import { Hono } from "hono";
import type { Context } from "hono";
import type { AdminEnv } from "./auth.ts";
import { isTranslationLang } from "../translations/types.ts";
import { HttpError } from "./http-errors.ts";

/**
 * 정적 파일 꺼내 오는 곳. 배포·wrangler dev에서는 env.ASSETS (wrangler.jsonc의 assets),
 * 테스트에서는 가짜를 넣는다.
 */
export interface AssetFetcher {
  fetch(request: Request): Promise<Response>;
}

/**
 * 관리자 화면 주소 → admin-ui 폴더의 파일.
 * 화면 파일도 관리자 확인을 거친 뒤에만 나간다 (app.ts에서 이 라우트보다 먼저 확인).
 *
 *   /                 → index.html   글 목록
 *   /posts/new        → post.html    새 글
 *   /posts/edit/:id   → post.html    편집 (JS가 주소에서 id를 읽음)
 *   /posts/translate/:id/:lang → translate.html  번역본 편집 (지원 언어만, 설계 12-10)
 *   /tags             → tags.html    태그
 *   /settings         → settings.html 사이트 설정 (설계 15-3)
 *   /activities           → activities.html 활동 쓰기 (설계 15-5)
 *   /trash            → trash.html   휴지통
 *   /assets/…         → 그대로       CSS·JS
 */
export function createPageRoutes(assets: AssetFetcher): Hono<AdminEnv> {
  const pages = new Hono<AdminEnv>();
  const serve = (file: string) => (c: Context<AdminEnv>) => serveFile(c, assets, file);

  pages.get("/", serve("/index.html"));
  pages.get("/posts/new", serve("/post.html"));
  pages.get("/posts/edit/:id{[1-9][0-9]*}", serve("/post.html")); // 글 번호가 아니면 404
  pages.get("/posts/translate/:id{[1-9][0-9]*}/:lang", (c) => {
    if (!isTranslationLang(c.req.param("lang"))) throw new HttpError("not_found", "없는 주소예요");
    return serveFile(c, assets, "/translate.html");
  });
  pages.get("/tags", serve("/tags.html"));
  pages.get("/settings", serve("/settings.html"));
  pages.get("/activities", serve("/activities.html"));
  pages.get("/images", serve("/images.html"));
  pages.get("/trash", serve("/trash.html"));
  pages.get("/assets/*", (c) => serveFile(c, assets, c.req.path));

  return pages;
}

/** 파일 하나를 꺼내 응답한다. 없으면 404 (정해진 오류 모양) */
async function serveFile(c: Context<AdminEnv>, assets: AssetFetcher, path: string): Promise<Response> {
  const url = new URL(path, c.req.url);
  const response = await assets.fetch(new Request(url, { method: c.req.method, headers: c.req.raw.headers }));
  if (response.status === 404) throw new HttpError("not_found", "없는 주소예요");
  // 꺼내 온 응답은 헤더를 못 고치게 잠겨 있을 수 있어서, 공통 헤더(캐시 금지 등)를 붙일 수 있게 복사한다
  return new Response(response.body, response);
}
