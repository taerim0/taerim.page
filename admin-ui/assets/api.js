// @ts-check
/**
 * 관리자 화면 → 관리자 API 호출 모음. 모든 화면이 이 파일만 통해서 API를 부른다.
 * 빌드 없이 브라우저가 바로 읽는 JavaScript이고, 타입은 JSDoc 주석으로 서버의 타입을 그대로 가져다 쓴다.
 */

/** @typedef {import("../../src/posts/types.ts").Post} Post */
/** @typedef {import("../../src/posts/types.ts").PostSummary} PostSummary */
/** @typedef {import("../../src/posts/types.ts").PostDraft} PostDraft */
/** @typedef {import("../../src/posts/types.ts").PostStatus} PostStatus */
/** @typedef {import("../../src/posts/types.ts").TagCount} TagCount */
/** @typedef {import("../../src/posts/types.ts").TagNode} TagNode */
/** @typedef {import("../../src/posts/types.ts").Page<PostSummary>} PostPage */
/** @typedef {import("../../src/posts/validation.ts").PostPatch} PostPatch */
/** @typedef {import("../../src/posts/validation.ts").PostInput} PostInput */
/**
 * 입력 제한값 (GET /api/limits). 번역 칸 제한은 translation 아래에
 * @typedef {typeof import("../../src/posts/validation.ts").LIMITS & { translation: typeof import("../../src/translations/service.ts").TRANSLATION_LIMITS }} Limits
 */
/** @typedef {import("../../src/translations/types.ts").TranslationLang} TranslationLang */
/** @typedef {import("../../src/translations/types.ts").TranslationContent} TranslationContent */
/** @typedef {import("../../src/translations/service.ts").TranslationView} TranslationView */
/** @typedef {import("../../src/translations/service.ts").TranslationListItem} TranslationListItem */
/** @typedef {import("../../src/posts/service.ts").PostForEdit} PostForEdit */
/** @typedef {import("../../src/posts/service.ts").SaveResult} SaveResult */
/** @typedef {import("../../src/admin/http-errors.ts").ErrorBody} ErrorBody */
/** @typedef {import("../../src/posts/errors.ts").FieldIssue} FieldIssue */
/** @typedef {import("../../src/admin/deploy.ts").DeployRun} DeployRun */
/** @typedef {import("../../src/images/types.ts").ImageInfo} ImageInfo */

/**
 * 목록 조건
 * @typedef {object} ListQuery
 * @property {PostStatus} [status]
 * @property {boolean} [trash]
 * @property {string[]} [tags] 모두 가진 글만 (AND)
 * @property {number} [page]
 * @property {number} [pageSize]
 */

/** API가 실패를 알려 줬을 때. 화면은 code·issues를 보고 알맞게 보여준다. */
export class ApiError extends Error {
  /**
   * @param {number} status HTTP 상태
   * @param {ErrorBody["error"]["code"] | "network"} code 오류 종류 ("network"는 서버에 닿지도 못한 경우)
   * @param {string} message 사용자에게 보여줄 문구
   * @param {readonly FieldIssue[]} [issues] 입력 오류일 때 칸별 문제
   */
  constructor(status, code, message, issues = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

/**
 * API 한 번 부르기. 성공하면 결과 JSON(204면 null), 실패하면 ApiError를 던진다.
 * 같은 주소(admin.taerim.page)라서 로그인 정보·Origin은 브라우저가 알아서 붙인다.
 * @param {"GET" | "POST" | "PUT" | "PATCH" | "DELETE"} method
 * @param {string} path "/posts" 처럼 /api 뒤 경로
 * @param {unknown} [body] 보낼 JSON
 * @returns {Promise<any>}
 */
async function request(method, path, body) {
  return send(`/api${path}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * 요청을 보내고 응답을 읽는다 (request와 이미지 올리기가 같이 쓴다)
 * @param {string} url
 * @param {RequestInit} init
 * @returns {Promise<any>}
 */
async function send(url, init) {
  /** @type {Response} */
  let response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiError(0, "network", "서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요");
  }

  if (response.status === 204) return null;
  const text = await response.text();
  /** @type {any} */
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // JSON이 아니면 아래에서 일반 오류로 처리
  }

  if (!response.ok) {
    const error = /** @type {ErrorBody | null} */ (data)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "internal",
      error?.message ?? `요청을 처리하지 못했어요 (${response.status})`,
      error?.issues ?? [],
    );
  }
  return data;
}

/**
 * 목록 조건 → 주소 뒤 ?… (태그는 여러 번: ?tag=a&tag=b)
 * @param {ListQuery} query
 */
function toSearch(query) {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.trash) params.set("trash", "true");
  for (const tag of query.tags ?? []) params.append("tag", tag);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const search = params.toString();
  return search ? `?${search}` : "";
}

/** 글 */
export const postsApi = {
  /** @param {ListQuery} [query] @returns {Promise<PostPage>} */
  list: (query = {}) => request("GET", `/posts${toSearch(query)}`),
  /** @param {number} id @returns {Promise<PostForEdit>} */
  get: (id) => request("GET", `/posts/${id}`),
  /** @param {Partial<PostInput>} input @returns {Promise<Post>} */
  create: (input) => request("POST", "/posts", input),
  /** 보낸 칸만 바뀐다 @param {number} id @param {PostPatch} patch @returns {Promise<SaveResult>} */
  save: (id, patch) => request("PATCH", `/posts/${id}`, patch),
  /** @param {number} id @returns {Promise<Post>} */
  publish: (id) => request("POST", `/posts/${id}/publish`),
  /** @param {number} id @returns {Promise<Post>} */
  unpublish: (id) => request("POST", `/posts/${id}/unpublish`),
  /** @param {number} id @returns {Promise<Post>} */
  applyEdits: (id) => request("POST", `/posts/${id}/edits/apply`),
  /** @param {number} id @returns {Promise<null>} */
  discardEdits: (id) => request("DELETE", `/posts/${id}/edits`),
  /** 휴지통으로 (되돌릴 수 있음) @param {number} id @returns {Promise<null>} */
  trash: (id) => request("DELETE", `/posts/${id}`),
};

/** 휴지통 */
export const trashApi = {
  /** @param {Omit<ListQuery, "trash">} [query] @returns {Promise<PostPage>} */
  list: (query = {}) => request("GET", `/posts${toSearch({ ...query, trash: true })}`),
  /** @param {number} id @returns {Promise<null>} */
  restore: (id) => request("POST", `/trash/${id}/restore`),
  /** 영구 삭제 @param {number} id @returns {Promise<null>} */
  purge: (id) => request("DELETE", `/trash/${id}`),
  /** 영구 삭제 @returns {Promise<{ removed: number }>} */
  empty: () => request("DELETE", "/trash"),
};

/** 모든 태그와 부모·글 수 (트리 순, 안 쓰이는 태그 포함) @returns {Promise<TagNode[]>} */
export const listTags = () => request("GET", "/tags");

/**
 * 태그의 부모 정하기 (블로그 전체에 적용, 설계 14). 순환이면 ApiError(conflict)
 * @param {string} name @param {string | null} parent
 * @returns {Promise<TagNode[]>} 바뀐 뒤 전체 태그
 */
export const setTagParent = (name, parent) => request("PUT", `/tags/${encodeURIComponent(name)}/parent`, { parent });

/** @returns {Promise<Limits>} */
export const getLimits = () => request("GET", "/limits");

/** 이미지 */
export const imagesApi = {
  /**
   * 올리기. 본문 = 파일 그대로, 원래 파일 이름은 X-File-Name(주소 인코딩).
   * 같은 이미지가 이미 있으면 그 정보를 돌려준다
   * @param {Blob} file WebP(변환한 것) 또는 GIF
   * @param {string} fileName 원래 파일 이름
   * @returns {Promise<{ image: ImageInfo }>}
   */
  upload: (file, fileName) =>
    send("/api/images", {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(fileName) },
      body: file,
    }),
};

/** 번역 (설계 12-9). 쓰는 동작은 모두 번역 화면 정보(TranslationView)를 돌려준다 */
export const translationsApi = {
  /** 번역이 있는 글들의 상태 (목록 표시용) @param {TranslationLang} lang @returns {Promise<TranslationListItem[]>} */
  list: (lang) => request("GET", `/translations/${lang}`),
  /** @param {number} id @param {TranslationLang} lang @returns {Promise<TranslationView>} */
  get: (id, lang) => request("GET", `/posts/${id}/translations/${lang}`),
  /** LLM 번역 → 초안 (오래 걸릴 수 있음) @param {number} id @param {TranslationLang} lang @returns {Promise<TranslationView>} */
  generate: (id, lang) => request("POST", `/posts/${id}/translations/${lang}/generate`),
  /** @param {number} id @param {TranslationLang} lang @param {TranslationContent} content @returns {Promise<TranslationView>} */
  saveDraft: (id, lang, content) => request("PATCH", `/posts/${id}/translations/${lang}/draft`, content),
  /** @param {number} id @param {TranslationLang} lang @returns {Promise<null>} */
  deleteDraft: (id, lang) => request("DELETE", `/posts/${id}/translations/${lang}/draft`),
  /** @param {number} id @param {TranslationLang} lang @returns {Promise<TranslationView>} */
  publish: (id, lang) => request("POST", `/posts/${id}/translations/${lang}/publish`),
  /** @param {number} id @param {TranslationLang} lang @returns {Promise<TranslationView>} */
  unpublish: (id, lang) => request("POST", `/posts/${id}/translations/${lang}/unpublish`),
};

/** @typedef {import("../../src/settings/settings.ts").SiteSettings} SiteSettings */

/** 사이트 설정 (설계 15-3) */
export const settingsApi = {
  /** 저장한 적 없으면 기본값, updatedAt null @returns {Promise<{ settings: SiteSettings, updatedAt: string | null }>} */
  get: () => request("GET", "/settings"),
  /** 통째로 저장. 칸별 오류는 ApiError(validation) @param {SiteSettings} settings @returns {Promise<{ settings: SiteSettings, updatedAt: string }>} */
  save: (settings) => request("PUT", "/settings", settings),
};

/** @typedef {import("../../src/issues/issues.ts").Issue} Issue */
/** @typedef {import("../../src/issues/issues.ts").IssueInput} IssueInput */

/** 이슈 (설계 15-5): 아카이브·홈에 보이는 짧은 기록 */
export const issuesApi = {
  /** 최신 순 @returns {Promise<Issue[]>} */
  list: () => request("GET", "/issues"),
  /** @param {IssueInput} input @returns {Promise<Issue>} */
  create: (input) => request("POST", "/issues", input),
  /** @param {number} id @param {IssueInput} input @returns {Promise<Issue>} */
  update: (id, input) => request("PUT", `/issues/${id}`, input),
  /** @param {number} id @returns {Promise<void>} */
  remove: (id) => request("DELETE", `/issues/${id}`),
};

/** 임베드 카드 정보 (설계 13-9). 임베드 대상이 아니면 ApiError(not_found) */
export const embedsApi = {
  /** @param {string} url @returns {Promise<import("../../src/embeds/types.ts").EmbedInfo>} */
  get: (url) => request("GET", `/embeds?url=${encodeURIComponent(url)}`),
};

/** 공개 사이트 배포 (GitHub Actions) */
export const deployApi = {
  /** 배포 요청. 설정이 없으면 ApiError(code "unavailable") @returns {Promise<{ requested: true }>} */
  request: () => request("POST", "/deploy"),
  /** 가장 최근 배포 상태 @returns {Promise<{ run: DeployRun | null }>} */
  status: () => request("GET", "/deploy"),
};
