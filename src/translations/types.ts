/**
 * 글 번역본 (설계 12). 한글 글(posts)마다 언어별로 공개본 하나 + 초안 하나까지.
 * 시각은 모두 ISO 8601 UTC 문자열.
 */

/** 번역할 수 있는 언어. 언어를 늘릴 때는 여기에만 더한다 (DB는 그대로) */
export const TRANSLATION_LANGS = ["en"] as const;
export type TranslationLang = (typeof TRANSLATION_LANGS)[number];

export function isTranslationLang(value: string): value is TranslationLang {
  return (TRANSLATION_LANGS as readonly string[]).includes(value);
}

/** 번역하는 부분 (대표 이미지·태그는 한글 글 것을 같이 쓴다) */
export interface TranslationContent {
  title: string;
  /** 요약. 없으면 null */
  summary: string | null;
  /** 본문 Markdown */
  body: string;
}

/** 공개된 번역본 */
export interface PublishedTranslation extends TranslationContent {
  postId: number;
  lang: TranslationLang;
  /** 번역할 때 한글의 해시 (sourceHash). 지금 한글과 다르면 "원문 바뀜" */
  sourceHash: string;
  /** 공개한 시각 */
  publishedAt: string;
  /** 마지막으로 반영한 시각 */
  updatedAt: string;
}

/** 번역 초안 (LLM 결과가 들어오고 관리자가 고치는 곳) */
export interface TranslationDraft extends TranslationContent {
  postId: number;
  lang: TranslationLang;
  sourceHash: string;
  /** 번역한 모델. 직접 쓰거나 공개본을 되돌린 것이면 null */
  model: string | null;
  updatedAt: string;
}

/** 목록 표시용: 글 하나의 번역 상태 재료 (본문 없이 해시만) */
export interface TranslationSummary {
  postId: number;
  /** 공개본의 sourceHash. 공개본이 없으면 null */
  publishedSourceHash: string | null;
  /** 초안의 sourceHash. 초안이 없으면 null */
  draftSourceHash: string | null;
}
