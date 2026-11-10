import { ConflictError, NotFoundError, ValidationError } from "../posts/errors.ts";
import type { FieldIssue } from "../posts/errors.ts";
import type { PostRepository } from "../posts/repository.ts";
import type { Post } from "../posts/types.ts";
import { charCount } from "../posts/validation.ts";
import { TranslationError } from "./llm.ts";
import type { LlmClient } from "./llm.ts";
import type { TranslationRepository } from "./repository.ts";
import { sourceHash } from "./source-hash.ts";
import { translationStatus } from "./status.ts";
import type { TranslationStatus } from "./status.ts";
import { translatePost } from "./translate.ts";
import type { TranslationContent, TranslationLang } from "./types.ts";

/** 번역 글자 수 제한. 영어가 한글보다 길어서 제목·요약은 한글 제한의 2배, 본문은 같음 */
export const TRANSLATION_LIMITS = { title: 200, summary: 600, body: 200_000 } as const;

/** 번역 화면 정보 (GET 응답, 쓰는 동작도 같은 모양을 돌려준다) */
export interface TranslationView {
  lang: TranslationLang;
  source: {
    /** 한글이 공개 상태인지 (번역·공개는 공개 상태일 때만) */
    published: boolean;
    /** 반영 안 한 한글 수정본이 있는지 (번역에는 안 들어감) */
    hasPendingEdits: boolean;
  };
  published: { title: string; summary: string | null; body: string; publishedAt: string; updatedAt: string } | null;
  draft: { title: string; summary: string | null; body: string; model: string | null; updatedAt: string } | null;
  status: TranslationStatus;
  /** 번역 버튼을 쓸 수 있는지 (제공자 설정 여부) */
  translator: boolean;
}

/** 목록 표시용 상태 */
export interface TranslationListItem extends TranslationStatus {
  postId: number;
}

export interface TranslationServiceOptions {
  /** 번역 제공자. 없으면 번역(generate)만 503 */
  llm?: LlmClient;
  now?: () => Date;
}

/**
 * 번역 기능 (설계 12-9). 관리자 API가 부른다.
 * 실패: NotFoundError 404 / ConflictError 409 / ValidationError 400 / TranslationError (종류별)
 */
export class TranslationService {
  readonly #posts: PostRepository;
  readonly #translations: TranslationRepository;
  readonly #llm: LlmClient | undefined;
  readonly #now: () => Date;

  constructor(posts: PostRepository, translations: TranslationRepository, options: TranslationServiceOptions = {}) {
    this.#posts = posts;
    this.#translations = translations;
    this.#llm = options.llm;
    this.#now = options.now ?? (() => new Date());
  }

  async get(postId: number, lang: TranslationLang): Promise<TranslationView> {
    return this.#view(await this.#requirePost(postId), lang);
  }

  /** LLM 번역 → 초안에 저장 (있으면 덮어씀). 번역 대상은 공개된 한글 */
  async generate(postId: number, lang: TranslationLang): Promise<TranslationView> {
    const post = await this.#requirePost(postId);
    requirePublished(post);
    if (!this.#llm) throw new TranslationError("not_configured", "번역 설정이 없어요");

    const result = await translatePost(this.#llm, post, lang);
    const problem = limitIssues(result)[0];
    if (problem) throw new TranslationError("invalid_output", `번역 결과가 이상해요: ${problem.message}`);

    await this.#translations.saveDraft({
      postId,
      lang,
      title: result.title,
      summary: result.summary,
      body: result.body,
      sourceHash: await sourceHash(post),
      model: result.model,
      updatedAt: this.#timestamp(),
    });
    return this.#view(post, lang);
  }

  /** 초안 저장 {title, summary, body}. 초안이 없으면 새로 만든다 */
  async saveDraft(postId: number, lang: TranslationLang, raw: unknown): Promise<TranslationView> {
    const post = await this.#requirePost(postId);
    const input = validateTranslationInput(raw);
    const existing = await this.#translations.getDraft(postId, lang);
    const published = existing ? null : await this.#translations.getPublished(postId, lang);
    await this.#translations.saveDraft({
      postId,
      lang,
      ...input,
      // 기준 해시: 이어서 고치는 거면 그대로, 공개본을 고치기 시작하면 공개본 것("원문 바뀜"이 사라지지 않게), 처음이면 지금 한글
      sourceHash: existing?.sourceHash ?? published?.sourceHash ?? (await sourceHash(post)),
      model: existing?.model ?? null,
      updatedAt: this.#timestamp(),
    });
    return this.#view(post, lang);
  }

  async deleteDraft(postId: number, lang: TranslationLang): Promise<void> {
    await this.#requirePost(postId);
    if (!(await this.#translations.deleteDraft(postId, lang))) throw new NotFoundError("버릴 번역 초안이 없어요");
  }

  async publish(postId: number, lang: TranslationLang): Promise<TranslationView> {
    const post = await this.#requirePost(postId);
    requirePublished(post);
    if (!(await this.#translations.publishDraft(postId, lang, this.#timestamp()))) {
      throw new ConflictError("공개할 번역 초안이 없어요");
    }
    return this.#view(post, lang);
  }

  async unpublish(postId: number, lang: TranslationLang): Promise<TranslationView> {
    const post = await this.#requirePost(postId);
    if (!(await this.#translations.unpublish(postId, lang, this.#timestamp()))) {
      throw new ConflictError("공개된 번역이 없어요");
    }
    return this.#view(post, lang);
  }

  /** 목록 표시용: 번역이 하나라도 있는 (휴지통이 아닌) 글들의 상태, 글 id 순 */
  async list(lang: TranslationLang): Promise<TranslationListItem[]> {
    const items: TranslationListItem[] = [];
    for (const summary of await this.#translations.listSummaries(lang)) {
      const post = await this.#posts.get(summary.postId);
      if (!post) continue;
      const status = translationStatus(await sourceHash(post), summary.publishedSourceHash, summary.draftSourceHash);
      items.push({ postId: summary.postId, ...status });
    }
    return items;
  }

  async #view(post: Post, lang: TranslationLang): Promise<TranslationView> {
    const [published, draft, pendingEdits] = await Promise.all([
      this.#translations.getPublished(post.id, lang),
      this.#translations.getDraft(post.id, lang),
      this.#posts.getDraft(post.id),
    ]);
    return {
      lang,
      source: { published: post.status === "published", hasPendingEdits: pendingEdits !== null },
      published: published && {
        title: published.title,
        summary: published.summary,
        body: published.body,
        publishedAt: published.publishedAt,
        updatedAt: published.updatedAt,
      },
      draft: draft && { title: draft.title, summary: draft.summary, body: draft.body, model: draft.model, updatedAt: draft.updatedAt },
      status: translationStatus(await sourceHash(post), published?.sourceHash ?? null, draft?.sourceHash ?? null),
      translator: this.#llm !== undefined,
    };
  }

  async #requirePost(id: number): Promise<Post> {
    const post = Number.isInteger(id) && id >= 1 ? await this.#posts.get(id) : null;
    if (!post) throw new NotFoundError("글을 찾을 수 없어요");
    return post;
  }

  #timestamp(): string {
    return this.#now().toISOString();
  }
}

function requirePublished(post: Post): void {
  if (post.status !== "published") throw new ConflictError("한글을 먼저 공개하세요");
}

/** 번역 입력 {title, summary, body} 정리·검증. 제목 앞뒤 공백 제거, 빈 요약은 null, 본문은 그대로 */
export function validateTranslationInput(raw: unknown): TranslationContent {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ValidationError([], "번역 내용을 {title, summary, body} 모양으로 보내 주세요");
  }
  const { title, summary, body } = raw as Record<string, unknown>;
  const issues: FieldIssue[] = [];
  if (typeof title !== "string") issues.push({ field: "title", message: "제목은 글자여야 해요" });
  if (summary !== undefined && summary !== null && typeof summary !== "string") {
    issues.push({ field: "summary", message: "요약은 글자여야 해요" });
  }
  if (body !== undefined && body !== null && typeof body !== "string") issues.push({ field: "body", message: "본문은 글자여야 해요" });
  if (issues.length > 0) throw new ValidationError(issues);

  const content: TranslationContent = {
    title: (title as string).trim(),
    summary: typeof summary === "string" && summary.trim() !== "" ? summary.trim() : null,
    body: typeof body === "string" ? body : "",
  };
  const problems = limitIssues(content);
  if (content.title === "") problems.unshift({ field: "title", message: "제목을 입력해 주세요" });
  if (problems.length > 0) throw new ValidationError(problems);
  return content;
}

function limitIssues(content: TranslationContent): FieldIssue[] {
  const issues: FieldIssue[] = [];
  if (charCount(content.title) > TRANSLATION_LIMITS.title) {
    issues.push({ field: "title", message: `제목이 너무 길어요 (${TRANSLATION_LIMITS.title}자까지)` });
  }
  if (content.summary && charCount(content.summary) > TRANSLATION_LIMITS.summary) {
    issues.push({ field: "summary", message: `요약이 너무 길어요 (${TRANSLATION_LIMITS.summary}자까지)` });
  }
  if (charCount(content.body) > TRANSLATION_LIMITS.body) {
    issues.push({ field: "body", message: `본문이 너무 길어요 (${TRANSLATION_LIMITS.body.toLocaleString("ko-KR")}자까지)` });
  }
  return issues;
}
