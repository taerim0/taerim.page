import type { D1Database, D1PreparedStatement, D1Value } from "./d1.ts";
import { normalizePage, normalizePageSize } from "./repository.ts";
import type { GetOptions, PostRepository } from "./repository.ts";
import { compareTagNames, sortTagNames } from "./tag-order.ts";
import type {
  NewPostData,
  Page,
  Post,
  PostChanges,
  PostDraft,
  PostListFilter,
  PostStatus,
  PostSummary,
  TagCount,
  TagParent,
  TagUsage,
} from "./types.ts";

/** posts 테이블 한 행 + 태그(JSON 글자) */
interface PostRow {
  id: number;
  title: string;
  body?: string; // 목록에서는 읽지 않는다
  summary: string | null;
  thumbnail: string | null;
  status: PostStatus;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  deleted_at: string | null;
  tags: string; // '["개발","블로그"]'
  has_draft?: number; // 목록에서만: 작업본이 있으면 1
}

interface DraftRow {
  post_id: number;
  title: string;
  body: string;
  summary: string | null;
  thumbnail: string | null;
  tags: string;
  updated_at: string;
}

/** 이 글의 태그 이름 목록을 JSON 글자 하나로 묶는 SQL 조각 (이름순) */
const TAGS_JSON = `(
  SELECT json_group_array(name) FROM (
    SELECT t.name FROM post_tags pt JOIN tags t ON t.id = pt.tag_id
    WHERE pt.post_id = p.id ORDER BY t.name
  )
) AS tags`;

const BASE_COLUMNS = `p.id, p.title, p.summary, p.thumbnail, p.status,
  p.created_at, p.updated_at, p.published_at, p.deleted_at, ${TAGS_JSON}`;
/** 목록: 본문 대신 "작업본 있음" */
const SUMMARY_COLUMNS = `${BASE_COLUMNS},
  EXISTS (SELECT 1 FROM post_drafts d WHERE d.post_id = p.id) AS has_draft`;
/** 글 하나: 본문 포함 */
const POST_COLUMNS = `${BASE_COLUMNS}, p.body`;

/** 고칠 수 있는 항목 → 칸 이름. 여기 있는 이름만 SQL에 들어간다 (밖에서 온 이름을 SQL에 넣지 않음) */
const COLUMN_BY_FIELD = {
  title: "title",
  body: "body",
  summary: "summary",
  thumbnail: "thumbnail",
  status: "status",
  updatedAt: "updated_at",
  publishedAt: "published_at",
} as const satisfies Record<Exclude<keyof PostChanges, "tags">, string>;

/**
 * D1 저장소. 실제 블로그가 쓰는 저장소.
 * 메모리 저장소와 똑같이 동작해야 한다 (공통 테스트로 확인).
 *
 * 여러 문장을 묶어야 하는 일(태그를 포함한 저장·수정, 작업본 반영)은 batch로 한 트랜잭션에 처리한다.
 * 값은 모두 ? 자리에 bind로 넣는다.
 */
export class D1PostRepository implements PostRepository {
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  async create(data: NewPostData): Promise<Post> {
    const [inserted] = await this.#db.batch<{ id: number }>([
      this.#db
        .prepare(
          `INSERT INTO posts (title, body, summary, thumbnail, status, created_at, updated_at, published_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        )
        .bind(
          data.title,
          data.body,
          data.summary,
          data.thumbnail,
          data.status,
          data.createdAt,
          data.updatedAt,
          data.publishedAt,
        ),
      // 방금 넣은 글의 id: 같은 트랜잭션 안이고 번호가 줄지 않으므로 가장 큰 id가 방금 글이다
      ...this.#replaceTags("(SELECT max(id) FROM posts)", [], data.tags),
    ]);
    const id = inserted?.results[0]?.id;
    if (id === undefined) throw new Error("글을 저장했지만 id를 받지 못했어요");
    const post = await this.get(id);
    if (!post) throw new Error("방금 저장한 글을 찾지 못했어요");
    return post;
  }

  async get(id: number, options: GetOptions = {}): Promise<Post | null> {
    const trashCondition = options.includeTrashed ? "" : "AND p.deleted_at IS NULL";
    const row = await this.#db
      .prepare(`SELECT ${POST_COLUMNS} FROM posts p WHERE p.id = ? ${trashCondition}`)
      .bind(id)
      .first<PostRow>();
    return row ? toPost(row) : null;
  }

  async list(filter: PostListFilter = {}): Promise<Page<PostSummary>> {
    const page = normalizePage(filter.page);
    const pageSize = normalizePageSize(filter.pageSize);

    const conditions = [filter.trash ? "p.deleted_at IS NOT NULL" : "p.deleted_at IS NULL"];
    const values: D1Value[] = [];
    if (filter.status !== undefined) {
      conditions.push("p.status = ?");
      values.push(filter.status);
    }
    // 묶음마다 "그중 하나라도 붙은 글", 묶음끼리는 AND (tags는 한 태그씩 묶음, 설계 14)
    // 태그 목록은 JSON 하나로 넘겨서(json_each) 개수와 상관없이 ? 자리가 늘지 않게 한다
    const groups = filter.tagGroups ?? [...new Set(filter.tags ?? [])].map((tag) => [tag]);
    for (const group of groups) {
      if (group.length === 0) continue;
      conditions.push(`EXISTS (
        SELECT 1 FROM post_tags pt JOIN tags t ON t.id = pt.tag_id
        WHERE pt.post_id = p.id AND t.name IN (SELECT value FROM json_each(?))
      )`);
      values.push(JSON.stringify(group));
    }
    const where = conditions.join(" AND ");
    const sortColumn = filter.trash ? "p.deleted_at" : filter.status === "published" ? "p.published_at" : "p.updated_at";

    // 개수와 목록을 같은 트랜잭션에서 읽어 서로 어긋나지 않게
    const [countResult, rowsResult] = await this.#db.batch([
      this.#db.prepare(`SELECT COUNT(*) AS total FROM posts p WHERE ${where}`).bind(...values),
      this.#db
        .prepare(
          `SELECT ${SUMMARY_COLUMNS} FROM posts p WHERE ${where}
           ORDER BY ${sortColumn} DESC, p.id DESC LIMIT ? OFFSET ?`,
        )
        .bind(...values, pageSize, (page - 1) * pageSize),
    ]);

    const total = Number((countResult?.results[0] as { total?: number } | undefined)?.total ?? 0);
    const items = ((rowsResult?.results ?? []) as unknown as PostRow[]).map(toSummary);
    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  async update(id: number, changes: PostChanges): Promise<Post | null> {
    if (!(await this.get(id))) return null; // 없거나 휴지통이면 고치지 않는다

    const sets: string[] = [];
    const values: D1Value[] = [];
    for (const [field, column] of Object.entries(COLUMN_BY_FIELD)) {
      const value = changes[field as keyof typeof COLUMN_BY_FIELD];
      if (value !== undefined) {
        sets.push(`${column} = ?`);
        values.push(value);
      }
    }

    const statements: D1PreparedStatement[] = [];
    if (sets.length > 0) {
      statements.push(
        this.#db
          .prepare(`UPDATE posts SET ${sets.join(", ")} WHERE id = ? AND deleted_at IS NULL`)
          .bind(...values, id),
      );
    }
    if (changes.tags !== undefined) statements.push(...this.#replaceTags("?", [id], changes.tags));
    if (statements.length > 0) await this.#db.batch(statements);

    return this.get(id);
  }

  async moveToTrash(id: number, at: string): Promise<boolean> {
    const result = await this.#db
      .prepare("UPDATE posts SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL")
      .bind(at, id)
      .run();
    return result.meta.changes > 0;
  }

  async restore(id: number, at: string): Promise<Post | null> {
    const [post, draft] = await Promise.all([this.get(id, { includeTrashed: true }), this.getDraft(id)]);
    if (!post || post.deletedAt === null) return null;

    // 휴지통에서 꺼내기 + 초안으로 + (작업본이 있으면) 내용 덮어쓰기·태그 바꾸기·작업본 지우기를 한 트랜잭션으로
    const restoreAsDraft = "status = 'draft', updated_at = ?, deleted_at = NULL";
    const whereTrashed = "WHERE id = ? AND deleted_at IS NOT NULL";
    await this.#db.batch(
      draft
        ? [
            this.#db
              .prepare(
                `UPDATE posts SET title = ?, body = ?, summary = ?, thumbnail = ?, ${restoreAsDraft} ${whereTrashed}`,
              )
              .bind(draft.title, draft.body, draft.summary, draft.thumbnail, at, id),
            ...this.#replaceTags("?", [id], draft.tags),
            this.#db.prepare("DELETE FROM post_drafts WHERE post_id = ?").bind(id),
          ]
        : [this.#db.prepare(`UPDATE posts SET ${restoreAsDraft} ${whereTrashed}`).bind(at, id)],
    );
    return this.get(id);
  }

  async purge(id: number): Promise<boolean> {
    // 작업본·태그 연결은 ON DELETE CASCADE로 함께 지워진다
    const result = await this.#db
      .prepare("DELETE FROM posts WHERE id = ? AND deleted_at IS NOT NULL")
      .bind(id)
      .run();
    return result.meta.changes > 0;
  }

  async getDraft(postId: number): Promise<PostDraft | null> {
    const row = await this.#db.prepare("SELECT * FROM post_drafts WHERE post_id = ?").bind(postId).first<DraftRow>();
    return row ? toDraft(row) : null;
  }

  async saveDraft(draft: PostDraft): Promise<boolean> {
    // 글이 있고 휴지통이 아닐 때만 넣는다. 이미 작업본이 있으면 덮어쓴다.
    const result = await this.#db
      .prepare(
        `INSERT INTO post_drafts (post_id, title, body, summary, thumbnail, tags, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM posts WHERE id = ? AND deleted_at IS NULL)
         ON CONFLICT (post_id) DO UPDATE SET
           title = excluded.title, body = excluded.body, summary = excluded.summary,
           thumbnail = excluded.thumbnail, tags = excluded.tags, updated_at = excluded.updated_at`,
      )
      .bind(
        draft.postId,
        draft.title,
        draft.body,
        draft.summary,
        draft.thumbnail,
        JSON.stringify(sortTagNames(draft.tags)),
        draft.updatedAt,
        draft.postId,
      )
      .run();
    return result.meta.changes > 0;
  }

  async deleteDraft(postId: number): Promise<boolean> {
    const result = await this.#db.prepare("DELETE FROM post_drafts WHERE post_id = ?").bind(postId).run();
    return result.meta.changes > 0;
  }

  async applyDraft(postId: number, at: string): Promise<Post | null> {
    const [post, draft] = await Promise.all([this.get(postId), this.getDraft(postId)]);
    if (!post || !draft) return null;

    // 내용 덮어쓰기 + 태그 바꾸기 + 작업본 지우기를 한 트랜잭션으로
    await this.#db.batch([
      this.#db
        .prepare(
          `UPDATE posts SET title = ?, body = ?, summary = ?, thumbnail = ?, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .bind(draft.title, draft.body, draft.summary, draft.thumbnail, at, postId),
      ...this.#replaceTags("?", [postId], draft.tags),
      this.#db.prepare("DELETE FROM post_drafts WHERE post_id = ?").bind(postId),
    ]);
    return this.get(postId);
  }

  async listPublished(): Promise<Post[]> {
    const { results } = await this.#db
      .prepare(
        `SELECT ${POST_COLUMNS} FROM posts p
         WHERE p.status = 'published' AND p.deleted_at IS NULL
         ORDER BY p.published_at DESC, p.id DESC`,
      )
      .all<PostRow>();
    return results.map(toPost);
  }

  async listTags(): Promise<TagCount[]> {
    const { results } = await this.#db
      .prepare(
        `SELECT t.name AS name, COUNT(*) AS count
         FROM tags t
         JOIN post_tags pt ON pt.tag_id = t.id
         JOIN posts p ON p.id = pt.post_id AND p.deleted_at IS NULL
         GROUP BY t.id ORDER BY t.name`,
      )
      .all<{ name: string; count: number }>();
    return results
      .map((row) => ({ name: row.name, count: Number(row.count) }))
      .sort((a, b) => compareTagNames(a.name, b.name));
  }

  async listTagParents(): Promise<TagParent[]> {
    const { results } = await this.#db
      .prepare("SELECT t.name AS name, parent.name AS parent FROM tags t LEFT JOIN tags parent ON parent.id = t.parent_id")
      .all<{ name: string; parent: string | null }>();
    return results.map((row) => ({ name: row.name, parent: row.parent })).sort((a, b) => compareTagNames(a.name, b.name));
  }

  async setTagParent(name: string, parent: string | null): Promise<void> {
    const names = JSON.stringify(parent === null ? [name] : [name, parent]);
    await this.#db.batch([
      this.#db.prepare("INSERT OR IGNORE INTO tags (name) SELECT value FROM json_each(?)").bind(names),
      this.#db.prepare("UPDATE tags SET parent_id = (SELECT id FROM tags WHERE name = ?) WHERE name = ?").bind(parent, name),
    ]);
  }

  async listTagUsage(): Promise<TagUsage[]> {
    const { results } = await this.#db
      .prepare(
        `SELECT t.name AS name, pt.post_id AS post_id FROM post_tags pt
         JOIN tags t ON t.id = pt.tag_id
         JOIN posts p ON p.id = pt.post_id AND p.deleted_at IS NULL`,
      )
      .all<{ name: string; post_id: number }>();
    return results.map((row) => ({ name: row.name, postId: Number(row.post_id) }));
  }

  /**
   * 글의 태그를 통째로 바꾸는 문장들: 연결 지우기 → 새 태그 이름 넣기(이미 있으면 그대로) → 연결 다시 넣기.
   * 태그 목록은 JSON 하나로 넘겨서(json_each) 태그 개수와 상관없이 ? 자리가 늘지 않게 한다.
   * @param postIdSql 글 id 자리에 쓸 SQL ("?" 또는 하위 쿼리)
   * @param postIdValues postIdSql의 ? 에 넣을 값
   */
  #replaceTags(postIdSql: string, postIdValues: D1Value[], tags: readonly string[]): D1PreparedStatement[] {
    const tagsJson = JSON.stringify(sortTagNames(tags));
    return [
      this.#db.prepare(`DELETE FROM post_tags WHERE post_id = ${postIdSql}`).bind(...postIdValues),
      this.#db.prepare("INSERT OR IGNORE INTO tags (name) SELECT value FROM json_each(?)").bind(tagsJson),
      this.#db
        .prepare(
          `INSERT INTO post_tags (post_id, tag_id)
           SELECT ${postIdSql}, id FROM tags WHERE name IN (SELECT value FROM json_each(?))`,
        )
        .bind(...postIdValues, tagsJson),
    ];
  }
}

function parseTags(json: string | null | undefined): string[] {
  const parsed: unknown = JSON.parse(json ?? "[]");
  return Array.isArray(parsed) ? sortTagNames(parsed.filter((tag): tag is string => typeof tag === "string")) : [];
}

/** 글·요약에 공통으로 들어가는 칸 */
function baseFields(row: PostRow): Omit<Post, "body"> {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    thumbnail: row.thumbnail,
    status: row.status,
    tags: parseTags(row.tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    deletedAt: row.deleted_at,
  };
}

function toSummary(row: PostRow): PostSummary {
  return { ...baseFields(row), hasDraft: row.has_draft === 1 };
}

function toPost(row: PostRow): Post {
  return { ...baseFields(row), body: row.body ?? "" };
}

function toDraft(row: DraftRow): PostDraft {
  return {
    postId: row.post_id,
    title: row.title,
    body: row.body,
    summary: row.summary,
    thumbnail: row.thumbnail,
    tags: parseTags(row.tags),
    updatedAt: row.updated_at,
  };
}
