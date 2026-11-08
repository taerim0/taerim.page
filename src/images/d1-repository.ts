import type { D1Database } from "../posts/d1.ts";
import type { ImageRepository } from "./repository.ts";
import type { ImageContentType, ImageInfo } from "./types.ts";

/** images 테이블 한 행 */
interface ImageRow {
  name: string;
  original_name: string;
  content_type: string;
  width: number;
  height: number;
  size: number;
  created_at: string;
}

const COLUMNS = "name, original_name, content_type, width, height, size, created_at";

/** 한 번에 묻는 이름 수. D1은 문장 하나에 ? 값을 100개까지만 받아서, 더 많으면 나눠 묻는다 */
const NAMES_PER_QUERY = 100;

export class D1ImageRepository implements ImageRepository {
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  async add(info: ImageInfo): Promise<boolean> {
    // 같은 이름(= 같은 내용)이 이미 있으면 아무것도 하지 않는다 → 바뀐 행 0
    const result = await this.#db
      .prepare(`INSERT INTO images (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (name) DO NOTHING`)
      .bind(info.name, info.originalName, info.contentType, info.width, info.height, info.size, info.createdAt)
      .run();
    return result.meta.changes > 0;
  }

  async get(name: string): Promise<ImageInfo | null> {
    const row = await this.#db.prepare(`SELECT ${COLUMNS} FROM images WHERE name = ?`).bind(name).first<ImageRow>();
    return row ? toImageInfo(row) : null;
  }

  async getMany(names: readonly string[]): Promise<ImageInfo[]> {
    const unique = [...new Set(names)];
    const found: ImageInfo[] = [];
    for (let start = 0; start < unique.length; start += NAMES_PER_QUERY) {
      const chunk = unique.slice(start, start + NAMES_PER_QUERY);
      const marks = chunk.map(() => "?").join(", ");
      const { results } = await this.#db
        .prepare(`SELECT ${COLUMNS} FROM images WHERE name IN (${marks})`)
        .bind(...chunk)
        .all<ImageRow>();
      found.push(...results.map(toImageInfo));
    }
    // 메모리 저장소와 같은 순서(자바스크립트 문자열 비교)로 맞춘다
    return found.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }
}

function toImageInfo(row: ImageRow): ImageInfo {
  return {
    name: row.name,
    originalName: row.original_name,
    // 테이블의 CHECK가 두 형식만 허용한다
    contentType: row.content_type as ImageContentType,
    width: row.width,
    height: row.height,
    size: row.size,
    createdAt: row.created_at,
  };
}
