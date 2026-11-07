/** 글 상태. draft = 초안, published = 공개 대상(다음 배포에 포함) */
export type PostStatus = "draft" | "published";

/**
 * 글 한 편.
 * 시각은 모두 ISO 8601 UTC 문자열이다. (예: "2026-11-07T10:00:00.000Z")
 */
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
}

/** 목록용 요약. 목록에서는 본문이 필요 없어서 뺀다. */
export type PostSummary = Omit<Post, "body">;

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
  Pick<Post, "title" | "body" | "summary" | "thumbnail" | "status" | "tags" | "updatedAt" | "publishedAt">
>;

/** 한 페이지에 보여줄 글 개수 기본값 */
export const DEFAULT_PAGE_SIZE = 10;

/** 목록 조건 */
export interface PostListFilter {
  /** 이 상태의 글만. 생략하면 전부 */
  status?: PostStatus;
  /** true면 휴지통 글만, false·생략이면 정상 글만 */
  trash?: boolean;
  /** 이 태그가 붙은 글만 */
  tag?: string;
  /** 몇 번째 페이지인지. 1부터 시작. 생략하면 1 */
  page?: number;
  /** 한 페이지 글 개수. 생략하면 DEFAULT_PAGE_SIZE(10) */
  pageSize?: number;
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
