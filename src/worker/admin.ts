/**
 * 관리자 Worker 시작 파일 (admin.taerim.page).
 * 실제 저장소·설정으로 관리자 앱을 조립한다.
 *
 * 지금은 메모리 저장소라서 Worker가 다시 시작되면 글이 사라진다. (5단계에서 D1로 교체)
 */
import type { Hono } from "hono";
import { createAdminApp } from "../admin/app.ts";
import { denyAllAuthenticator, localDevAuthenticator } from "../admin/auth.ts";
import type { AdminAuthenticator, AdminEnv } from "../admin/auth.ts";
import { renderMarkdown } from "../markdown/index.ts";
import { MemoryPostRepository } from "../posts/memory-repository.ts";
import { PostService } from "../posts/service.ts";

/** Worker 환경 변수 */
interface AdminWorkerEnv {
  /** 로컬 개발이면 "development" (.dev.vars에만 넣는다. 배포 설정에는 넣지 않는다) */
  ENVIRONMENT?: string;
}

const service = new PostService(new MemoryPostRepository());
let app: Hono<AdminEnv> | undefined;

/**
 * 관리자 확인 방법 고르기.
 * - 로컬 개발: localhost 요청만 통과
 * - 그 밖: 배포용 Access 토큰 검증을 만들기 전까지는 모두 막음 (설정을 잊어도 열리지 않게)
 */
function chooseAuthenticator(env: AdminWorkerEnv): AdminAuthenticator {
  return env.ENVIRONMENT === "development" ? localDevAuthenticator() : denyAllAuthenticator();
}

export default {
  fetch(request: Request, env: AdminWorkerEnv): Response | Promise<Response> {
    app ??= createAdminApp({ service, render: renderMarkdown, authenticator: chooseAuthenticator(env) });
    return app.fetch(request, env);
  },
};
