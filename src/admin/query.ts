import { MAX_PAGE_SIZE } from "../posts/repository.ts";
import type { PostListFilter, PostStatus } from "../posts/types.ts";
import { LIMITS, normalizeTag, normalizeTags } from "../posts/validation.ts";
import { HttpError } from "./http-errors.ts";

const STATUSES: readonly PostStatus[] = ["draft", "published"];

/**
 * 글 목록 주소의 조건 값을 읽는다.
 * 예) /api/posts?status=published&tag=React&tag=블로그&page=2
 *     → { status: "published", tags: ["react", "블로그"], page: 2 }
 *
 * - 잘못된 값은 조용히 고치지 않고 400(bad_request)으로 알려 준다. (저장소의 보정은 마지막 안전장치)
 * - 값이 비어 있으면(?tag=) 안 넣은 것으로 본다.
 * - 모르는 이름은 무시한다. tag 말고는 같은 이름이 여러 번 오면 첫 번째 값을 쓴다.
 * - tag는 여러 번 쓸 수 있고, 모두 가진 글만 찾는다 (AND, 최대 10개).
 */
export function parseListQuery(params: URLSearchParams): PostListFilter {
  const filter: PostListFilter = {};

  const status = value(params, "status");
  if (status !== undefined) {
    if (!STATUSES.includes(status as PostStatus)) {
      throw badRequest("status는 draft 또는 published만 쓸 수 있어요");
    }
    filter.status = status as PostStatus;
  }

  const trash = value(params, "trash");
  if (trash !== undefined) {
    if (trash !== "true" && trash !== "false") throw badRequest("trash는 true 또는 false만 쓸 수 있어요");
    filter.trash = trash === "true";
  }

  // 태그는 여러 개 가능: ?tag=a&tag=b → a와 b를 모두 가진 글 (AND)
  const rawTags = params.getAll("tag").filter((tag) => tag !== "");
  if (rawTags.length > 0) {
    // 저장된 태그와 같은 규칙으로 정리해서 찾는다 (?tag=React → react)
    if (rawTags.some((tag) => normalizeTag(tag) === "")) throw badRequest("tag가 비어 있어요");
    const tags = normalizeTags(rawTags);
    if (tags.length > LIMITS.tagCount) throw badRequest(`tag는 한 번에 ${LIMITS.tagCount}개까지 쓸 수 있어요`);
    filter.tags = tags;
  }

  // 설계 16-11: 수정본 있는 글만, 제목 찾기
  const edited = value(params, "edited");
  if (edited !== undefined) {
    if (edited !== "true" && edited !== "false") throw badRequest("edited는 true 또는 false만 쓸 수 있어요");
    filter.edited = edited === "true";
  }
  const q = value(params, "q")?.trim();
  if (q) {
    if (q.length > MAX_QUERY_LENGTH) throw badRequest(`q는 ${MAX_QUERY_LENGTH}자까지예요`);
    filter.q = q;
  }

  const page = value(params, "page");
  if (page !== undefined) filter.page = positiveInt(page, "page", Number.MAX_SAFE_INTEGER);

  const pageSize = value(params, "pageSize");
  if (pageSize !== undefined) filter.pageSize = positiveInt(pageSize, "pageSize", MAX_PAGE_SIZE);

  return filter;
}

/** 제목 찾기 글자 최대 길이 */
export const MAX_QUERY_LENGTH = 100;

/** 값 하나. 없거나 빈 문자열이면 undefined */
function value(params: URLSearchParams, name: string): string | undefined {
  const raw = params.get(name);
  return raw === null || raw === "" ? undefined : raw;
}

/** "1", "25" 같은 1 이상 정수만. "01", "1.5", "-1", "abc", 최대값 초과는 400 */
function positiveInt(raw: string, name: string, max: number): number {
  if (!/^[1-9]\d*$/.test(raw)) throw badRequest(`${name}는 1 이상의 정수여야 해요`);
  const number = Number(raw);
  if (number > max) throw badRequest(`${name}는 ${max} 이하여야 해요`);
  return number;
}

function badRequest(message: string): HttpError {
  return new HttpError("bad_request", message);
}
