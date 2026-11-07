import type { MiddlewareHandler } from "hono";
import { HttpError } from "./http-errors.ts";

/** 확인된 관리자 */
export interface AdminIdentity {
  email: string;
}

/**
 * 관리자 확인 방법. 요청을 보고 관리자면 그 정보를, 아니면 null을 돌려준다.
 * - 배포: Cloudflare Access 토큰 검증 (배포 단계에서 jose로 구현)
 * - 로컬 개발: localhost 요청만 통과
 */
export interface AdminAuthenticator {
  verify(request: Request): Promise<AdminIdentity | null>;
}

/** Hono에서 관리자 정보를 꺼내 쓰기 위한 타입. c.get("admin") */
export interface AdminEnv {
  Variables: { admin: AdminIdentity };
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * 로컬 개발용: 내 컴퓨터(localhost)로 들어온 요청만 관리자로 본다.
 * 배포된 Worker는 주소가 admin.taerim.page 등이므로, 실수로 이 방법을 써도 통과되지 않는다.
 */
export function localDevAuthenticator(): AdminAuthenticator {
  return {
    async verify(request) {
      const host = new URL(request.url).hostname;
      return LOCAL_HOSTS.has(host) ? { email: "dev@localhost" } : null;
    },
  };
}

/**
 * 아무도 통과시키지 않는 방법. 설정이 빠졌을 때의 기본값으로 쓴다.
 * (설정을 잊으면 "모두 열림"이 아니라 "모두 막힘"이 되게)
 */
export function denyAllAuthenticator(): AdminAuthenticator {
  return { verify: async () => null };
}

/** 관리자가 아니면 401. 관리자면 c.get("admin")으로 정보를 꺼낼 수 있다. */
export function requireAdmin(authenticator: AdminAuthenticator): MiddlewareHandler<AdminEnv> {
  return async (c, next) => {
    const admin = await authenticator.verify(c.req.raw);
    if (!admin) throw new HttpError("unauthorized", "관리자만 쓸 수 있어요");
    c.set("admin", admin);
    await next();
  };
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * 출처 확인 (CSRF 방지).
 * 조회가 아닌 요청(POST·PUT·DELETE)은 관리자 화면과 같은 주소에서 보낸 것만 받는다.
 * - Origin 헤더가 이 서버 주소(예: https://admin.taerim.page)와 같으면 통과
 * - Origin이 없으면 브라우저의 Sec-Fetch-Site가 same-origin일 때만 통과
 * - 그 밖에는 403
 */
export function requireSameOrigin(): MiddlewareHandler {
  return async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method)) {
      const ownOrigin = new URL(c.req.url).origin;
      const origin = c.req.header("Origin");
      const sameOrigin =
        origin !== undefined ? origin === ownOrigin : c.req.header("Sec-Fetch-Site") === "same-origin";
      if (!sameOrigin) throw new HttpError("forbidden", "다른 사이트에서 보낸 요청은 받지 않아요");
    }
    await next();
  };
}
