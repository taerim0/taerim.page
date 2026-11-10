/**
 * 조회수 (설계 2-2, docs/05): Cloudflare Web Analytics가 센 날짜 × 주소별 조회 수를 D1에 쌓는다.
 * - Web Analytics는 최근 7일만 표본 없이 갖고 있고 6개월이 지나면 사라짐 → 매일 최근 며칠을 받아 덮어써서 정확한 값을 계속 쌓는다
 * - 같은 날을 여러 번 받아도 같은 값으로 덮어씀 (멱등)
 * - 글 페이지 숫자 = /posts/n + /en/posts/n 합계
 */
import type { D1Database } from "../posts/d1.ts";

/** 하루·주소 하나의 조회 */
export interface DailyViews {
  /** YYYY-MM-DD (Web Analytics 날짜, UTC) */
  date: string;
  /** 주소 경로. 예) /posts/3, /en/posts/3 */
  path: string;
  /** 조회 수 (page views) */
  views: number;
  /** 방문 수 (바깥에서 들어온 조회). 받아만 둠 */
  visits: number;
}

const POST_PATH = /^\/(?:[a-z]{2}\/)?posts\/(\d+)\/?$/;

/** 글 페이지 주소면 글 id. 예) /posts/3 → 3, /en/posts/3/ → 3, /posts → null */
export function postIdFromPath(path: string): number | null {
  const match = POST_PATH.exec(path);
  return match ? Number(match[1]) : null;
}

/** 주소별 합계 → 글별 합계 (한·영 합침) */
export function viewsByPost(totals: Iterable<{ path: string; views: number }>): Map<number, number> {
  const byPost = new Map<number, number>();
  for (const { path, views } of totals) {
    const id = postIdFromPath(path);
    if (id !== null) byPost.set(id, (byPost.get(id) ?? 0) + views);
  }
  return byPost;
}

/** 같은 날·같은 주소가 여러 줄이면 더함 (주소 끝 / 나 ?가 다르게 와도 하나로) */
export function mergeDaily(rows: Iterable<DailyViews>): DailyViews[] {
  const merged = new Map<string, DailyViews>();
  for (const row of rows) {
    const path = normalizePath(row.path);
    const key = `${row.date} ${path}`;
    const before = merged.get(key);
    merged.set(key, before ? { ...before, views: before.views + row.views, visits: before.visits + row.visits } : { ...row, path });
  }
  return [...merged.values()].sort((a, b) => (a.date === b.date ? a.path.localeCompare(b.path) : a.date < b.date ? -1 : 1));
}

/** ?·# 떼고, 끝 / 정리 (루트 / 는 그대로) */
export function normalizePath(path: string): string {
  const bare = path.split(/[?#]/)[0] || "/";
  return bare.length > 1 ? bare.replace(/\/+$/, "") || "/" : bare;
}

// ── Cloudflare GraphQL (Web Analytics) ─────────────────

export const CLOUDFLARE_GRAPHQL = "https://api.cloudflare.com/client/v4/graphql";

/** 날짜 × 주소별 조회 수를 묻는 GraphQL (봇 제외, 한 host만) */
export const RUM_QUERY = `query Views($accountTag: string!, $host: string!, $from: Date!, $to: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      rumPageloadEventsAdaptiveGroups(
        limit: 10000
        filter: { date_geq: $from, date_leq: $to, requestHost: $host, bot: 0 }
      ) {
        count
        sum { visits }
        dimensions { date requestPath }
      }
    }
  }
}`;

interface RumGroup {
  count: number;
  sum?: { visits?: number };
  dimensions: { date: string; requestPath: string };
}

interface RumResponse {
  data?: { viewer?: { accounts?: { rumPageloadEventsAdaptiveGroups?: RumGroup[] }[] } } | null;
  errors?: { message: string }[] | null;
}

/** GraphQL 응답 → 날짜·주소별 행. 오류가 있으면 던짐 */
export function parseRumResponse(json: unknown): DailyViews[] {
  const response = json as RumResponse;
  if (response.errors && response.errors.length > 0) throw new Error(`Web Analytics 조회 실패: ${response.errors.map((e) => e.message).join(" / ")}`);
  const groups = response.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups;
  if (!groups) throw new Error("Web Analytics 응답 모양이 예상과 달라요");
  return mergeDaily(groups.map((g) => ({ date: g.dimensions.date, path: g.dimensions.requestPath, views: g.count, visits: g.sum?.visits ?? 0 })));
}

/** 오늘(UTC)부터 days일 전까지의 날짜 범위 */
export function recentRange(now: Date, days: number): { from: string; to: string } {
  const day = (offset: number) => new Date(now.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
  return { from: day(days - 1), to: day(0) };
}

// ── 저장소 ─────────────────────────────────────────────

/** D1 문장 하나에 넣을 수 있는 값이 100개까지라 한 번에 25행(4칸씩) */
const ROWS_PER_STATEMENT = 25;

export class D1ViewsRepository {
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  /** 날짜·주소가 같으면 새 값으로 덮어씀. 넣은 행 수 */
  async upsert(rows: readonly DailyViews[]): Promise<number> {
    for (let i = 0; i < rows.length; i += ROWS_PER_STATEMENT) {
      const chunk = rows.slice(i, i + ROWS_PER_STATEMENT);
      await this.#db
        .prepare(
          `INSERT INTO page_views_daily (date, path, views, visits) VALUES ${chunk.map(() => "(?, ?, ?, ?)").join(", ")}
           ON CONFLICT (date, path) DO UPDATE SET views = excluded.views, visits = excluded.visits`,
        )
        .bind(...chunk.flatMap((r) => [r.date, r.path, r.views, r.visits]))
        .run();
    }
    return rows.length;
  }

  /** 주소별 전체 합계 */
  async totals(): Promise<{ path: string; views: number }[]> {
    const { results } = await this.#db.prepare("SELECT path, SUM(views) AS views FROM page_views_daily GROUP BY path").all<{ path: string; views: number }>();
    return results;
  }
}
