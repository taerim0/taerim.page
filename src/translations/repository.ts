import type { PublishedTranslation, TranslationDraft, TranslationLang, TranslationSummary } from "./types.ts";

/**
 * 번역본 저장소 (D1 post_translations / post_translation_drafts).
 *
 * - 글·언어당 공개본 하나 + 초안 하나까지
 * - 값이 올바른지(언어 코드, 한글 글이 공개 상태인지 등)는 부르는 쪽(서비스)이 확인한다
 * - D1에서는 글을 완전 삭제하면 번역본도 같이 지워진다(CASCADE). 메모리 저장소는 글을 모르므로
 *   지워진 글의 번역이 남을 수 있지만, 빌드·화면은 언제나 글 쪽에서 출발하므로 드러나지 않는다
 */
export interface TranslationRepository {
  /** 공개본. 없으면 null */
  getPublished(postId: number, lang: TranslationLang): Promise<PublishedTranslation | null>;
  /** 초안. 없으면 null */
  getDraft(postId: number, lang: TranslationLang): Promise<TranslationDraft | null>;
  /** 초안 저장. 이미 있으면 통째로 바꾼다 (LLM 결과 덮어쓰기, 고친 내용 저장) */
  saveDraft(draft: TranslationDraft): Promise<void>;
  /** 초안 버리기. 지웠으면 true, 없었으면 false */
  deleteDraft(postId: number, lang: TranslationLang): Promise<boolean>;
  /**
   * 초안 → 공개본 (한 번에). 초안은 지워진다.
   * 이미 공개본이 있으면 내용을 바꾸고 publishedAt은 그대로, updatedAt = at.
   * 처음이면 publishedAt = updatedAt = at. 초안이 없으면 아무것도 안 하고 null
   */
  publishDraft(postId: number, lang: TranslationLang, at: string): Promise<PublishedTranslation | null>;
  /**
   * 공개본 내리기 (한 번에). 초안이 없으면 공개본 내용을 초안으로 되돌려 둔다(model = null, updatedAt = at).
   * 초안이 이미 있으면 그 초안이 더 새것이므로 그대로 둔다. 공개본이 없었으면 false
   */
  unpublish(postId: number, lang: TranslationLang, at: string): Promise<boolean>;
  /** 이 언어의 공개본 전부, 글 id 순 (빌드용) */
  listPublished(lang: TranslationLang): Promise<PublishedTranslation[]>;
  /** 이 언어의 번역이 하나라도 있는 글들의 상태 재료, 글 id 순 (관리자 목록 표시용) */
  listSummaries(lang: TranslationLang): Promise<TranslationSummary[]>;
}
