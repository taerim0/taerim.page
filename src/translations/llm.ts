/**
 * LLM 제공자 연결 (설계 12-8).
 * 제공자마다 다른 부분은 "요청 보내고 글자 받기" 하나뿐이다. 프롬프트·코드 보호·결과 검사는 공통(translate.ts).
 */

/** 응답이 끝난 이유. length = 출력 한도에 걸려 잘림 */
export type LlmFinish = "stop" | "length" | "other";

export interface LlmRequest {
  system: string;
  user: string;
}

export interface LlmResponse {
  text: string;
  finish: LlmFinish;
}

/** 제공자 어댑터. 실패는 TranslationError로 던진다 (rate_limited / provider_error) */
export interface LlmClient {
  /** 기록용 모델 이름 (예: "fake", "gemini-…") */
  readonly model: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

/** 번역 실패 이유 (관리자 API가 HTTP 상태로 바꾼다) */
export type TranslationErrorKind =
  /** 제공자·키 설정이 없음 → 503 */
  | "not_configured"
  /** 제공자가 요청 한도 초과(429)라고 함 → 429 */
  | "rate_limited"
  /** 출력이 잘림 → 422 */
  | "too_long"
  /** 결과를 읽을 수 없거나 검사에 걸림 → 502 */
  | "invalid_output"
  /** 그 밖 제공자 오류·거절 → 502 */
  | "provider_error";

/** 번역 실패. 메시지는 화면에 그대로 보여 줄 수 있게 쓴다 (API 키 등 비밀값은 절대 담지 않는다) */
export class TranslationError extends Error {
  readonly kind: TranslationErrorKind;

  constructor(kind: TranslationErrorKind, message: string) {
    super(message);
    this.name = "TranslationError";
    this.kind = kind;
  }
}
