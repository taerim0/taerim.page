/**
 * Worker 밖(빌드 스크립트, GitHub Actions)에서 원격 D1을 쓰기 위한 어댑터.
 * Cloudflare D1 HTTP API(POST …/d1/database/{id}/query)를 D1Database 모양으로 감싼다
 * → D1PostRepository를 그대로 쓸 수 있다 (같은 SQL, 같은 변환).
 *
 * 빌드는 읽기만 하므로 batch(여러 문장을 한 트랜잭션으로)는 지원하지 않는다.
 * 쓰기가 필요한 일은 관리자 Worker(진짜 D1 연결)에서만 한다.
 */
import type { D1Database, D1PreparedStatement, D1Result, D1Value } from "./d1.ts";

export interface D1HttpOptions {
  /** Cloudflare 계정 id */
  accountId: string;
  /** D1 데이터베이스 id (wrangler.jsonc의 database_id) */
  databaseId: string;
  /** API 토큰 (권한: D1 읽기면 충분) */
  apiToken: string;
  /** 테스트에서 바꿔 끼운다. 기본: 전역 fetch */
  fetch?: typeof fetch;
}

/** D1 HTTP API 응답 중 쓰는 칸 */
interface QueryResponse {
  success: boolean;
  errors?: { code: number; message: string }[];
  result?: { results?: Record<string, unknown>[]; meta?: { changes?: number; last_row_id?: number } }[];
}

export function createD1Http(options: D1HttpOptions): D1Database {
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const url = `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/d1/database/${options.databaseId}/query`;

  async function query(sql: string, params: D1Value[]): Promise<D1Result> {
    const response = await doFetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${options.apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params }),
    });
    const data = (await response.json().catch(() => null)) as QueryResponse | null;
    if (!response.ok || !data?.success) {
      const detail = data?.errors?.map((e) => `${e.code} ${e.message}`).join(", ") ?? "";
      throw new Error(`D1 HTTP API 요청 실패 (${response.status}) ${detail}`.trim());
    }
    const first = data.result?.[0];
    return {
      results: first?.results ?? [],
      meta: { changes: first?.meta?.changes ?? 0, last_row_id: first?.meta?.last_row_id ?? 0 },
    };
  }

  function statement(sql: string, params: D1Value[]): D1PreparedStatement {
    return {
      bind: (...values) => statement(sql, values),
      first: async <Row>() => ((await query(sql, params)).results[0] as Row | undefined) ?? null,
      all: async <Row>() => (await query(sql, params)) as D1Result<Row>,
      run: () => query(sql, params),
    };
  }

  return {
    prepare: (sql) => statement(sql, []),
    batch: async () => {
      throw new Error("D1 HTTP 어댑터는 batch를 지원하지 않아요 (빌드는 읽기만 해요)");
    },
  };
}
