/**
 * 관리자 Worker 시작 파일 (admin.taerim.page).
 * 실제 저장소·설정으로 관리자 앱을 조립한다.
 *
 * 저장소: D1 (env.DB), 이미지 파일은 R2 (env.IMAGES).
 * 로컬 개발(wrangler dev)에서는 내 PC의 로컬 D1·R2(.wrangler/)를 쓴다.
 */
import { D1ViewsRepository } from "../stats/views.ts";
import { D1ActivityRepository, ActivityService } from "../activities/activities.ts";
import type { Hono } from "hono";
import { createAdminApp } from "../admin/app.ts";
import { accessAuthenticator, denyAllAuthenticator, localDevAuthenticator } from "../admin/auth.ts";
import { githubDeployTrigger } from "../admin/deploy.ts";
import type { DeployTrigger } from "../admin/deploy.ts";
import type { AdminAuthenticator, AdminEnv } from "../admin/auth.ts";
import type { AssetFetcher } from "../admin/pages.ts";
import { D1ImageRepository } from "../images/d1-repository.ts";
import type { R2Bucket } from "../images/r2.ts";
import { ImageService } from "../images/service.ts";
import { R2ImageStore } from "../images/store.ts";
import { renderMarkdown } from "../markdown/index.ts";
import type { D1Database } from "../posts/d1.ts";
import { D1PostRepository } from "../posts/d1-repository.ts";
import { PostService } from "../posts/service.ts";
import { D1EmbedRepository } from "../embeds/repository.ts";
import { D1SettingsRepository, SettingsService } from "../settings/settings.ts";
import { EmbedService } from "../embeds/service.ts";
import { createLlmClient } from "../translations/config.ts";
import { D1TranslationRepository } from "../translations/d1-repository.ts";
import { TranslationService } from "../translations/service.ts";

/** Worker 환경 변수·연결 */
interface AdminWorkerEnv {
  /** D1 연결 (wrangler.jsonc의 binding "DB") */
  DB: D1Database;
  /** 관리자 화면 파일 (wrangler.jsonc의 assets, binding "ASSETS") */
  ASSETS: AssetFetcher;
  /** 이미지 파일 R2 버킷 (wrangler.jsonc의 r2_buckets, binding "IMAGES"). 없으면 이미지 기능 503 */
  IMAGES?: R2Bucket;
  /** 로컬 개발이면 "development" (.dev.vars에만 넣는다. 배포 설정에는 넣지 않는다) */
  ENVIRONMENT?: string;
  /** Cloudflare Access 팀 도메인 (예: taerim.cloudflareaccess.com). 배포 설정(vars)에 넣는다 */
  ACCESS_TEAM_DOMAIN?: string;
  /** Access 앱의 AUD 태그 */
  ACCESS_AUD?: string;
  /** 관리자 이메일 (여러 개면 쉼표로) */
  ADMIN_EMAILS?: string;
  /** 배포 워크플로가 있는 저장소. 예) "taerim0/taerim.page" (vars) */
  GITHUB_REPOSITORY?: string;
  /** 배포 워크플로 실행용 GitHub 토큰 (시크릿: wrangler secret put GITHUB_DEPLOY_TOKEN) */
  GITHUB_DEPLOY_TOKEN?: string;
  /** 번역 제공자 이름 (vars). 지금은 로컬 전용 "fake"만 — 실제 제공자는 정할 때 추가 (설계 12-8) */
  TRANSLATE_PROVIDER?: string;
  /** 번역 모델 이름 (vars) */
  TRANSLATE_MODEL?: string;
  /** 번역 제공자 API 키 (시크릿: 사용자가 wrangler secret put TRANSLATE_API_KEY로 직접 등록) */
  TRANSLATE_API_KEY?: string;
}

/** 공개 사이트 빌드·배포 워크플로 파일 (.github/workflows/) */
const SITE_WORKFLOW = "deploy-site.yml";

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

/** 배포 설정(저장소·토큰)이 둘 다 있을 때만 배포 버튼이 동작한다 */
function chooseDeploy(env: AdminWorkerEnv): DeployTrigger | undefined {
  if (!env.GITHUB_REPOSITORY || !env.GITHUB_DEPLOY_TOKEN) return undefined;
  return githubDeployTrigger({ token: env.GITHUB_DEPLOY_TOKEN, repository: env.GITHUB_REPOSITORY, workflow: SITE_WORKFLOW });
}

function buildApp(env: AdminWorkerEnv): Hono<AdminEnv> {
  const posts = new D1PostRepository(env.DB);
  const service = new PostService(posts);
  return createAdminApp({
    service,
    render: renderMarkdown,
    authenticator: chooseAuthenticator(env),
    deploy: chooseDeploy(env),
    images: env.IMAGES ? new ImageService(new R2ImageStore(env.IMAGES), new D1ImageRepository(env.DB)) : undefined,
    settings: new SettingsService(new D1SettingsRepository(env.DB)),
    activities: new ActivityService(new D1ActivityRepository(env.DB)),
    views: new D1ViewsRepository(env.DB),
    // 임베드 카드: 정보는 D1, 대표 그림은 R2(이미지와 같은 버킷), GitHub API는 배포 토큰이 있으면 같이 (요청 한도용)
    embeds: new EmbedService(new D1EmbedRepository(env.DB), { bucket: env.IMAGES, githubToken: env.GITHUB_DEPLOY_TOKEN }),
    translations: new TranslationService(posts, new D1TranslationRepository(env.DB), { llm: createLlmClient(env) }),
    assets: env.ASSETS,
  });
}

export default {
  fetch(request: Request, env: AdminWorkerEnv): Response | Promise<Response> {
    app ??= buildApp(env);
    return app.fetch(request, env);
  },
};
