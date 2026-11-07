import { ValidationError } from "./errors.ts";
import type { FieldIssue } from "./errors.ts";

/** 입력 제한값 (글자 수는 이모지도 한 글자로 센다) */
export const LIMITS = {
  title: 100,
  body: 200_000,
  summary: 300,
  thumbnail: 500,
  tagCount: 10,
  tagLength: 50,
} as const;

/** 정리·검증을 마친 글 입력값. 서비스는 이 모양만 받는다. */
export interface PostInput {
  title: string;
  body: string;
  /** 비어 있으면 null */
  summary: string | null;
  /** 비어 있으면 null (기본 이미지는 보여줄 때 채운다) */
  thumbnail: string | null;
  /** 소문자, 띄어쓰기 대신 -, 중복 없음 */
  tags: string[];
}

/** 고칠 때 넣는 값: 보낸 칸만 들어 있다. */
export type PostPatch = Partial<PostInput>;

/** 고칠 수 있는 칸 */
const PATCH_FIELDS = ["title", "body", "summary", "thumbnail", "tags"] as const satisfies readonly (keyof PostInput)[];

/**
 * 새 글 입력을 정리하고 검사한다. (빠진 칸은 기본값: 본문 "", 소개·대표 이미지 null, 태그 [])
 * 문제가 있으면 칸별 문제를 모두 모아 ValidationError 하나로 던진다. 모르는 항목은 무시한다.
 */
export function validatePostInput(raw: unknown): PostInput {
  const data = isRecord(raw) ? raw : {};
  const issues: FieldIssue[] = [];
  const input: PostInput = {
    title: readTitle(data.title, "제목을 입력하세요", issues),
    body: readBody(data.body, issues),
    summary: readSummary(data.summary, issues),
    thumbnail: readThumbnail(data.thumbnail, issues),
    tags: readTags(data.tags, issues),
  };
  if (issues.length > 0) throw new ValidationError(issues);
  return input;
}

/**
 * 고칠 내용을 정리하고 검사한다. **보낸 칸만** 결과에 들어간다.
 * - 칸을 안 보내면: 그대로 둠
 * - 빈 값("", null, [])을 보내면: 그 칸을 비움 (본문 "", 소개·대표 이미지 null, 태그 [])
 * - 비울 수 없는 칸(제목)에 빈 값을 보내면: 오류
 * - 고칠 수 있는 칸을 하나도 안 보내면: 오류 (모르는 항목만 있어도 마찬가지)
 */
export function validatePostPatch(raw: unknown): PostPatch {
  const data = isRecord(raw) ? raw : {};
  if (!PATCH_FIELDS.some((field) => sent(data, field))) {
    throw new ValidationError([], "바꿀 내용이 없어요");
  }
  const issues: FieldIssue[] = [];
  const patch: PostPatch = {};
  if (sent(data, "title")) patch.title = readTitle(data.title, "제목은 비울 수 없어요", issues);
  if (sent(data, "body")) patch.body = readBody(data.body, issues);
  if (sent(data, "summary")) patch.summary = readSummary(data.summary, issues);
  if (sent(data, "thumbnail")) patch.thumbnail = readThumbnail(data.thumbnail, issues);
  if (sent(data, "tags")) patch.tags = readTags(data.tags, issues);
  if (issues.length > 0) throw new ValidationError(issues);
  return patch;
}

// ── 칸별 읽기 (새 글·고치기 공통 규칙) ─────────────────

/** 제목: 비울 수 없음, 100자까지 */
function readTitle(value: unknown, emptyMessage: string, issues: FieldIssue[]): string {
  if (value !== undefined && value !== null && typeof value !== "string") {
    issues.push({ field: "title", message: "제목은 글자여야 해요" });
    return "";
  }
  const title = (value ?? "").trim();
  if (title === "") issues.push({ field: "title", message: emptyMessage });
  else if (charCount(title) > LIMITS.title) {
    issues.push({ field: "title", message: `제목은 ${LIMITS.title}자까지예요` });
  }
  return title;
}

/** 본문: 빈 값이면 "" (공백·들여쓰기는 그대로 둔다) */
function readBody(value: unknown, issues: FieldIssue[]): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    issues.push({ field: "body", message: "본문은 글자여야 해요" });
    return "";
  }
  if (charCount(value) > LIMITS.body) {
    issues.push({ field: "body", message: `본문은 ${LIMITS.body.toLocaleString("ko-KR")}자까지예요` });
  }
  return value;
}

/** 소개글: 빈 값이면 null */
function readSummary(value: unknown, issues: FieldIssue[]): string | null {
  return optionalText(value, "summary", "소개글", LIMITS.summary, issues);
}

/** 대표 이미지: 빈 값이면 null, /images/… 또는 https://… 만 */
function readThumbnail(value: unknown, issues: FieldIssue[]): string | null {
  const thumbnail = optionalText(value, "thumbnail", "대표 이미지 주소", LIMITS.thumbnail, issues);
  if (thumbnail !== null && !isAllowedImageUrl(thumbnail)) {
    issues.push({ field: "thumbnail", message: "대표 이미지는 /images/… 또는 https://… 주소만 쓸 수 있어요" });
  }
  return thumbnail;
}

/** 태그: 빈 값이면 [], 정리 후 10개·50자까지 */
function readTags(value: unknown, issues: FieldIssue[]): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || !value.every((tag) => typeof tag === "string")) {
    issues.push({ field: "tags", message: "태그는 글자 목록이어야 해요" });
    return [];
  }
  const tags = normalizeTags(value);
  if (tags.length > LIMITS.tagCount) {
    issues.push({ field: "tags", message: `태그는 ${LIMITS.tagCount}개까지예요` });
  }
  const tooLong = tags.find((tag) => charCount(tag) > LIMITS.tagLength);
  if (tooLong !== undefined) {
    issues.push({ field: "tags", message: `태그는 ${LIMITS.tagLength}자까지예요: ${tooLong}` });
  }
  return tags;
}

/** 이 칸을 보냈는지 (JSON에 이름이 있으면 보낸 것. 값이 null이어도 "비우기"로 보낸 것) */
function sent(data: Record<string, unknown>, field: string): boolean {
  return Object.hasOwn(data, field) && data[field] !== undefined;
}

/**
 * 태그 하나 정리: 앞뒤 공백 제거 → 소문자 → 띄어쓰기는 - 로 → 연속된 - 는 하나로 → 앞뒤 - 제거
 * 예) " Cloudflare  Workers " → "cloudflare-workers"
 */
export function normalizeTag(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** 태그 목록 정리: 하나씩 정리한 뒤 빈 값과 중복을 뺀다 (처음 나온 순서 유지) */
export function normalizeTags(tags: readonly string[]): string[] {
  const result: string[] = [];
  for (const tag of tags) {
    const normalized = normalizeTag(tag);
    if (normalized !== "" && !result.includes(normalized)) result.push(normalized);
  }
  return result;
}

/** 선택 글자 칸: 없거나 null이거나 공백뿐이면 null, 글자가 아니면 문제, 길면 문제 */
function optionalText(
  value: unknown,
  field: FieldIssue["field"],
  label: string,
  max: number,
  issues: FieldIssue[],
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    issues.push({ field, message: `${label}은(는) 글자여야 해요` });
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (charCount(trimmed) > max) issues.push({ field, message: `${label}은(는) ${max}자까지예요` });
  return trimmed;
}

/** 블로그 이미지 경로(/images/…) 또는 https 주소인지 */
function isAllowedImageUrl(value: string): boolean {
  if (value.startsWith("/images/")) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** 글자 수. 이모지처럼 두 칸을 차지하는 글자도 한 글자로 센다. */
function charCount(text: string): number {
  let count = 0;
  for (const _char of text) count++;
  return count;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
