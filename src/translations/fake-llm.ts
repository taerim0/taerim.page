import type { LlmClient, LlmRequest, LlmResponse } from "./llm.ts";

/**
 * 가짜 제공자 (TRANSLATE_PROVIDER=fake, 로컬 화면 확인용 — 배포 설정에는 넣지 않는다).
 * 받은 JSON을 그대로 돌려주되 제목·요약 앞에 "[EN] ", 본문 맨 앞에 안내 한 줄.
 * 자리표·이미지·링크·제목 줄은 그대로라 결과 검사를 통과한다.
 */
export class FakeLlmClient implements LlmClient {
  readonly model = "fake";

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const source = JSON.parse(request.user) as { title: string; summary: string; body: string };
    const result = {
      title: `[EN] ${source.title}`,
      summary: source.summary ? `[EN] ${source.summary}` : "",
      body: `> (fake translation)\n\n${source.body}`,
    };
    return { text: JSON.stringify(result), finish: "stop" };
  }
}
