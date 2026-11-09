/**
 * Worker 밖(빌드 스크립트, GitHub Actions)에서 원격 R2를 **읽기만** 하는 어댑터.
 * wrangler(`wrangler r2 object get`)도 쓰는 Cloudflare API를 R2Bucket 모양으로 감싼다
 * → R2ImageStore를 그대로 쓸 수 있다 (d1-http.ts와 같은 방식).
 *
 *   GET https://api.cloudflare.com/client/v4/accounts/{계정}/r2/buckets/{버킷}/objects/{키}
 *   → 200 파일 내용 / 404 없음
 *
 * 토큰 권한: Workers R2 Storage 읽기. 쓰기(put)는 관리자 Worker(진짜 R2 연결)에서만 한다.
 */
import type { R2Bucket, R2ObjectBody } from "./r2.ts";

export interface R2HttpOptions {
  /** Cloudflare 계정 id */
  accountId: string;
  /** 버킷 이름 (wrangler.jsonc의 bucket_name) */
  bucketName: string;
  /** API 토큰 */
  apiToken: string;
  /** 테스트에서 바꿔 끼운다. 기본: 전역 fetch */
  fetch?: typeof fetch;
}

export function createR2Http(options: R2HttpOptions): R2Bucket {
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const base = `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/r2/buckets/${encodeURIComponent(options.bucketName)}/objects/`;

  return {
    async get(key: string): Promise<R2ObjectBody | null> {
      const response = await doFetch(base + encodeURIComponent(key), {
        headers: { Authorization: `Bearer ${options.apiToken}` },
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        // 실패 응답은 JSON {errors:[{code,message}]}. 토큰 값은 메시지에 넣지 않는다
        const data = (await response.json().catch(() => null)) as { errors?: { code: number; message: string }[] } | null;
        const detail = data?.errors?.map((e) => `${e.code} ${e.message}`).join(", ") ?? "";
        throw new Error(`R2 API 요청 실패 (${response.status}) ${key} ${detail}`.trim());
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const contentType = response.headers.get("Content-Type") ?? undefined;
      return {
        body: new Blob([bytes]).stream(),
        size: bytes.byteLength,
        httpMetadata: contentType ? { contentType } : {},
      };
    },

    async put() {
      throw new Error("R2 HTTP 어댑터는 읽기 전용이에요 (쓰기는 관리자 Worker에서)");
    },
  };
}
