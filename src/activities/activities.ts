import type { D1Database } from "../posts/d1.ts";
import { NotFoundError, ValidationError } from "../posts/errors.ts";
import type { FieldIssue, ActivityField } from "../posts/errors.ts";
import { charCount } from "../posts/validation.ts";

/**
 * 활동 (설계 15-5, 15-8): 아카이브·홈에 보이는 짧은 기록 한 덩어리 (어디 입회, 프로젝트 시작, 입사 …).
 * 예전 이름 "이슈" (D1 표 issues → activities, 0008).
 * 자기 페이지·태그·RSS 없음. 저장하면 공개 대상(초안 없음), 공개 사이트는 배포해야 바뀜
 */
export interface Activity {
  id: number;
  /** YYYY-MM-DD (한국 날짜) */
  date: string;
  /** 꼬리표 (예: 입사, 동아리). 없으면 화면에 기본 "활동" */
  label: string | null;
  title: string;
  /** Markdown (빈 글자 가능) */
  body: string;
  /** 영어 제목·내용. 없으면 영어 페이지에 한국어 그대로 */
  /** 영어 꼬리표. 없으면 영어 페이지에 한국어 꼬리표 → 그것도 없으면 "Activity" */
  labelEn: string | null;
  titleEn: string | null;
  bodyEn: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 저장할 때 받는 값 */
export type ActivityInput = Pick<Activity, "date" | "label" | "title" | "body" | "labelEn" | "titleEn" | "bodyEn">;

export const ACTIVITY_LIMITS = { label: 20, title: 100, body: 5000 } as const;

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
export function validateActivity(raw: unknown): ActivityInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new ValidationError([], "활동을 객체 모양으로 보내 주세요");
  const data = raw as Record<string, unknown>;
  const issues: FieldIssue[] = [];
  /** 글자 칸. trim = 제목처럼 앞뒤 공백 정리 (내용은 줄 끝 공백만 정리) */
  const text = (field: ActivityField, max: number, options: { required?: string; trim: boolean; singleLine?: boolean }): string | null => {
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

  const dateValue = typeof data.date === "string" ? data.date.trim() : "";
  if (dateValue === "") issues.push({ field: "date", message: "날짜를 골라 주세요" });
  else if (!isRealDate(dateValue)) issues.push({ field: "date", message: "날짜 모양이 아니에요 (예: 2026-11-11)" });

  const input: ActivityInput = {
    date: dateValue,
    label: text("label", ACTIVITY_LIMITS.label, { trim: true, singleLine: true }),
    title: text("title", ACTIVITY_LIMITS.title, { required: "제목을 입력해 주세요", trim: true }) ?? "",
    body: text("body", ACTIVITY_LIMITS.body, { trim: false }) ?? "",
    labelEn: text("labelEn", ACTIVITY_LIMITS.label, { trim: true, singleLine: true }),
    titleEn: text("titleEn", ACTIVITY_LIMITS.title, { trim: true }),
    bodyEn: text("bodyEn", ACTIVITY_LIMITS.body, { trim: false }),
  };
  if (input.bodyEn !== null && input.titleEn === null) issues.push({ field: "titleEn", message: "영어 내용이 있으면 영어 제목도 넣어 주세요" });
  if (issues.length > 0) throw new ValidationError(issues);
  return input;
}

/** 최신 순: 날짜가 늦은 것 먼저, 같으면 id가 큰 것 먼저 */
export function byNewestActivity(a: Activity, b: Activity): number {
  return a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1;
}

// ── 저장소 ─────────────────────────────────────────────

export interface ActivityRepository {
  /** 최신 순 */
  list(): Promise<Activity[]>;
  get(id: number): Promise<Activity | null>;
  create(input: ActivityInput, at: string): Promise<Activity>;
  /** 없으면 null */
  update(id: number, input: ActivityInput, at: string): Promise<Activity | null>;
  /** 지웠으면 true */
  delete(id: number): Promise<boolean>;
}

export class MemoryActivityRepository implements ActivityRepository {
  #rows = new Map<number, Activity>();
  #nextId = 1;

  async list() {
    return [...this.#rows.values()].map((row) => ({ ...row })).sort(byNewestActivity);
  }

  async get(id: number) {
    const row = this.#rows.get(id);
    return row ? { ...row } : null;
  }

  async create(input: ActivityInput, at: string) {
    const activity: Activity = { id: this.#nextId++, ...input, createdAt: at, updatedAt: at };
    this.#rows.set(activity.id, activity);
    return { ...activity };
  }

  async update(id: number, input: ActivityInput, at: string) {
    const row = this.#rows.get(id);
    if (!row) return null;
    const activity = { ...row, ...input, updatedAt: at };
    this.#rows.set(id, activity);
    return { ...activity };
  }

  async delete(id: number) {
    return this.#rows.delete(id);
  }
}

interface ActivityRow {
  id: number;
  date: string;
  label: string | null;
  title: string;
  body: string;
  label_en: string | null;
  title_en: string | null;
  body_en: string | null;
  created_at: string;
  updated_at: string;
}

const fromRow = (row: ActivityRow): Activity => ({
  id: row.id,
  date: row.date,
  label: row.label,
  title: row.title,
  body: row.body,
  labelEn: row.label_en,
  titleEn: row.title_en,
  bodyEn: row.body_en,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class D1ActivityRepository implements ActivityRepository {
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  async list() {
    const { results } = await this.#db.prepare("SELECT * FROM activities ORDER BY date DESC, id DESC").all<ActivityRow>();
    return results.map(fromRow);
  }

  async get(id: number) {
    const row = await this.#db.prepare("SELECT * FROM activities WHERE id = ?").bind(id).first<ActivityRow>();
    return row ? fromRow(row) : null;
  }

  async create(input: ActivityInput, at: string) {
    const row = await this.#db
      .prepare(
        `INSERT INTO activities (date, label, title, body, label_en, title_en, body_en, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .bind(input.date, input.label, input.title, input.body, input.labelEn, input.titleEn, input.bodyEn, at, at)
      .first<ActivityRow>();
    return fromRow(row!);
  }

  async update(id: number, input: ActivityInput, at: string) {
    const row = await this.#db
      .prepare("UPDATE activities SET date = ?, label = ?, title = ?, body = ?, label_en = ?, title_en = ?, body_en = ?, updated_at = ? WHERE id = ? RETURNING *")
      .bind(input.date, input.label, input.title, input.body, input.labelEn, input.titleEn, input.bodyEn, at, id)
      .first<ActivityRow>();
    return row ? fromRow(row) : null;
  }

  async delete(id: number) {
    const result = await this.#db.prepare("DELETE FROM activities WHERE id = ?").bind(id).run();
    return result.meta.changes > 0;
  }
}

// ── 서비스 ─────────────────────────────────────────────

/** 관리자 API가 부름 */
export class ActivityService {
  readonly #repo: ActivityRepository;
  readonly #now: () => Date;

  constructor(repo: ActivityRepository, options: { now?: () => Date } = {}) {
    this.#repo = repo;
    this.#now = options.now ?? (() => new Date());
  }

  list(): Promise<Activity[]> {
    return this.#repo.list();
  }

  async get(id: number): Promise<Activity> {
    const activity = await this.#repo.get(id);
    if (!activity) throw new NotFoundError("활동을 찾을 수 없어요");
    return activity;
  }

  async create(raw: unknown): Promise<Activity> {
    return this.#repo.create(validateActivity(raw), this.#now().toISOString());
  }

  async update(id: number, raw: unknown): Promise<Activity> {
    const activity = await this.#repo.update(id, validateActivity(raw), this.#now().toISOString());
    if (!activity) throw new NotFoundError("활동을 찾을 수 없어요");
    return activity;
  }

  async delete(id: number): Promise<void> {
    if (!(await this.#repo.delete(id))) throw new NotFoundError("활동을 찾을 수 없어요");
  }
}
