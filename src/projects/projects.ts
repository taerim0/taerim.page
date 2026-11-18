import type { D1Database } from "../posts/d1.ts";
import { NotFoundError, ValidationError } from "../posts/errors.ts";
import type { FieldIssue, ProjectField } from "../posts/errors.ts";
import { sortTagNames } from "../posts/tag-order.ts";
import { charCount, isAllowedImageUrl, isAllowedTag, LIMITS as POST_LIMITS, normalizeTags, TAG_CHARS_MESSAGE } from "../posts/validation.ts";

/**
 * 프로젝트 (설계 18): 공개 사이트 /projects의 카드 한 장.
 * - 글 표와 따로 저장(칸이 다름). 태그는 글·노트와 같은 tags 표를 같이 씀 → 같은 태그로 이어짐
 * - 초안 없음: 저장하면 공개 대상, visible=false면 숨김. 공개 사이트는 [배포]해야 바뀜
 * - 지우기는 휴지통처럼 deletedAt만 → 되살리기·완전 삭제
 * - 순서는 sortOrder(작을수록 앞). 새 프로젝트는 맨 앞
 */
export const PROJECT_STATUSES = ["active", "done", "paused"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface Project {
  id: number;
  title: string;
  summary: string | null;
  /** /images/… 또는 https://…, 없으면 공개 사이트 기본 그림 */
  thumbnail: string | null;
  /** YYYY-MM */
  startedOn: string;
  /** YYYY-MM, 없으면 진행 중 */
  endedOn: string | null;
  status: ProjectStatus;
  repoUrl: string | null;
  siteUrl: string | null;
  /** Markdown (상세 페이지 때 씀) */
  body: string;
  /** 정리된 태그 이름순 */
  tags: string[];
  sortOrder: number;
  visible: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** 저장할 때 받는 값 */
export type ProjectInput = Pick<Project, "title" | "summary" | "thumbnail" | "startedOn" | "endedOn" | "status" | "repoUrl" | "siteUrl" | "body" | "tags" | "visible">;

export const PROJECT_LIMITS = { title: 100, summary: 200, thumbnail: 500, url: 500, body: 50000, tagCount: POST_LIMITS.tagCount, tagLength: POST_LIMITS.tagLength } as const;

const MONTH = /^(\d{4})-(\d{2})$/;

/** YYYY-MM, 1900~2999년 1~12월 */
function isMonth(value: string): boolean {
  const match = MONTH.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year >= 1900 && year <= 2999 && month >= 1 && month <= 12;
}

/** http(s) 주소만 */
function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** 입력 정리·검사. 문제가 있으면 칸별로 모아 ValidationError */
export function validateProject(raw: unknown): ProjectInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new ValidationError([], "프로젝트를 객체 모양으로 보내 주세요");
  const data = raw as Record<string, unknown>;
  const issues: FieldIssue[] = [];
  const text = (field: ProjectField, max: number, options: { required?: string; trim: boolean; singleLine?: boolean }): string | null => {
    const value = data[field];
    if (value !== undefined && value !== null && typeof value !== "string") {
      issues.push({ field, message: "글자여야 해요" });
      return null;
    }
    const cleaned = options.trim ? (value ?? "").trim() : (value ?? "").replace(/\s+$/, "");
    if (cleaned.trim() === "") {
      if (options.required) issues.push({ field, message: options.required });
      return null;
    }
    if (options.singleLine && /[\r\n]/.test(cleaned)) issues.push({ field, message: "한 줄로 써 주세요" });
    if (charCount(cleaned) > max) issues.push({ field, message: `${max.toLocaleString("ko-KR")}자까지예요` });
    return cleaned;
  };
  const month = (field: "startedOn" | "endedOn", required: boolean): string | null => {
    const value = typeof data[field] === "string" ? (data[field] as string).trim() : "";
    if (value === "") {
      if (required) issues.push({ field, message: "시작한 달을 골라 주세요" });
      return null;
    }
    if (!isMonth(value)) {
      issues.push({ field, message: "달 모양이 아니에요 (예: 2026-11)" });
      return null;
    }
    return value;
  };
  const url = (field: "repoUrl" | "siteUrl"): string | null => {
    const value = text(field, PROJECT_LIMITS.url, { trim: true, singleLine: true });
    if (value !== null && !isWebUrl(value)) issues.push({ field, message: "http:// 또는 https:// 주소만 쓸 수 있어요" });
    return value;
  };

  const thumbnail = text("thumbnail", PROJECT_LIMITS.thumbnail, { trim: true, singleLine: true });
  if (thumbnail !== null && !isAllowedImageUrl(thumbnail)) issues.push({ field: "thumbnail", message: "대표 이미지는 /images/… 또는 https://… 주소만 쓸 수 있어요" });

  const startedOn = month("startedOn", true);
  const endedOn = month("endedOn", false);
  if (startedOn && endedOn && endedOn < startedOn) issues.push({ field: "endedOn", message: "끝난 달이 시작한 달보다 앞이에요" });

  const status = data.status ?? "active";
  if (typeof status !== "string" || !(PROJECT_STATUSES as readonly string[]).includes(status)) issues.push({ field: "status", message: "상태는 진행 중·끝남·쉬는 중 중 하나예요" });

  let tags: string[] = [];
  if (data.tags !== undefined && data.tags !== null) {
    if (!Array.isArray(data.tags) || !data.tags.every((tag) => typeof tag === "string")) issues.push({ field: "tags", message: "태그는 글자 목록이어야 해요" });
    else {
      tags = normalizeTags(data.tags);
      if (tags.length > PROJECT_LIMITS.tagCount) issues.push({ field: "tags", message: `태그는 ${PROJECT_LIMITS.tagCount}개까지예요` });
      const tooLong = tags.find((tag) => charCount(tag) > PROJECT_LIMITS.tagLength);
      if (tooLong !== undefined) issues.push({ field: "tags", message: `태그는 ${PROJECT_LIMITS.tagLength}자까지예요: ${tooLong}` });
      const bad = tags.find((tag) => !isAllowedTag(tag));
      if (bad !== undefined) issues.push({ field: "tags", message: `${TAG_CHARS_MESSAGE}: ${bad}` });
    }
  }

  const visible = data.visible ?? true;
  if (typeof visible !== "boolean") issues.push({ field: "visible", message: "공개 여부는 참·거짓이어야 해요" });

  const input: ProjectInput = {
    title: text("title", PROJECT_LIMITS.title, { required: "이름을 입력해 주세요", trim: true, singleLine: true }) ?? "",
    summary: text("summary", PROJECT_LIMITS.summary, { trim: true, singleLine: true }),
    thumbnail,
    startedOn: startedOn ?? "",
    endedOn,
    status: status as ProjectStatus,
    repoUrl: url("repoUrl"),
    siteUrl: url("siteUrl"),
    body: text("body", PROJECT_LIMITS.body, { trim: false }) ?? "",
    tags,
    visible: visible === true,
  };
  if (issues.length > 0) throw new ValidationError(issues);
  return input;
}

/** 보이는 순서: sortOrder 작은 것 먼저, 같으면 id 큰 것 먼저 */
export function byProjectOrder(a: Project, b: Project): number {
  return a.sortOrder - b.sortOrder || b.id - a.id;
}

// ── 저장소 ─────────────────────────────────────────────

export interface ProjectRepository {
  /** 지우지 않은 것 (deleted=true면 지운 것만, 최근에 지운 순) */
  list(options?: { deleted?: boolean }): Promise<Project[]>;
  get(id: number): Promise<Project | null>;
  /** 맨 앞에 */
  create(input: ProjectInput, at: string): Promise<Project>;
  /** 없거나 지운 것이면 null */
  update(id: number, input: ProjectInput, at: string): Promise<Project | null>;
  /** 순서를 이 id 목록대로 0, 1, 2 …로 다시 매김 (지우지 않은 것만) */
  reorder(ids: readonly number[]): Promise<void>;
  /** 지움 표시 / 되살리기. 없으면 false */
  setDeleted(id: number, at: string | null): Promise<boolean>;
  /** 완전 삭제 (지운 것만). 없으면 false */
  purge(id: number): Promise<boolean>;
}

export class MemoryProjectRepository implements ProjectRepository {
  #rows = new Map<number, Project>();
  #nextId = 1;

  async list(options: { deleted?: boolean } = {}) {
    const rows = [...this.#rows.values()].filter((row) => (options.deleted ? row.deletedAt !== null : row.deletedAt === null)).map(copy);
    return options.deleted ? rows.sort((a, b) => (a.deletedAt! < b.deletedAt! ? 1 : a.deletedAt! > b.deletedAt! ? -1 : b.id - a.id)) : rows.sort(byProjectOrder);
  }

  async get(id: number) {
    const row = this.#rows.get(id);
    return row ? copy(row) : null;
  }

  async create(input: ProjectInput, at: string) {
    const first = Math.min(0, ...[...this.#rows.values()].map((row) => row.sortOrder));
    const project: Project = { id: this.#nextId++, ...input, tags: sortTagNames(input.tags), sortOrder: first - 1, createdAt: at, updatedAt: at, deletedAt: null };
    this.#rows.set(project.id, project);
    return copy(project);
  }

  async update(id: number, input: ProjectInput, at: string) {
    const row = this.#rows.get(id);
    if (!row || row.deletedAt !== null) return null;
    const project = { ...row, ...input, tags: sortTagNames(input.tags), updatedAt: at };
    this.#rows.set(id, project);
    return copy(project);
  }

  async reorder(ids: readonly number[]) {
    ids.forEach((id, index) => {
      const row = this.#rows.get(id);
      if (row && row.deletedAt === null) row.sortOrder = index;
    });
  }

  async setDeleted(id: number, at: string | null) {
    const row = this.#rows.get(id);
    if (!row) return false;
    row.deletedAt = at;
    return true;
  }

  async purge(id: number) {
    const row = this.#rows.get(id);
    if (!row || row.deletedAt === null) return false;
    return this.#rows.delete(id);
  }
}

const copy = (project: Project): Project => ({ ...project, tags: [...project.tags] });

interface ProjectRow {
  id: number;
  title: string;
  summary: string | null;
  thumbnail: string | null;
  started_on: string;
  ended_on: string | null;
  status: ProjectStatus;
  repo_url: string | null;
  site_url: string | null;
  body: string;
  sort_order: number;
  visible: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  /** JSON 배열 (태그 이름) */
  tags_json: string | null;
}

const fromRow = (row: ProjectRow): Project => ({
  id: row.id,
  title: row.title,
  summary: row.summary,
  thumbnail: row.thumbnail,
  startedOn: row.started_on,
  endedOn: row.ended_on,
  status: row.status,
  repoUrl: row.repo_url,
  siteUrl: row.site_url,
  body: row.body,
  tags: sortTagNames(JSON.parse(row.tags_json ?? "[]") as string[]),
  sortOrder: row.sort_order,
  visible: row.visible === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  deletedAt: row.deleted_at,
});

/** 프로젝트 행 + 태그 이름 JSON */
const SELECT = `SELECT p.*, (SELECT json_group_array(t.name) FROM project_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.project_id = p.id) AS tags_json FROM projects p`;

export class D1ProjectRepository implements ProjectRepository {
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  async list(options: { deleted?: boolean } = {}) {
    const sql = options.deleted
      ? `${SELECT} WHERE p.deleted_at IS NOT NULL ORDER BY p.deleted_at DESC, p.id DESC`
      : `${SELECT} WHERE p.deleted_at IS NULL ORDER BY p.sort_order, p.id DESC`;
    const { results } = await this.#db.prepare(sql).all<ProjectRow>();
    return results.map(fromRow);
  }

  async get(id: number) {
    const row = await this.#db.prepare(`${SELECT} WHERE p.id = ?`).bind(id).first<ProjectRow>();
    return row ? fromRow(row) : null;
  }

  /** 태그 연결을 이 목록으로 바꾸는 문장들 (없는 태그는 tags 표에 새로) */
  #tagStatements(idSql: string, idValues: number[], tags: readonly string[]) {
    const json = JSON.stringify(sortTagNames(tags));
    return [
      this.#db.prepare(`DELETE FROM project_tags WHERE project_id = ${idSql}`).bind(...idValues),
      this.#db.prepare("INSERT OR IGNORE INTO tags (name) SELECT value FROM json_each(?)").bind(json),
      this.#db.prepare(`INSERT INTO project_tags (project_id, tag_id) SELECT ${idSql}, id FROM tags WHERE name IN (SELECT value FROM json_each(?))`).bind(...idValues, json),
    ];
  }

  async create(input: ProjectInput, at: string) {
    const insert = this.#db
      .prepare(
        `INSERT INTO projects (title, summary, thumbnail, started_on, ended_on, status, repo_url, site_url, body, sort_order, visible, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT MIN(0, COALESCE(MIN(sort_order), 0)) - 1 FROM projects), ?, ?, ?)`,
      )
      .bind(input.title, input.summary, input.thumbnail, input.startedOn, input.endedOn, input.status, input.repoUrl, input.siteUrl, input.body, input.visible ? 1 : 0, at, at);
    // 방금 넣은 행 = 가장 큰 id (AUTOINCREMENT, 한 트랜잭션 안). last_insert_rowid()는 태그 INSERT가 바꿔 버려서 안 씀
    const results = await this.#db.batch([insert, ...this.#tagStatements("(SELECT MAX(id) FROM projects)", [], input.tags)]);
    const id = results[0]!.meta.last_row_id;
    return (await this.get(id))!;
  }

  async update(id: number, input: ProjectInput, at: string) {
    const exists = await this.#db.prepare("SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL").bind(id).first();
    if (!exists) return null;
    await this.#db.batch([
      this.#db
        .prepare(
          `UPDATE projects SET title = ?, summary = ?, thumbnail = ?, started_on = ?, ended_on = ?, status = ?, repo_url = ?, site_url = ?, body = ?, visible = ?, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`,
        )
        .bind(input.title, input.summary, input.thumbnail, input.startedOn, input.endedOn, input.status, input.repoUrl, input.siteUrl, input.body, input.visible ? 1 : 0, at, id),
      ...this.#tagStatements("?", [id], input.tags),
    ]);
    return this.get(id);
  }

  async reorder(ids: readonly number[]) {
    if (ids.length === 0) return;
    await this.#db.batch(ids.map((id, index) => this.#db.prepare("UPDATE projects SET sort_order = ? WHERE id = ? AND deleted_at IS NULL").bind(index, id)));
  }

  async setDeleted(id: number, at: string | null) {
    const result = await this.#db.prepare("UPDATE projects SET deleted_at = ? WHERE id = ?").bind(at, id).run();
    return result.meta.changes > 0;
  }

  async purge(id: number) {
    const result = await this.#db.prepare("DELETE FROM projects WHERE id = ? AND deleted_at IS NOT NULL").bind(id).run();
    return result.meta.changes > 0;
  }
}

// ── 서비스 ─────────────────────────────────────────────

/** 관리자 API가 부름 */
export class ProjectService {
  readonly #repo: ProjectRepository;
  readonly #now: () => Date;

  constructor(repo: ProjectRepository, options: { now?: () => Date } = {}) {
    this.#repo = repo;
    this.#now = options.now ?? (() => new Date());
  }

  list(options: { deleted?: boolean } = {}): Promise<Project[]> {
    return this.#repo.list(options);
  }

  async get(id: number): Promise<Project> {
    const project = await this.#repo.get(id);
    if (!project) throw new NotFoundError("프로젝트를 찾을 수 없어요");
    return project;
  }

  async create(raw: unknown): Promise<Project> {
    return this.#repo.create(validateProject(raw), this.#now().toISOString());
  }

  async update(id: number, raw: unknown): Promise<Project> {
    const project = await this.#repo.update(id, validateProject(raw), this.#now().toISOString());
    if (!project) throw new NotFoundError("프로젝트를 찾을 수 없어요 (휴지통에 있으면 먼저 되살려 주세요)");
    return project;
  }

  /** 순서 바꾸기: 지우지 않은 프로젝트 id 전부를 새 순서로. 빠지거나 겹치면 오류 */
  async reorder(raw: unknown): Promise<Project[]> {
    const ids = typeof raw === "object" && raw !== null && "ids" in raw ? (raw as { ids: unknown }).ids : undefined;
    const current = await this.#repo.list();
    const valid =
      Array.isArray(ids) &&
      ids.every((id) => Number.isInteger(id)) &&
      new Set(ids).size === ids.length &&
      ids.length === current.length &&
      current.every((project) => ids.includes(project.id));
    if (!valid) throw new ValidationError([], "순서는 지금 프로젝트 번호 전부를 한 번씩 보내 주세요");
    await this.#repo.reorder(ids as number[]);
    return this.#repo.list();
  }

  async remove(id: number): Promise<void> {
    const project = await this.get(id);
    if (project.deletedAt === null) await this.#repo.setDeleted(id, this.#now().toISOString());
  }

  /** 되살리면 맨 앞으로 */
  async restore(id: number): Promise<Project> {
    const project = await this.get(id);
    if (project.deletedAt === null) return project;
    await this.#repo.setDeleted(id, null);
    const rest = (await this.#repo.list()).filter((p) => p.id !== id).map((p) => p.id);
    await this.#repo.reorder([id, ...rest]);
    return this.get(id);
  }

  async purge(id: number): Promise<void> {
    if (!(await this.#repo.purge(id))) throw new NotFoundError("휴지통에서 프로젝트를 찾을 수 없어요");
  }
}
