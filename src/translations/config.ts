import { FakeLlmClient } from "./fake-llm.ts";
import type { LlmClient } from "./llm.ts";

/**
 * 번역 설정값 (설계 12-8). Worker의 env에서 읽는다.
 * - TRANSLATE_PROVIDER: 제공자 이름 (vars, 비밀 아님). 지금은 "fake"만. 실제 제공자는 정할 때 여기에 추가
 * - TRANSLATE_MODEL: 모델 이름 (vars)
 * - TRANSLATE_API_KEY: API 키 (비밀값, 사용자가 wrangler secret put으로 직접 등록)
 */
export interface TranslateConfig {
  TRANSLATE_PROVIDER?: string;
  TRANSLATE_MODEL?: string;
  TRANSLATE_API_KEY?: string;
}

/** 설정으로 제공자 고르기. 설정이 없거나 모르는 제공자면 undefined (→ 번역 버튼 "설정 안 됨") */
export function createLlmClient(config: TranslateConfig): LlmClient | undefined {
  switch (config.TRANSLATE_PROVIDER) {
    case "fake":
      return new FakeLlmClient();
    default:
      return undefined;
  }
}
