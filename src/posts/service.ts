import { ConflictError, NotFoundError } from "./errors.ts";
import { MAX_PAGE_SIZE } from "./repository.ts";
import type { PostRepository } from "./repository.ts";
import type { Page, Post, PostDraft, PostListFilter, PostSummary, TagCount } from "./types.ts";
import { validatePostInput } from "./validation.ts";

/** 서비스 설정 */
export interface PostServiceOptions {
  /** 지금 시각. 테스트에서 시각을 고정할 때 바꿔 끼운다. 기본: 실제 시계 */
  now?: () => Date;
}

/** 편집 화면에 필요한 것: 글과, 있으면 작업본 */
export interface PostForEdit {
  post: Post;
  draft: PostDraft | null;
}

/** 저장 결과. 초안이면 글이 바로 바뀌고, 공개 글이면 작업본에 저장된다. */
export type SaveResult =
  | { savedTo: "post"; post: Post }
  | { savedTo: "draft"; draft: PostDraft };

/**
 * 글 기능. 관리자 화면·API가 부르는 "할 일" 단위.
 * 입력을 정리·검증하고, 상태에 맞는지 판단하고, 시각을 기록한 뒤 저장소에 맡긴다.
 *
 * 실패하면 오류를 던진다:
 * - ValidationError: 입력 오류 / NotFoundError: 없음 / ConflictError: 지금 상태에서 불가
 */
export class PostService {
  readonly #repo: PostRepository;
  readonly #now: () => Date;

  constructor(repo: PostRepository, options: PostServiceOptions = {}) {
    this.#repo = repo;
    this.#now = options.now ?? (() => new Date());
  }

  // ── 조회 ─────────────────────────────────────────────

  /** 글 하나. 없거나 휴지통이면 NotFoundError */
  async get(id: number): Promise<Post> {
    return this.#requirePost(id);
  }

  /** 편집 화면용: 글 + 작업본 */
  async getForEdit(id: number): Promise<PostForEdit> {
    const post = await this.#requirePost(id);
    const draft = await this.#repo.getDraft(id);
    return { post, draft };
  }

  /** 글 목록 (기본 10개씩) */
  list(filter?: PostListFilter): Promise<Page<PostSummary>> {
    return this.#repo.list(filter);
  }

  /** 태그별 글 개수 */
  listTags(): Promise<TagCount[]> {
    return this.#repo.listTags();
  }

  // ── 쓰기 ─────────────────────────────────────────────

  /** 새 글. 항상 초안으로 시작한다. */
  async create(raw: unknown): Promise<Post> {
    const input = validatePostInput(raw);
    const at = this.#timestamp();
    return this.#repo.create({
      ...input,
      status: "draft",
      createdAt: at,
      updatedAt: at,
      publishedAt: null,
    });
  }

  /**
   * 저장. 초안이면 글을 바로 고치고, 공개 글이면 작업본에 임시저장한다.
   * (공개 글의 공개본은 수정본 반영 전까지 그대로)
   */
  async save(id: number, raw: unknown): Promise<SaveResult> {
    const input = validatePostInput(raw);
    const post = await this.#requirePost(id);
    const at = this.#timestamp();

    if (post.status === "draft") {
      const updated = await this.#repo.update(id, { ...input, updatedAt: at });
      if (!updated) throw notFound();
      return { savedTo: "post", post: updated };
    }

    const draft: PostDraft = { postId: id, ...input, updatedAt: at };
    if (!(await this.#repo.saveDraft(draft))) throw notFound();
    return { savedTo: "draft", draft };
  }

  /** 공개. 처음 공개하면 공개 시각을 기록하고, 다시 공개하면 처음 시각을 유지한다. */
  async publish(id: number): Promise<Post> {
    const post = await this.#requirePost(id);
    if (post.status === "published") throw new ConflictError("이미 공개된 글이에요");
    const at = this.#timestamp();
    return this.#updateOrThrow(id, {
      status: "published",
      publishedAt: post.publishedAt ?? at,
      updatedAt: at,
    });
  }

  /** 비공개(초안으로 되돌리기). 수정 중인 작업본이 있으면 막는다. */
  async unpublish(id: number): Promise<Post> {
    const post = await this.#requirePost(id);
    if (post.status !== "published") throw new ConflictError("공개된 글이 아니에요");
    if (await this.#repo.getDraft(id)) {
      throw new ConflictError("수정 중인 작업본이 있어요. 먼저 반영하거나 버려 주세요");
    }
    return this.#updateOrThrow(id, { status: "draft", updatedAt: this.#timestamp() });
  }

  /** 수정본 반영: 작업본을 공개본에 덮어쓴다. */
  async applyEdits(id: number): Promise<Post> {
    await this.#requirePost(id);
    const applied = await this.#repo.applyDraft(id, this.#timestamp());
    if (!applied) throw new NotFoundError("반영할 작업본이 없어요");
    return applied;
  }

  /** 수정본 버리기 */
  async discardEdits(id: number): Promise<void> {
    await this.#requirePost(id);
    if (!(await this.#repo.deleteDraft(id))) throw new NotFoundError("버릴 작업본이 없어요");
  }

  // ── 휴지통 ───────────────────────────────────────────

  /** 휴지통에 넣기. 작업본은 그대로 보관된다. */
  async trash(id: number): Promise<void> {
    await this.#requirePost(id);
    if (!(await this.#repo.moveToTrash(id, this.#timestamp()))) throw notFound();
  }

  /** 휴지통에서 되살리기. 원래 상태(초안/공개)로 돌아간다. */
  async restore(id: number): Promise<void> {
    await this.#requireTrashed(id);
    if (!(await this.#repo.restore(id))) throw notFound();
  }

  /** 완전 삭제. 휴지통에 있는 글만 지울 수 있다. */
  async purge(id: number): Promise<void> {
    await this.#requireTrashed(id);
    if (!(await this.#repo.purge(id))) throw notFound();
  }

  /** 휴지통 비우기. 지운 글 수를 돌려준다. */
  async emptyTrash(): Promise<number> {
    let removed = 0;
    // 지울 때마다 목록이 줄어들므로 항상 첫 페이지를 다시 읽는다
    for (;;) {
      const { items } = await this.#repo.list({ trash: true, pageSize: MAX_PAGE_SIZE });
      if (items.length === 0) return removed;
      for (const item of items) {
        if (await this.#repo.purge(item.id)) removed++;
      }
    }
  }

  // ── 내부 도우미 ──────────────────────────────────────

  #timestamp(): string {
    return this.#now().toISOString();
  }

  /** 휴지통이 아닌 글. 없으면 NotFoundError */
  async #requirePost(id: number): Promise<Post> {
    const post = isValidId(id) ? await this.#repo.get(id) : null;
    if (!post) throw notFound();
    return post;
  }

  /** 휴지통에 있는 글. 없으면 NotFoundError, 휴지통이 아니면 ConflictError */
  async #requireTrashed(id: number): Promise<Post> {
    const post = isValidId(id) ? await this.#repo.get(id, { includeTrashed: true }) : null;
    if (!post) throw notFound();
    if (post.deletedAt === null) throw new ConflictError("휴지통에 있는 글이 아니에요");
    return post;
  }

  async #updateOrThrow(id: number, changes: Parameters<PostRepository["update"]>[1]): Promise<Post> {
    const updated = await this.#repo.update(id, changes);
    if (!updated) throw notFound();
    return updated;
  }
}

/** id는 1 이상의 정수만 */
function isValidId(id: number): boolean {
  return Number.isInteger(id) && id >= 1;
}

function notFound(): NotFoundError {
  return new NotFoundError("글을 찾을 수 없어요");
}
