import { DEFAULT_PAGE_SIZE } from "./types.ts";
import type {
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

/** get() 옵션 */
export interface GetOptions {
  /** true면 휴지통에 있는 글도 돌려준다. 기본 false */
  includeTrashed?: boolean;
}

/** 한 페이지에 꺼낼 수 있는 최대 글 수. 너무 큰 값을 막는다. */
export const MAX_PAGE_SIZE = 100;

/** 페이지 번호 보정: 1보다 작거나 정수가 아니면 1 (모든 저장소 구현이 같은 규칙을 쓴다) */
export function normalizePage(page: number | undefined): number {
  return page !== undefined && Number.isInteger(page) && page >= 1 ? page : 1;
}

/** 페이지 크기 보정: 생략·숫자가 아니면 기본값(10), 그 밖에는 1 ~ MAX_PAGE_SIZE 범위로 */
export function normalizePageSize(pageSize: number | undefined): number {
  if (pageSize === undefined || !Number.isFinite(pageSize)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSize)));
}

/**
 * 글 저장소. 저장하고 꺼내는 것만 한다.
 *
 * - 규칙 판단(검증, 상태 전환, 공개 글이면 작업본에 저장 등)은 서비스가 한다.
 * - 시각은 호출하는 쪽이 넣어 준다. 저장소는 시계를 갖지 않는다.
 * - 태그는 이미 정리된(앞뒤 공백 없음, 중복 없음) 이름 목록이라고 가정한다.
 * - 태그는 넣은 순서와 상관없이 **항상 이름순**으로 돌려준다 (compareTagNames 순서 = D1 기본 정렬).
 * - 휴지통에 있는 글은 고칠 수 없다. 먼저 restore() 해야 한다.
 *
 * 목록 정렬 (최신이 앞, 시각이 같으면 id가 큰 글이 앞):
 * - 휴지통 목록: 휴지통에 넣은 시각(deletedAt)
 * - status: "published": 공개한 시각(publishedAt)
 * - 그 밖: 마지막으로 고친 시각(updatedAt)
 *
 * 페이지:
 * - page는 1부터. 1보다 작거나 정수가 아니면 1로 본다.
 * - pageSize는 1~MAX_PAGE_SIZE 범위로 맞춘다. 생략하면 10.
 * - 마지막 페이지를 넘으면 items가 빈 목록이다.
 */
export interface PostRepository {
  /** 새 글을 저장하고 순번 id를 붙여 돌려준다. 삭제된 번호는 다시 쓰지 않는다. */
  create(data: NewPostData): Promise<Post>;

  /** 글 하나. 없으면(또는 휴지통에 있고 includeTrashed가 아니면) null */
  get(id: number, options?: GetOptions): Promise<Post | null>;

  /** 조건에 맞는 글 요약 목록을 페이지로 끊어서 돌려준다. */
  list(filter?: PostListFilter): Promise<Page<PostSummary>>;

  /** 글을 고친다. 넣은 값만 바뀐다. 없거나 휴지통에 있으면 null */
  update(id: number, changes: PostChanges): Promise<Post | null>;

  /** 휴지통에 넣는다. 옮겼으면 true, 없거나 이미 휴지통이면 false */
  moveToTrash(id: number, at: string): Promise<boolean>;

  /**
   * 휴지통에서 **초안으로** 되살린다. (공개였던 글이 다음 배포에 다시 나가지 않게)
   * - 작업본이 있으면 그 내용(제목·본문·소개·대표 이미지·태그)을 글에 덮어쓰고 작업본을 지운다 (가장 최근 내용을 남김)
   * - 상태는 초안, updatedAt은 at. 공개 시각(publishedAt)은 그대로 둔다 (다시 공개하면 처음 시각 유지)
   * - 한 번에 처리한다: 중간에 실패하면 글과 작업본 모두 그대로 남는다.
   * @returns 되살린 글. 없거나 휴지통에 없으면 null
   */
  restore(id: number, at: string): Promise<Post | null>;

  /**
   * 완전히 지운다(휴지통 비우기). 작업본과 태그 연결도 함께 지운다.
   * 휴지통에 있는 글만 지울 수 있다. 지웠으면 true, 아니면 false
   */
  purge(id: number): Promise<boolean>;

  /** 작업본. 없으면 null */
  getDraft(postId: number): Promise<PostDraft | null>;

  /** 작업본을 저장한다(있으면 덮어쓴다). 글이 없거나 휴지통에 있으면 false */
  saveDraft(draft: PostDraft): Promise<boolean>;

  /** 작업본을 버린다. 버렸으면 true, 없었으면 false */
  deleteDraft(postId: number): Promise<boolean>;

  /**
   * 작업본 내용(제목·본문·소개·대표 이미지·태그)을 글에 덮어쓰고 작업본을 지운다.
   * 한 번에 처리한다: 중간에 실패하면 글과 작업본 모두 그대로 남는다.
   * @param at 글의 updatedAt으로 기록할 시각
   * @returns 바뀐 글. 작업본이 없거나 글이 휴지통에 있으면 null
   */
  applyDraft(postId: number, at: string): Promise<Post | null>;

  /**
   * 공개 사이트 빌드용: 공개 글 **전부를 본문까지** 한 번에. 휴지통 글은 빼고, 작업본이 아닌 공개본 내용.
   * 순서는 공개 목록과 같다 (공개한 시각 최신 순, 같으면 id가 큰 글이 앞)
   */
  listPublished(): Promise<Post[]>;

  /** 태그별 글 개수. 휴지통 글은 세지 않고, 개수가 0인 태그는 빼고, 이름순 */
  listTags(): Promise<TagCount[]>;

  /** 모든 태그(안 쓰이는 것 포함)와 그 부모, 이름순 (설계 14) */
  listTagParents(): Promise<TagParent[]>;

  /**
   * 태그의 부모를 정한다. null이면 맨 위로. 두 태그 모두 없으면 새로 만든다.
   * 순환 검사는 부르는 쪽(서비스)이 한다
   */
  setTagParent(name: string, parent: string | null): Promise<void>;

  /** 태그-글 연결 전부 (휴지통 글 제외). 하위 태그까지 합친 글 수 계산용 */
  listTagUsage(): Promise<TagUsage[]>;
}
