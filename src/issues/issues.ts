import type { D1Database } from "../posts/d1.ts";
import { NotFoundError, ValidationError } from "../posts/errors.ts";
import type { FieldIssue, IssueField } from "../posts/errors.ts";
import { charCount } from "../posts/validation.ts";

/**
 * 이슈 (설계 15-5): 아카이브·홈에 보이는 짧은 기록 한 덩어리.
 * 자기 페이지·태그·RSS 없음. 저장하면 공개 대상(초안 없음), 공개 사이트는 배포해야 바뀜
 */
export interface Issue {
  id: number;
  /** YYYY-MM-DD (한국 날짜) */
  date: string;
  title: string;
  /** Markdown (빈 글자 가능) */
  body: string;
  /** 영어 제목·내용. 없으면 영어 페이지에 한국어 그대로 */
  titleEn: string | null;
  bodyEn: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 저장할 때 받는 값 */
export type IssueInput = Pick<Issue, "date" | "title" | "body" | "titleEn" | "bodyEn">;

export const ISSUE_LIMITS = { title: 100, body: 5000 } as const;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 실제 있는 날짜인지 (2026-02-30 같은 것 막기) */
function isRealDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && year >= 1900 && year <= 2999;
}

/** 입력 정리·검사. 문제가 있으면 칸별로 모아 ValidationError */
export function validateIssue(raw: unknown): IssueInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new ValidationError([], "이슈를 객체 모양으로 보내 주세요");
  const data = raw as Record<string, unknown>;
  const issues: FieldIssue[] = [];
  /** 글자 칸. trim = 제목처럼 앞뒤 공백 정리 (내용은 줄 끝 공백만 정리) */
  const text = (field: IssueField, max: number, options: { required?: string; trim: boolean }): string | null => {
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
    if (charCount(cleaned) > max) issues.push({ field, message: `${max.toLocaleString("ko-KR")}자까지예요` });
    return cleaned;
  };

  const dateValue = typeof data.date === "string" ? data.date.trim() : "";
  if (dateValue === "") issues.push({ field: "date", message: "날짜를 골라 주세요" });
  else if (!isRealDate(dateValue)) issues.push({ field: "date", message: "날짜 모양이 아니에요 (예: 2026-11-11)" });

  const input: IssueInput = {
    date: dateValue,
    title: text("title", ISSUE_LIMITS.title, { required: "제목을 입력해 주세요", trim: true }) ?? "",
    body: text("body", ISSUE_LIMITS.body, { trim: false }) ?? "",
    titleEn: text("titleEn", ISSUE_LIMITS.title, { trim: true }),
    bodyEn: text("bodyEn", ISSUE_LIMITS.body, { trim: false }),
  };
  if (input.bodyEn !== null && input.titleEn === null) issues.push({ field: "titleEn", message: "영어 내용이 있으면 영어 제목도 넣어 주세요" });
  if (issues.length > 0) throw new ValidationError(issues);
  return input;
}

/** 최신 순: 날짜가 늦은 것 먼저, 같으면 id가 큰 것 먼저 */
export function byNewestIssue(a: Issue, b: Issue): number {
  return a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1;
}

// ── 저장소 ─────────────────────────────────────────────

export interface IssueRepository {
  /** 최신 순 */
  list(): Promise<Issue[]>;
  get(id: number): Promise<Issue | null>;
  create(input: IssueInput, at: string): Promise<Issue>;
  /** 없으면 null */
  update(id: number, input: IssueInput, at: string): Promise<Issue | null>;
  /** 지웠으면 true */
  delete(id: number): Promise<boolean>;
}

export class MemoryIssueRepository implements IssueRepository {
  #rows = new Map<number, Issue>();
  #nextId = 1;

  async list() {
    return [...this.#rows.values()].map((row) => ({ ...row })).sort(byNewestIssue);
  }

  async get(id: number) {
    const row = this.#rows.get(id);
    return row ? { ...row } : null;
  }

  async create(input: IssueInput, at: string) {
    const issue: Issue = { id: this.#nextId++, ...input, createdAt: at, updatedAt: at };
    this.#rows.set(issue.id, issue);
    return { ...issue };
  }

  async update(id: number, input: IssueInput, at: string) {
    const row = this.#rows.get(id);
    if (!row) return null;
    const issue = { ...row, ...input, updatedAt: at };
    this.#rows.set(id, issue);
    return { ...issue };
  }

  async delete(id: number) {
    return this.#rows.delete(id);
  }
}

interface IssueRow {
  id: number;
  date: string;
  title: string;
  body: string;
  title_en: string | null;
  body_en: string | null;
  created_at: string;
  updated_at: string;
}

const fromRow = (row: IssueRow): Issue => ({
  id: row.id,
  date: row.date,
  title: row.title,
  body: row.body,
  titleEn: row.title_en,
  bodyEn: row.body_en,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class D1IssueRepository implements IssueRepository {
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  async list() {
    const { results } = await this.#db.prepare("SELECT * FROM issues ORDER BY date DESC, id DESC").all<IssueRow>();
    return results.map(fromRow);
  }

  async get(id: number) {
    const row = await this.#db.prepare("SELECT * FROM issues WHERE id = ?").bind(id).first<IssueRow>();
    return row ? fromRow(row) : null;
  }

  async create(input: IssueInput, at: string) {
    const row = await this.#db
      .prepare(
        `INSERT INTO issues (date, title, body, title_en, body_en, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .bind(input.date, input.title, input.body, input.titleEn, input.bodyEn, at, at)
      .first<IssueRow>();
    return fromRow(row!);
  }

  async update(id: number, input: IssueInput, at: string) {
    const row = await this.#db
      .prepare("UPDATE issues SET date = ?, title = ?, body = ?, title_en = ?, body_en = ?, updated_at = ? WHERE id = ? RETURNING *")
      .bind(input.date, input.title, input.body, input.titleEn, input.bodyEn, at, id)
      .first<IssueRow>();
    return row ? fromRow(row) : null;
  }

  async delete(id: number) {
    const result = await this.#db.prepare("DELETE FROM issues WHERE id = ?").bind(id).run();
    return result.meta.changes > 0;
  }
}

// ── 서비스 ─────────────────────────────────────────────

/** 관리자 API가 부름 */
export class IssueService {
  readonly #repo: IssueRepository;
  readonly #now: () => Date;

  constructor(repo: IssueRepository, options: { now?: () => Date } = {}) {
    this.#repo = repo;
    this.#now = options.now ?? (() => new Date());
  }

  list(): Promise<Issue[]> {
    return this.#repo.list();
  }

  async get(id: number): Promise<Issue> {
    const issue = await this.#repo.get(id);
    if (!issue) throw new NotFoundError("이슈를 찾을 수 없어요");
    return issue;
  }

  async create(raw: unknown): Promise<Issue> {
    return this.#repo.create(validateIssue(raw), this.#now().toISOString());
  }

  async update(id: number, raw: unknown): Promise<Issue> {
    const issue = await this.#repo.update(id, validateIssue(raw), this.#now().toISOString());
    if (!issue) throw new NotFoundError("이슈를 찾을 수 없어요");
    return issue;
  }

  async delete(id: number): Promise<void> {
    if (!(await this.#repo.delete(id))) throw new NotFoundError("이슈를 찾을 수 없어요");
  }
}
