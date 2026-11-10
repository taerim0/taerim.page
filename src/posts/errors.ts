/**
 * 글 기능에서 일어나는 오류.
 * API는 오류 종류를 보고 HTTP 상태 코드를 정한다. (입력 오류 400, 없음 404, 상태 충돌 409)
 *
 * 참고: Node.js가 .ts 파일을 직접 실행할 때는 타입만 지우고 돌리므로,
 * 생성자 매개변수 속성(constructor(readonly x))처럼 "지우기만으로는 안 되는" 문법은 쓰지 않는다.
 */

/** 글 기능 오류의 공통 부모. API에서 "우리가 예상한 오류"인지 구분할 때 쓴다. */
export class PostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** 입력 칸 이름 */
export type PostField = "title" | "body" | "summary" | "thumbnail" | "tags";

/** 사이트 설정 칸 이름 (설계 15-3) */
export type SettingsField =
  | "name"
  | "photo"
  | "tagline"
  | "taglineEn"
  | "description"
  | "descriptionEn"
  | "github"
  | "email"
  | "linkedin"
  | "solvedac";

/** 칸 하나의 문제 (글 칸 또는 설정 칸) */
export interface FieldIssue {
  field: PostField | SettingsField;
  message: string;
}

/**
 * 입력이 규칙에 맞지 않음 (400). 칸별 문제를 모두 모아서 담는다.
 * 특정 칸의 문제가 아닐 때(예: 바꿀 내용이 없음)는 issues를 비우고 message만 넣는다.
 */
export class ValidationError extends PostError {
  readonly issues: readonly FieldIssue[];

  constructor(issues: readonly FieldIssue[], message?: string) {
    super(message ?? issues.map((issue) => issue.message).join(" / "));
    this.issues = issues;
  }
}

/** 글이나 작업본이 없음 (404) */
export class NotFoundError extends PostError {}

/** 지금 상태에서는 할 수 없음 (409). 예: 이미 공개된 글을 다시 공개 */
export class ConflictError extends PostError {}
