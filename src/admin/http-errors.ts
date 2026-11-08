import { ConflictError, NotFoundError, PostError, ValidationError } from "../posts/errors.ts";
import type { FieldIssue } from "../posts/errors.ts";

/** API 오류 종류. 응답의 error.code 값 */
export type ErrorCode =
  | "bad_request"
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "internal"
  | "bad_gateway"
  | "unavailable";

/** 실패 응답 본문. 모든 오류가 이 모양이다. */
export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    /** 입력 검증 실패일 때만: 칸별 문제 */
    issues?: readonly FieldIssue[];
  };
}

/** HTTP 상태 코드 (오류용) */
export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 500 | 502 | 503;

const STATUS_BY_CODE: Record<ErrorCode, ErrorStatus> = {
  bad_request: 400,
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  internal: 500,
  /** 바깥 서비스(GitHub 등)가 실패함 */
  bad_gateway: 502,
  /** 이 기능이 설정되지 않음 (예: 배포 설정 없음) */
  unavailable: 503,
};

/**
 * API 단계에서 생기는 오류 (요청 모양이 잘못됨, 인증 실패 등).
 * 글 기능 자체의 오류(PostError)와 구분한다.
 */
export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly status: ErrorStatus;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "HttpError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}

/** 예상 못 한 오류일 때 사용자에게 보여줄 문구. 자세한 내용은 감춘다. */
export const INTERNAL_MESSAGE = "서버에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요";

/**
 * 어떤 오류든 HTTP 상태와 응답 본문으로 바꾼다.
 * - HttpError: 그 오류의 상태·코드
 * - 글 기능 오류: 입력 오류 400 / 없음 404 / 상태 충돌 409
 * - 그 밖(버그 등): 500, 메시지는 감춘다 → expected가 false이면 호출하는 쪽에서 로그를 남긴다
 */
export function toErrorResponse(error: unknown): { status: ErrorStatus; body: ErrorBody; expected: boolean } {
  if (error instanceof HttpError) {
    return { status: error.status, body: errorBody(error.code, error.message), expected: true };
  }
  if (error instanceof ValidationError) {
    return { status: 400, body: errorBody("validation", error.message, error.issues), expected: true };
  }
  if (error instanceof NotFoundError) {
    return { status: 404, body: errorBody("not_found", error.message), expected: true };
  }
  if (error instanceof ConflictError) {
    return { status: 409, body: errorBody("conflict", error.message), expected: true };
  }
  if (error instanceof PostError) {
    // 새 종류의 글 오류가 생겼는데 여기 연결을 빠뜨린 경우: 일단 400으로, 로그는 남긴다
    return { status: 400, body: errorBody("bad_request", error.message), expected: false };
  }
  return { status: 500, body: errorBody("internal", INTERNAL_MESSAGE), expected: false };
}

function errorBody(code: ErrorCode, message: string, issues?: readonly FieldIssue[]): ErrorBody {
  return { error: issues ? { code, message, issues } : { code, message } };
}
