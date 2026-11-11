import { normalizePage, normalizePageSize } from "./repository.ts";
import { compareTagNames, sortTagNames } from "./tag-order.ts";
import type { GetOptions, PostRepository } from "./repository.ts";
import type {
  PostCounts,
  NewPostData,
  Page,
  Post,
  PostChanges,
  PostDraft,
  PostListFilter,
  PostSummary,
  TagCount,
  TagParent,
  TagUsage,
} from "./types.ts";

/**
 * 메모리 저장소. 프로그램이 끝나면 내용이 사라진다.
 * 테스트와 개발용이며, 실제 블로그는 D1 저장소를 쓴다.
 *
 * 저장할 때와 돌려줄 때 모두 복사본을 쓴다.
 * → 밖에서 돌려받은 객체를 고쳐도 저장된 값은 바뀌지 않는다.
 */
export class MemoryPostRepository implements PostRepository {
  readonly #posts = new Map<number, Post>();
  readonly #drafts = new Map<number, PostDraft>();
  /** 태그 이름 → 부모 이름 (설계 14). 부모를 정한 적 없는 태그는 없음(= 맨 위) */
  readonly #tagParents = new Map<string, string | null>();
  /** 다음에 붙일 id. 줄어들지 않으므로 지운 번호를 다시 쓰지 않는다. */
  #nextId = 1;

  async create(data: NewPostData): Promise<Post> {
    const post: Post = {
      ...structuredClone(data),
      tags: sortTagNames(data.tags), // 태그는 항상 이름순 (D1과 같게)
      id: this.#nextId++,
      deletedAt: null,
    };
    this.#posts.set(post.id, post);
    return structuredClone(post);
  }

  async get(id: number, options: GetOptions = {}): Promise<Post | null> {
    const post = this.#posts.get(id);
    if (!post) return null;
    if (post.deletedAt !== null && !options.includeTrashed) return null;
    return structuredClone(post);
  }

  async list(filter: PostListFilter = {}): Promise<Page<PostSummary>> {
    const page = normalizePage(filter.page);
    const pageSize = normalizePageSize(filter.pageSize);

    const matched = [...this.#posts.values()].filter((post) => {
      const inTrash = post.deletedAt !== null;
      if (inTrash !== (filter.trash === true)) return false;
      if (filter.status !== undefined && post.status !== filter.status) return false;
      // 묶음마다 하나라도 가진 글만, 묶음끼리는 AND (tags는 한 태그씩 묶음)
      const groups = filter.tagGroups ?? (filter.tags ?? []).map((tag) => [tag]);
      if (!groups.every((group) => group.length === 0 || group.some((tag) => post.tags.includes(tag)))) return false;
      if (filter.edited && !this.#drafts.has(post.id)) return false;
      if (filter.q && !post.title.toLowerCase().includes(filter.q.toLowerCase())) return false;
      return true;
    });

    const sortKey = sortKeyFor(filter);
    matched.sort((a, b) => compareDesc(sortKey(a), sortKey(b)) || b.id - a.id);

    const start = (page - 1) * pageSize;
    const items = matched
      .slice(start, start + pageSize)
      .map((post) => toSummary(post, this.#drafts.has(post.id)));

    return {
      items,
      page,
      pageSize,
      total: matched.length,
      totalPages: Math.ceil(matched.length / pageSize),
    };
  }

  async update(id: number, changes: PostChanges): Promise<Post | null> {
    const post = this.#activePost(id);
    if (!post) return null;
    // 값이 undefined인 항목은 "안 바꿈"으로 본다
    for (const [key, value] of Object.entries(changes)) {
      if (value !== undefined) {
        const stored = key === "tags" ? sortTagNames(value as string[]) : structuredClone(value);
        (post as unknown as Record<string, unknown>)[key] = stored;
      }
    }
    return structuredClone(post);
  }

  async moveToTrash(id: number, at: string): Promise<boolean> {
    const post = this.#activePost(id);
    if (!post) return false;
    post.deletedAt = at;
    return true;
  }

  async restore(id: number, at: string): Promise<Post | null> {
    const post = this.#posts.get(id);
    if (!post || post.deletedAt === null) return null;

    // 메모리에서는 중간에 실패할 일이 없어서 그대로 "한 번에" 처리된다.
    const draft = this.#drafts.get(id);
    if (draft) {
      post.title = draft.title;
      post.body = draft.body;
      post.summary = draft.summary;
      post.thumbnail = draft.thumbnail;
      post.tags = structuredClone(draft.tags);
      this.#drafts.delete(id);
    }
    post.status = "draft";
    post.updatedAt = at;
    post.deletedAt = null;
    return structuredClone(post);
  }

  async purge(id: number): Promise<boolean> {
    const post = this.#posts.get(id);
    if (!post || post.deletedAt === null) return false;
    this.#posts.delete(id);
    this.#drafts.delete(id);
    return true;
  }

  async getDraft(postId: number): Promise<PostDraft | null> {
    const draft = this.#drafts.get(postId);
    return draft ? structuredClone(draft) : null;
  }

  async saveDraft(draft: PostDraft): Promise<boolean> {
    if (!this.#activePost(draft.postId)) return false;
    this.#drafts.set(draft.postId, { ...structuredClone(draft), tags: sortTagNames(draft.tags) });
    return true;
  }

  async deleteDraft(postId: number): Promise<boolean> {
    return this.#drafts.delete(postId);
  }

  async applyDraft(postId: number, at: string): Promise<Post | null> {
    const post = this.#activePost(postId);
    const draft = this.#drafts.get(postId);
    if (!post || !draft) return null;

    // 메모리에서는 아래 두 동작 사이에 실패할 일이 없어서 그대로 "한 번에" 처리된다.
    post.title = draft.title;
    post.body = draft.body;
    post.summary = draft.summary;
    post.thumbnail = draft.thumbnail;
    post.tags = structuredClone(draft.tags);
    post.updatedAt = at;
    this.#drafts.delete(postId);

    return structuredClone(post);
  }

  async counts(): Promise<PostCounts> {
    const live = [...this.#posts.values()].filter((post) => post.deletedAt === null);
    return {
      all: live.length,
      draft: live.filter((post) => post.status === "draft").length,
      published: live.filter((post) => post.status === "published").length,
      edited: live.filter((post) => this.#drafts.has(post.id)).length,
    };
  }

  async listPublished(): Promise<Post[]> {
    return [...this.#posts.values()]
      .filter((post) => post.deletedAt === null && post.status === "published")
      .sort((a, b) => compareDesc(a.publishedAt ?? "", b.publishedAt ?? "") || b.id - a.id)
      .map((post) => structuredClone(post));
  }

  async listTagParents(): Promise<TagParent[]> {
    const names = new Set(this.#tagParents.keys());
    for (const post of this.#posts.values()) for (const tag of post.tags) names.add(tag);
    for (const draft of this.#drafts.values()) for (const tag of draft.tags) names.add(tag);
    return sortTagNames([...names]).map((name) => ({ name, parent: this.#tagParents.get(name) ?? null }));
  }

  async setTagParent(name: string, parent: string | null): Promise<void> {
    if (parent !== null && !this.#tagParents.has(parent)) this.#tagParents.set(parent, null);
    this.#tagParents.set(name, parent);
  }

  async listTagUsage(): Promise<TagUsage[]> {
    const usage: TagUsage[] = [];
    for (const post of this.#posts.values()) {
      if (post.deletedAt !== null) continue;
      for (const tag of post.tags) usage.push({ name: tag, postId: post.id });
    }
    return usage;
  }

  async listTags(): Promise<TagCount[]> {
    const counts = new Map<string, number>();
    for (const post of this.#posts.values()) {
      if (post.deletedAt !== null) continue;
      for (const tag of post.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => compareTagNames(a.name, b.name));
  }

  /** 휴지통에 없는 글(저장된 원본). 밖으로 내보낼 때는 반드시 복사한다. */
  #activePost(id: number): Post | undefined {
    const post = this.#posts.get(id);
    return post && post.deletedAt === null ? post : undefined;
  }
}

/** 목록 종류에 따라 어떤 시각으로 정렬할지 정한다 */
function sortKeyFor(filter: PostListFilter): (post: Post) => string {
  if (filter.trash) return (post) => post.deletedAt ?? "";
  if (filter.status === "published") return (post) => post.publishedAt ?? "";
  return (post) => post.updatedAt;
}

/** 큰 값(최신 시각)이 앞으로 오는 비교. ISO 시각 문자열은 글자 순서 = 시간 순서 */
function compareDesc(a: string, b: string): number {
  return a < b ? 1 : a > b ? -1 : 0;
}

function toSummary(post: Post, hasDraft: boolean): PostSummary {
  const { body: _body, ...summary } = structuredClone(post);
  return { ...summary, hasDraft };
}
