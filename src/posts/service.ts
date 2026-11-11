import { ConflictError, NotFoundError, ValidationError } from "./errors.ts";
import { MAX_PAGE_SIZE } from "./repository.ts";
import type { PostRepository } from "./repository.ts";
import { TagTree } from "./tag-tree.ts";
import type { Page, Post, PostCounts, PostDraft, PostListFilter, PostSummary, TagNode } from "./types.ts";
import { isAllowedTag, normalizeTag, TAG_CHARS_MESSAGE, validatePostInput, validatePostPatch } from "./validation.ts";

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

  /**
   * 글 목록 (기본 10개씩). 설계 14:
   * - 태그로 거르면 그 태그의 하위 태그가 붙은 글도 (상위 태그가 같이 붙은 것으로 보므로)
   * - 글마다 태그에 상위 태그를 붙여서 (트리 순)
   */
  async list(filter: PostListFilter = {}): Promise<Page<PostSummary>> {
    const tree = await this.#tree();
    const tagGroups = filter.tagGroups ?? filter.tags?.map((tag) => [tag, ...tree.descendantsOf(tag)]);
    const page = await this.#repo.list({ ...filter, tags: undefined, tagGroups });
    return { ...page, items: page.items.map((item) => ({ ...item, tags: tree.withAncestors(item.tags) })) };
  }

  /** 상태별 글 수 (관리자 글 목록 위, 설계 16-11) */
  counts(): Promise<PostCounts> {
    return this.#repo.counts();
  }

  /** 모든 태그와 부모·글 수 (트리 순, 안 쓰이는 태그 포함 — 화면이 total로 거름) */
  async listTags(): Promise<TagNode[]> {
    const [parents, usage] = await Promise.all([this.#repo.listTagParents(), this.#repo.listTagUsage()]);
    const tree = new TagTree(parents);
    const postsByTag = new Map<string, Set<number>>();
    for (const { name, postId } of usage) {
      const set = postsByTag.get(name) ?? new Set<number>();
      set.add(postId);
      postsByTag.set(name, set);
    }
    return tree.names().map((name) => {
      const total = new Set<number>();
      for (const tag of [name, ...tree.descendantsOf(name)]) for (const id of postsByTag.get(tag) ?? []) total.add(id);
      return { name, parent: tree.parentOf(name), count: postsByTag.get(name)?.size ?? 0, total: total.size };
    });
  }

  /**
   * 태그의 부모를 정한다 (설계 14). 블로그 전체에 적용. 없는 태그는 새로 만든다.
   * 이름은 글의 태그와 같은 규칙으로 정리·검사, 자기 자신·자기 하위를 부모로 하면 ConflictError
   * @returns 바뀐 뒤의 전체 태그 목록
   */
  async setTagParent(rawName: string, rawParent: string | null): Promise<TagNode[]> {
    const name = normalizeTag(rawName);
    const parent = rawParent === null ? null : normalizeTag(rawParent);
    for (const tag of [name, parent]) {
      if (tag === null) continue;
      if (tag === "" || !isAllowedTag(tag)) throw new ValidationError([{ field: "tags", message: `${TAG_CHARS_MESSAGE}: ${tag}` }]);
    }
    if (parent !== null && (await this.#tree()).wouldCycle(name, parent)) {
      throw new ConflictError(`#${parent}은(는) #${name}의 하위 태그라서 상위로 둘 수 없어요`);
    }
    await this.#repo.setTagParent(name, parent);
    return this.listTags();
  }

  async #tree(): Promise<TagTree> {
    return new TagTree(await this.#repo.listTagParents());
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
   * 저장. **보낸 칸만** 바뀐다. (안 보낸 칸은 그대로, 빈 값을 보내면 비움)
   * 초안이면 글을 바로 고치고, 공개 글이면 작업본에 임시저장한다.
   * 공개 글은 작업본이 있으면 작업본 위에, 없으면 공개본 내용 위에 고친 칸을 덮는다.
   * (공개본은 수정본 반영 전까지 그대로)
   */
  async save(id: number, raw: unknown): Promise<SaveResult> {
    const patch = validatePostPatch(raw);
    const post = await this.#requirePost(id);
    const at = this.#timestamp();

    if (post.status === "draft") {
      const updated = await this.#repo.update(id, { ...patch, updatedAt: at });
      if (!updated) throw notFound();
      return { savedTo: "post", post: updated };
    }

    const base = (await this.#repo.getDraft(id)) ?? post;
    const draft: PostDraft = {
      postId: id,
      title: base.title,
      body: base.body,
      summary: base.summary,
      thumbnail: base.thumbnail,
      tags: base.tags,
      ...patch,
      updatedAt: at,
    };
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

  /**
   * 휴지통에서 되살리기. 공개였던 글도 **초안으로** 돌아간다 (다음 배포에 저절로 다시 나가지 않게).
   * 작업본이 있으면 그 내용으로 되살린다. 공개 시각은 그대로라 다시 공개하면 처음 시각을 유지한다.
   */
  async restore(id: number): Promise<Post> {
    await this.#requireTrashed(id);
    const restored = await this.#repo.restore(id, this.#timestamp());
    if (!restored) throw notFound();
    return restored;
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
