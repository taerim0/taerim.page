import type { D1Database } from "../posts/d1.ts";
import { ValidationError } from "../posts/errors.ts";
import type { FieldIssue, SettingsField } from "../posts/errors.ts";
import { charCount } from "../posts/validation.ts";

/**
 * 사이트 설정 (설계 15-3): 홈 소개 카드·바닥글·사이트 소개.
 * 저장은 D1 site_settings 한 줄(JSON), 공개 사이트는 빌드 때 읽는다 (정적 파일)
 */
export interface SiteSettings {
  /** 소개 카드 이름 */
  name: string;
  /** 프로필 사진 (/images/…). 없으면 기본 프로필 그림 */
  photo: string | null;
  /** 한 줄 소개 (한국어) */
  tagline: string | null;
  /** 한 줄 소개 (영어). 없으면 영어 페이지도 한국어 */
  taglineEn: string | null;
  /** 사이트 소개 (검색엔진·공유 설명, RSS) */
  description: string;
  /** 사이트 소개 (영어). 없으면 한국어 */
  descriptionEn: string | null;
  github: string | null;
  email: string | null;
  linkedin: string | null;
  solvedac: string | null;
}

/** 저장한 적 없을 때 */
export const DEFAULT_SETTINGS: SiteSettings = {
  name: "taerim",
  photo: null,
  tagline: null,
  taglineEn: null,
  description: "taerim의 블로그",
  descriptionEn: "taerim's blog",
  github: null,
  email: null,
  linkedin: null,
  solvedac: null,
};

/** 기본 프로필 그림 (site-static/assets, 관리자 미리보기는 admin-ui/assets에 같은 파일) */
export const DEFAULT_AVATAR = "/assets/default-avatar.svg";

export const SETTINGS_LIMITS = { name: 40, tagline: 100, description: 200, url: 300, email: 200 } as const;

/** 링크 칸마다 허용하는 주소 (https, 그 사이트만) */
const LINK_RULES: Record<"github" | "linkedin" | "solvedac", { hosts: string[]; label: string }> = {
  github: { hosts: ["github.com"], label: "GitHub 주소는 https://github.com/… 모양이어야 해요" },
  linkedin: { hosts: ["linkedin.com", "www.linkedin.com"], label: "LinkedIn 주소는 https://www.linkedin.com/… 모양이어야 해요" },
  solvedac: { hosts: ["solved.ac", "www.solved.ac"], label: "solved.ac 주소는 https://solved.ac/… 모양이어야 해요" },
};

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const IMAGE_PATH = /^\/images\/[0-9a-f]{12}\.(webp|gif)$/;

/** 입력 정리·검사. 문제가 있으면 칸별로 모아 ValidationError */
export function validateSettings(raw: unknown): SiteSettings {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new ValidationError([], "설정을 객체 모양으로 보내 주세요");
  const data = raw as Record<string, unknown>;
  const issues: FieldIssue[] = [];
  const text = (field: SettingsField, max: number, required: string | null): string | null => {
    const value = data[field];
    if (value !== undefined && value !== null && typeof value !== "string") {
      issues.push({ field, message: "글자여야 해요" });
      return null;
    }
    const trimmed = (value ?? "").trim();
    if (trimmed === "") {
      if (required) issues.push({ field, message: required });
      return null;
    }
    if (charCount(trimmed) > max) issues.push({ field, message: `${max}자까지예요` });
    return trimmed;
  };
  const link = (field: "github" | "linkedin" | "solvedac"): string | null => {
    const value = text(field, SETTINGS_LIMITS.url, null);
    if (value === null) return null;
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && LINK_RULES[field].hosts.includes(url.hostname)) return url.href;
    } catch {
      // 아래에서 오류
    }
    issues.push({ field, message: LINK_RULES[field].label });
    return null;
  };

  const settings: SiteSettings = {
    name: text("name", SETTINGS_LIMITS.name, "이름을 입력해 주세요") ?? "",
    photo: text("photo", SETTINGS_LIMITS.url, null),
    tagline: text("tagline", SETTINGS_LIMITS.tagline, null),
    taglineEn: text("taglineEn", SETTINGS_LIMITS.tagline, null),
    description: text("description", SETTINGS_LIMITS.description, "사이트 소개를 입력해 주세요") ?? "",
    descriptionEn: text("descriptionEn", SETTINGS_LIMITS.description, null),
    github: link("github"),
    email: text("email", SETTINGS_LIMITS.email, null),
    linkedin: link("linkedin"),
    solvedac: link("solvedac"),
  };
  if (settings.photo !== null && !IMAGE_PATH.test(settings.photo)) issues.push({ field: "photo", message: "사진은 올린 이미지(/images/…)만 쓸 수 있어요" });
  if (settings.email !== null && !EMAIL.test(settings.email)) issues.push({ field: "email", message: "이메일 모양이 아니에요" });
  if (issues.length > 0) throw new ValidationError(issues);
  return settings;
}

/** 저장된 JSON → 설정 (옛 버전에 없던 칸은 기본값으로 채움) */
function fromStored(json: string): SiteSettings {
  const parsed = JSON.parse(json) as Partial<SiteSettings>;
  return { ...DEFAULT_SETTINGS, ...parsed };
}

// ── 저장소 ─────────────────────────────────────────────

export interface SettingsRepository {
  /** 저장한 적 없으면 null */
  get(): Promise<{ settings: SiteSettings; updatedAt: string } | null>;
  save(settings: SiteSettings, at: string): Promise<void>;
}

export class MemorySettingsRepository implements SettingsRepository {
  #row: { json: string; updatedAt: string } | null = null;

  async get() {
    return this.#row ? { settings: fromStored(this.#row.json), updatedAt: this.#row.updatedAt } : null;
  }

  async save(settings: SiteSettings, at: string) {
    this.#row = { json: JSON.stringify(settings), updatedAt: at };
  }
}

export class D1SettingsRepository implements SettingsRepository {
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  async get() {
    const row = await this.#db.prepare("SELECT data, updated_at FROM site_settings WHERE id = 1").first<{ data: string; updated_at: string }>();
    return row ? { settings: fromStored(row.data), updatedAt: row.updated_at } : null;
  }

  async save(settings: SiteSettings, at: string) {
    await this.#db
      .prepare(
        `INSERT INTO site_settings (id, data, updated_at) VALUES (1, ?, ?)
         ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .bind(JSON.stringify(settings), at)
      .run();
  }
}

// ── 서비스 ─────────────────────────────────────────────

/** 관리자 API가 부름. 저장한 적 없으면 기본값 */
export class SettingsService {
  readonly #repo: SettingsRepository;
  readonly #now: () => Date;

  constructor(repo: SettingsRepository, options: { now?: () => Date } = {}) {
    this.#repo = repo;
    this.#now = options.now ?? (() => new Date());
  }

  async get(): Promise<{ settings: SiteSettings; updatedAt: string | null }> {
    const saved = await this.#repo.get();
    return saved ?? { settings: { ...DEFAULT_SETTINGS }, updatedAt: null };
  }

  async save(raw: unknown): Promise<{ settings: SiteSettings; updatedAt: string }> {
    const settings = validateSettings(raw);
    const updatedAt = this.#now().toISOString();
    await this.#repo.save(settings, updatedAt);
    return { settings, updatedAt };
  }
}
