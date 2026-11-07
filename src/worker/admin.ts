/**
 * 관리자 Worker 시작 파일 (admin.taerim.page).
 * 실제 저장소·설정으로 관리자 앱을 조립한다.
 *
 * 저장소: D1 (env.DB). 로컬 개발(wrangler dev)에서는 내 PC의 로컬 D1(.wrangler/)을 쓴다.
 */
import type { Hono } from "hono";
import { createAdminApp } from "../admin/app.ts";
import { denyAllAuthenticator, localDevAuthenticator } from "../admin/auth.ts";
import type { AdminAuthenticator, AdminEnv } from "../admin/auth.ts";
import { renderMarkdown } from "../markdown/index.ts";
import type { D1Database } from "../posts/d1.ts";
import { D1PostRepository } from "../posts/d1-repository.ts";
import { PostService } from "../posts/service.ts";

/** Worker 환경 변수·연결 */
interface AdminWorkerEnv {
  /** D1 연결 (wrangler.jsonc의 binding "DB") */
  DB: D1Database;
  /** 로컬 개발이면 "development" (.dev.vars에만 넣는다. 배포 설정에는 넣지 않는다) */
  ENVIRONMENT?: string;
}

/** 조립한 앱은 Worker가 살아 있는 동안 다시 쓴다 (요청마다 새로 만들 필요 없음) */
let app: Hono<AdminEnv> | undefined;

/**
 * 관리자 확인 방법 고르기.
 * - 로컬 개발: localhost 요청만 통과
 * - 그 밖: 배포용 Access 토큰 검증을 만들기 전까지는 모두 막음 (설정을 잊어도 열리지 않게)
 */
function chooseAuthenticator(env: AdminWorkerEnv): AdminAuthenticator {
  return env.ENVIRONMENT === "development" ? localDevAuthenticator() : denyAllAuthenticator();
}

function buildApp(env: AdminWorkerEnv): Hono<AdminEnv> {
  const service = new PostService(new D1PostRepository(env.DB));
  return createAdminApp({ service, render: renderMarkdown, authenticator: chooseAuthenticator(env) });
}

export default {
  fetch(request: Request, env: AdminWorkerEnv): Response | Promise<Response> {
    app ??= buildApp(env);
    return app.fetch(request, env);
  },
};
