import type { D1Database } from "../posts/d1.ts";
import type { TranslationRepository } from "./repository.ts";
import type { PublishedTranslation, TranslationDraft, TranslationLang, TranslationSummary } from "./types.ts";

/** post_translations 한 행 */
interface PublishedRow {
  post_id: number;
  lang: string;
  title: string;
  summary: string | null;
  body: string;
  source_hash: string;
  published_at: string;
  updated_at: string;
}

/** post_translation_drafts 한 행 */
interface DraftRow {
  post_id: number;
  lang: string;
  title: string;
  summary: string | null;
  body: string;
  source_hash: string;
  model: string | null;
  updated_at: string;
}

const PUBLISHED_COLUMNS = "post_id, lang, title, summary, body, source_hash, published_at, updated_at";
const DRAFT_COLUMNS = "post_id, lang, title, summary, body, source_hash, model, updated_at";
const ONE = "WHERE post_id = ? AND lang = ?";

export class D1TranslationRepository implements TranslationRepository {
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  async getPublished(postId: number, lang: TranslationLang): Promise<PublishedTranslation | null> {
    const row = await this.#db
      .prepare(`SELECT ${PUBLISHED_COLUMNS} FROM post_translations ${ONE}`)
      .bind(postId, lang)
      .first<PublishedRow>();
    return row ? toPublished(row) : null;
  }

  async getDraft(postId: number, lang: TranslationLang): Promise<TranslationDraft | null> {
    const row = await this.#db
      .prepare(`SELECT ${DRAFT_COLUMNS} FROM post_translation_drafts ${ONE}`)
      .bind(postId, lang)
      .first<DraftRow>();
    return row ? toDraft(row) : null;
  }

  async saveDraft(draft: TranslationDraft): Promise<void> {
    await this.#db
      .prepare(
        `INSERT INTO post_translation_drafts (${DRAFT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (post_id, lang) DO UPDATE SET
           title = excluded.title, summary = excluded.summary, body = excluded.body,
           source_hash = excluded.source_hash, model = excluded.model, updated_at = excluded.updated_at`,
      )
      .bind(draft.postId, draft.lang, draft.title, draft.summary, draft.body, draft.sourceHash, draft.model, draft.updatedAt)
      .run();
  }

  async deleteDraft(postId: number, lang: TranslationLang): Promise<boolean> {
    const result = await this.#db.prepare(`DELETE FROM post_translation_drafts ${ONE}`).bind(postId, lang).run();
    return result.meta.changes > 0;
  }

  async publishDraft(postId: number, lang: TranslationLang, at: string): Promise<PublishedTranslation | null> {
    // 한 트랜잭션: 초안을 공개본으로 복사(있으면 내용만 바꾸고 published_at 유지) → 초안 지우기
    const [copied] = await this.#db.batch([
      this.#db
        .prepare(
          `INSERT INTO post_translations (${PUBLISHED_COLUMNS})
           SELECT post_id, lang, title, summary, body, source_hash, ?, ? FROM post_translation_drafts ${ONE}
           ON CONFLICT (post_id, lang) DO UPDATE SET
             title = excluded.title, summary = excluded.summary, body = excluded.body,
             source_hash = excluded.source_hash, updated_at = excluded.updated_at`,
        )
        .bind(at, at, postId, lang),
      this.#db.prepare(`DELETE FROM post_translation_drafts ${ONE}`).bind(postId, lang),
    ]);
    if (!copied || copied.meta.changes === 0) return null;
    return this.getPublished(postId, lang);
  }

  async unpublish(postId: number, lang: TranslationLang, at: string): Promise<boolean> {
    // 한 트랜잭션: 초안이 없을 때만 공개본을 초안으로 되돌려 두기 → 공개본 지우기
    const [, removed] = await this.#db.batch([
      this.#db
        .prepare(
          `INSERT INTO post_translation_drafts (${DRAFT_COLUMNS})
           SELECT post_id, lang, title, summary, body, source_hash, NULL, ? FROM post_translations ${ONE}
           ON CONFLICT (post_id, lang) DO NOTHING`,
        )
        .bind(at, postId, lang),
      this.#db.prepare(`DELETE FROM post_translations ${ONE}`).bind(postId, lang),
    ]);
    return (removed?.meta.changes ?? 0) > 0;
  }

  async listPublished(lang: TranslationLang): Promise<PublishedTranslation[]> {
    const { results } = await this.#db
      .prepare(`SELECT ${PUBLISHED_COLUMNS} FROM post_translations WHERE lang = ? ORDER BY post_id`)
      .bind(lang)
      .all<PublishedRow>();
    return results.map(toPublished);
  }

  async listSummaries(lang: TranslationLang): Promise<TranslationSummary[]> {
    // 공개본·초안 중 하나라도 있는 글 (SQLite에는 FULL JOIN이 없어 UNION으로 글 id를 모은 뒤 양쪽을 붙인다)
    const { results } = await this.#db
      .prepare(
        `SELECT ids.post_id AS post_id, p.source_hash AS published_hash, d.source_hash AS draft_hash
         FROM (SELECT post_id FROM post_translations WHERE lang = ?1
               UNION SELECT post_id FROM post_translation_drafts WHERE lang = ?1) AS ids
         LEFT JOIN post_translations p ON p.post_id = ids.post_id AND p.lang = ?1
         LEFT JOIN post_translation_drafts d ON d.post_id = ids.post_id AND d.lang = ?1
         ORDER BY ids.post_id`,
      )
      .bind(lang)
      .all<{ post_id: number; published_hash: string | null; draft_hash: string | null }>();
    return results.map((row) => ({
      postId: row.post_id,
      publishedSourceHash: row.published_hash,
      draftSourceHash: row.draft_hash,
    }));
  }
}

// lang은 서비스가 지원 목록으로 확인한 값만 저장한다
function toPublished(row: PublishedRow): PublishedTranslation {
  return {
    postId: row.post_id,
    lang: row.lang as TranslationLang,
    title: row.title,
    summary: row.summary,
    body: row.body,
    sourceHash: row.source_hash,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

function toDraft(row: DraftRow): TranslationDraft {
  return {
    postId: row.post_id,
    lang: row.lang as TranslationLang,
    title: row.title,
    summary: row.summary,
    body: row.body,
    sourceHash: row.source_hash,
    model: row.model,
    updatedAt: row.updated_at,
  };
}
