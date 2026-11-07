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

/**
 * 외부에서 들어온 값(API 요청 본문 등)을 정리하고 검사한다.
 * 문제가 있으면 칸별 문제를 모두 모아 ValidationError 하나로 던진다.
 * 모르는 항목은 무시한다.
 */
export function validatePostInput(raw: unknown): PostInput {
  const data = isRecord(raw) ? raw : {};
  const issues: FieldIssue[] = [];

  // 제목: 필수
  let title = "";
  if (typeof data.title !== "string") {
    issues.push({ field: "title", message: "제목을 입력하세요" });
  } else {
    title = data.title.trim();
    if (title === "") issues.push({ field: "title", message: "제목을 입력하세요" });
    else if (charCount(title) > LIMITS.title) {
      issues.push({ field: "title", message: `제목은 ${LIMITS.title}자까지예요` });
    }
  }

  // 본문: 없으면 빈 본문
  let body = "";
  if (data.body !== undefined && typeof data.body !== "string") {
    issues.push({ field: "body", message: "본문은 글자여야 해요" });
  } else {
    body = (data.body as string | undefined) ?? "";
    if (charCount(body) > LIMITS.body) {
      issues.push({ field: "body", message: `본문은 ${LIMITS.body.toLocaleString("ko-KR")}자까지예요` });
    }
  }

  // 소개글: 선택
  const summary = optionalText(data.summary, "summary", "소개글", LIMITS.summary, issues);

  // 대표 이미지: 선택, /images/… 또는 https://… 만
  const thumbnail = optionalText(data.thumbnail, "thumbnail", "대표 이미지 주소", LIMITS.thumbnail, issues);
  if (thumbnail !== null && !isAllowedImageUrl(thumbnail)) {
    issues.push({ field: "thumbnail", message: "대표 이미지는 /images/… 또는 https://… 주소만 쓸 수 있어요" });
  }

  // 태그: 선택
  let tags: string[] = [];
  if (data.tags !== undefined) {
    if (!Array.isArray(data.tags) || !data.tags.every((tag) => typeof tag === "string")) {
      issues.push({ field: "tags", message: "태그는 글자 목록이어야 해요" });
    } else {
      tags = normalizeTags(data.tags);
      if (tags.length > LIMITS.tagCount) {
        issues.push({ field: "tags", message: `태그는 ${LIMITS.tagCount}개까지예요` });
      }
      const tooLong = tags.find((tag) => charCount(tag) > LIMITS.tagLength);
      if (tooLong !== undefined) {
        issues.push({ field: "tags", message: `태그는 ${LIMITS.tagLength}자까지예요: ${tooLong}` });
      }
    }
  }

  if (issues.length > 0) throw new ValidationError(issues);
  return { title, body, summary, thumbnail, tags };
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
