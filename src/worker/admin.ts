/**
 * 관리자 Worker 시작 파일 (admin.taerim.page).
 * 실제 저장소·설정으로 관리자 앱을 조립한다.
 *
 * 저장소: D1 (env.DB). 로컬 개발(wrangler dev)에서는 내 PC의 로컬 D1(.wrangler/)을 쓴다.
 */
import type { Hono } from "hono";
import { createAdminApp } from "../admin/app.ts";
import { accessAuthenticator, denyAllAuthenticator, localDevAuthenticator } from "../admin/auth.ts";
import type { AdminAuthenticator, AdminEnv } from "../admin/auth.ts";
import type { AssetFetcher } from "../admin/pages.ts";
import { renderMarkdown } from "../markdown/index.ts";
import type { D1Database } from "../posts/d1.ts";
import { D1PostRepository } from "../posts/d1-repository.ts";
import { PostService } from "../posts/service.ts";

/** Worker 환경 변수·연결 */
interface AdminWorkerEnv {
  /** D1 연결 (wrangler.jsonc의 binding "DB") */
  DB: D1Database;
  /** 관리자 화면 파일 (wrangler.jsonc의 assets, binding "ASSETS") */
  ASSETS: AssetFetcher;
  /** 로컬 개발이면 "development" (.dev.vars에만 넣는다. 배포 설정에는 넣지 않는다) */
  ENVIRONMENT?: string;
  /** Cloudflare Access 팀 도메인 (예: taerim.cloudflareaccess.com). 배포 설정(vars)에 넣는다 */
  ACCESS_TEAM_DOMAIN?: string;
  /** Access 앱의 AUD 태그 */
  ACCESS_AUD?: string;
  /** 관리자 이메일 (여러 개면 쉼표로) */
  ADMIN_EMAILS?: string;
}

/** 조립한 앱은 Worker가 살아 있는 동안 다시 쓴다 (요청마다 새로 만들 필요 없음) */
let app: Hono<AdminEnv> | undefined;

/**
 * 관리자 확인 방법 고르기.
 * - 로컬 개발: localhost 요청만 통과
 * - 배포: Access 설정 3개(팀 도메인·AUD·관리자 이메일)가 모두 있으면 Access 토큰 확인
 * - 하나라도 빠지면 모두 막음 (설정을 잊어도 열리지 않게)
 */
function chooseAuthenticator(env: AdminWorkerEnv): AdminAuthenticator {
  if (env.ENVIRONMENT === "development") return localDevAuthenticator();
  const allowedEmails = (env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim()).filter(Boolean);
  if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD && allowedEmails.length > 0) {
    return accessAuthenticator({ teamDomain: env.ACCESS_TEAM_DOMAIN, audience: env.ACCESS_AUD, allowedEmails });
  }
  return denyAllAuthenticator();
}

function buildApp(env: AdminWorkerEnv): Hono<AdminEnv> {
  const service = new PostService(new D1PostRepository(env.DB));
  return createAdminApp({
    service,
    render: renderMarkdown,
    authenticator: chooseAuthenticator(env),
    assets: env.ASSETS,
  });
}

export default {
  fetch(request: Request, env: AdminWorkerEnv): Response | Promise<Response> {
    app ??= buildApp(env);
    return app.fetch(request, env);
  },
};
