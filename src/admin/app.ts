import { Hono } from "hono";
import { requireAdmin, requireSameOrigin } from "./auth.ts";
import type { AdminAuthenticator, AdminEnv } from "./auth.ts";
import { HttpError, toErrorResponse } from "./http-errors.ts";
import { createPageRoutes } from "./pages.ts";
import type { AssetFetcher } from "./pages.ts";
import { createApiRoutes } from "./routes.ts";
import type { ApiDeps } from "./routes.ts";

/** 관리자 앱에 필요한 것들 */
export interface AdminAppDeps extends ApiDeps {
  /** 관리자 확인 방법 (로컬 개발용 / 배포용) */
  authenticator: AdminAuthenticator;
  /** 예상 못 한 오류가 났을 때 기록하는 곳. 기본: console.error (Workers 로그에 남음) */
  logUnexpectedError?: (error: unknown, request: Request) => void;
  /** 관리자 화면 파일 (admin-ui). 없으면 API만 동작한다 */
  assets?: AssetFetcher;
}

/**
 * 관리자 Worker 앱을 조립한다.
 * 테스트에서는 메모리 저장소로, 실제로는 D1 저장소로 같은 앱을 만든다.
 *
 * 요청이 지나가는 순서:
 *  1. 공통 응답 헤더 (캐시 금지 등)
 *  2. 관리자 확인 → 아니면 401   ※ 없는 주소도 먼저 막는다 (어떤 주소가 있는지 숨김)
 *  3. 쓰기 요청 출처 확인 → 다르면 403
 *  4. /api 주소 처리, 그 밖은 관리자 화면 파일
 *  5. 실패하면 정해진 오류 모양으로 변환, 없는 주소는 404
 */
export function createAdminApp(deps: AdminAppDeps): Hono<AdminEnv> {
  const app = new Hono<AdminEnv>();
  const logError = deps.logUnexpectedError ?? defaultLogError;

  app.use("*", async (c, next) => {
    await next();
    // 관리자 데이터는 브라우저·중간 서버가 저장해 두지 않게
    c.header("Cache-Control", "no-store");
    // 응답 형식을 브라우저가 멋대로 추측하지 않게 (JSON을 HTML로 해석하는 공격 방지)
    c.header("X-Content-Type-Options", "nosniff");
  });

  app.use("*", requireAdmin(deps.authenticator));
  app.use("*", requireSameOrigin());

  app.route("/api", createApiRoutes(deps));
  if (deps.assets) app.route("/", createPageRoutes(deps.assets));

  app.notFound((c) => {
    const { status, body } = toErrorResponse(new HttpError("not_found", "없는 주소예요"));
    return c.json(body, status);
  });

  app.onError((error, c) => {
    const { status, body, expected } = toErrorResponse(error);
    if (!expected) logError(error, c.req.raw);
    return c.json(body, status);
  });

  return app;
}

function defaultLogError(error: unknown, request: Request): void {
  const { pathname } = new URL(request.url);
  console.error(`[admin] ${request.method} ${pathname} 처리 중 예상 못 한 오류`, error);
}
