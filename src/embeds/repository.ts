import type { D1Database } from "../posts/d1.ts";
import type { EmbedInfo, EmbedKind } from "./types.ts";

/** 임베드 카드 정보 저장소 (D1 embeds, 설계 13-9) */
export interface EmbedRepository {
  get(url: string): Promise<EmbedInfo | null>;
  /** 여러 개 (빌드용). 없는 주소는 빠짐 */
  getMany(urls: readonly string[]): Promise<EmbedInfo[]>;
  /** 저장 (있으면 바꿈) */
  save(info: EmbedInfo): Promise<void>;
}

export class MemoryEmbedRepository implements EmbedRepository {
  readonly #rows = new Map<string, EmbedInfo>();

  async get(url: string): Promise<EmbedInfo | null> {
    const row = this.#rows.get(url);
    return row ? { ...row } : null;
  }

  async getMany(urls: readonly string[]): Promise<EmbedInfo[]> {
    return [...new Set(urls)].flatMap((url) => {
      const row = this.#rows.get(url);
      return row ? [{ ...row }] : [];
    });
  }

  async save(info: EmbedInfo): Promise<void> {
    this.#rows.set(info.url, { ...info });
  }
}

interface EmbedRow {
  url: string;
  kind: string;
  ok: number;
  title: string | null;
  description: string | null;
  site_name: string | null;
  image: string | null;
  stars: number | null;
  language: string | null;
  fetched_at: string;
}

const COLUMNS = "url, kind, ok, title, description, site_name, image, stars, language, fetched_at";
/** D1은 문장 하나에 ? 값을 100개까지만 받아서 나눠 묻는다 */
const URLS_PER_QUERY = 100;

export class D1EmbedRepository implements EmbedRepository {
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  async get(url: string): Promise<EmbedInfo | null> {
    const row = await this.#db.prepare(`SELECT ${COLUMNS} FROM embeds WHERE url = ?`).bind(url).first<EmbedRow>();
    return row ? toInfo(row) : null;
  }

  async getMany(urls: readonly string[]): Promise<EmbedInfo[]> {
    const unique = [...new Set(urls)];
    const found: EmbedInfo[] = [];
    for (let start = 0; start < unique.length; start += URLS_PER_QUERY) {
      const chunk = unique.slice(start, start + URLS_PER_QUERY);
      const { results } = await this.#db
        .prepare(`SELECT ${COLUMNS} FROM embeds WHERE url IN (${chunk.map(() => "?").join(", ")})`)
        .bind(...chunk)
        .all<EmbedRow>();
      found.push(...results.map(toInfo));
    }
    return found;
  }

  async save(info: EmbedInfo): Promise<void> {
    await this.#db
      .prepare(
        `INSERT INTO embeds (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (url) DO UPDATE SET kind = excluded.kind, ok = excluded.ok, title = excluded.title,
           description = excluded.description, site_name = excluded.site_name, image = excluded.image,
           stars = excluded.stars, language = excluded.language, fetched_at = excluded.fetched_at`,
      )
      .bind(info.url, info.kind, info.ok ? 1 : 0, info.title, info.description, info.siteName, info.image, info.stars, info.language, info.fetchedAt)
      .run();
  }
}

function toInfo(row: EmbedRow): EmbedInfo {
  return {
    url: row.url,
    kind: row.kind as EmbedKind,
    ok: row.ok === 1,
    title: row.title,
    description: row.description,
    siteName: row.site_name,
    image: row.image,
    stars: row.stars === null ? null : Number(row.stars),
    language: row.language,
    fetchedAt: row.fetched_at,
  };
}
