/** 글 상태. draft = 초안, published = 공개 대상(다음 배포에 포함) */
export type PostStatus = "draft" | "published";

/**
 * 글 한 편.
 * 시각은 모두 ISO 8601 UTC 문자열이다. (예: "2026-11-07T10:00:00.000Z")
 */
/** 글 종류 (설계 17): 글 = 다른 사람이 읽는 글, 노트 = 공부 정리 */
export const POST_KINDS = ["post", "note"] as const;
export type PostKind = (typeof POST_KINDS)[number];

/** 종류가 없으면(예전 데이터·테스트) 글 */
export function kindOf(post: { kind?: PostKind }): PostKind {
  return post.kind ?? "post";
}

export interface Post {
  /** 순번 id. 글 주소(/posts/{id})로도 쓴다. 한 번 정해지면 바뀌지 않는다. */
  id: number;
  title: string;
  /** 본문 Markdown 원본 */
  body: string;
  /** 소개글 */
  summary: string | null;
  /** 대표 이미지 주소 */
  thumbnail: string | null;
  status: PostStatus;
  /** 태그 이름 목록 */
  tags: string[];
  createdAt: string;
  updatedAt: string;
  /** 처음 공개한 시각. 공개한 적이 없으면 null */
  publishedAt: string | null;
  /** 휴지통에 넣은 시각. 정상 글이면 null */
  deletedAt: string | null;
  /** 종류 (설계 17). 저장소는 항상 채움, 없으면 글로 봄 (kindOf) */
  kind?: PostKind;
}

/**
 * 목록용 요약. 목록에서는 본문이 필요 없어서 빼고,
 * 공개 글에 수정 중인 작업본이 있는지(hasDraft)를 더한다. ("수정 중" 표시용)
 */
export type PostSummary = Omit<Post, "body"> & { hasDraft: boolean };

/** 공개된 글의 작업본(수정 중인 버전). 글 하나당 최대 1개. */
export interface PostDraft {
  postId: number;
  title: string;
  body: string;
  summary: string | null;
  thumbnail: string | null;
  tags: string[];
  updatedAt: string;
}

/** 새 글을 저장할 때 넣는 값. id·휴지통 시각은 저장소가 정한다. */
export type NewPostData = Omit<Post, "id" | "deletedAt">;

/** 글을 고칠 때 바꿀 값만 넣는다. */
export type PostChanges = Partial<
  Pick<Post, "title" | "body" | "summary" | "thumbnail" | "status" | "tags" | "updatedAt" | "publishedAt" | "kind">
>;

/** 한 페이지에 보여줄 글 개수 기본값 */
export const DEFAULT_PAGE_SIZE = 10;

/** 목록 조건 */
export interface PostListFilter {
  /** 이 상태의 글만. 생략하면 전부 */
  status?: PostStatus;
  /** 이 종류만 (설계 17). 생략하면 둘 다 */
  kind?: PostKind;
  /** true면 휴지통 글만, false·생략이면 정상 글만 */
  trash?: boolean;
  /** 이 태그들이 **모두** 붙은 글만 (AND). 비어 있거나 생략하면 거르지 않음 */
  tags?: string[];
  /**
   * 묶음마다 "그중 하나라도" 붙은 글, 묶음끼리는 AND (설계 14: 상위 태그로 거르면 하위 태그 글도).
   * 있으면 tags 대신 쓴다. 예) [["개발", "react"], ["블로그"]] = (개발 또는 react) 그리고 블로그
   */
  tagGroups?: string[][];
  /** true면 반영 안 한 수정본이 있는 글만 (설계 16-11) */
  edited?: boolean;
  /** 제목에 이 글자가 들어간 글만 (대소문자 무시, 설계 16-11) */
  q?: string;
  /** 몇 번째 페이지인지. 1부터 시작. 생략하면 1 */
  page?: number;
  /** 한 페이지 글 개수. 생략하면 DEFAULT_PAGE_SIZE(10) */
  pageSize?: number;
}

/** 관리자 글 목록 위 상태별 개수 (휴지통 제외, 설계 16-11) */
export interface PostCounts {
  all: number;
  draft: number;
  published: number;
  /** 반영 안 한 수정본이 있는 글 */
  edited: number;
  /** 종류별 (설계 17, 휴지통 제외) */
  posts: number;
  notes: number;
}

/** 페이지로 끊은 목록 결과 */
export interface Page<T> {
  items: T[];
  /** 지금 페이지 번호 (1부터) */
  page: number;
  pageSize: number;
  /** 조건에 맞는 전체 글 수 */
  total: number;
  /** 전체 페이지 수. 글이 없으면 0 */
  totalPages: number;
}

/** 태그와 그 태그가 붙은 글 개수 */
export interface TagCount {
  name: string;
  count: number;
}

/** 태그의 부모 (설계 14). 부모가 없으면 null (맨 위 태그) */
export interface TagParent {
  name: string;
  parent: string | null;
}

/**
 * 관리자 화면용 태그 하나 (설계 14): 부모와 글 수
 * - count: 이 태그가 직접 붙은 글 수
 * - total: 이 태그나 하위 태그가 붙은 글 수 (중복 없이) = 상위 태그로 거를 때 나오는 글 수
 */
export interface TagNode extends TagParent {
  count: number;
  total: number;
}

/** 태그가 붙은 글 하나 (휴지통 글 제외). 하위 태그까지 합친 글 수를 셀 때 쓴다 */
export interface TagUsage {
  name: string;
  postId: number;
}
