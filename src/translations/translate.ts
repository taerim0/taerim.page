import { checkTranslation } from "./check.ts";
import { TranslationError } from "./llm.ts";
import type { LlmClient } from "./llm.ts";
import { buildTranslationRequest, parseTranslation } from "./prompt.ts";
import { checkMathPlaceholders, protectCodeBlocks, protectMath, restoreCodeBlocks, restoreMath } from "./protect.ts";
import type { TranslationContent, TranslationLang } from "./types.ts";

export interface TranslatedPost extends TranslationContent {
  /** 번역한 모델 (기록용) */
  model: string;
}

/**
 * 한글 글 하나를 번역한다 (설계 12-8·13-8).
 *   ① 코드 블록 → 자리표, 수식 → 자리표  ② 프롬프트  ③ 제공자 호출  ④ JSON 읽기  ⑤ 검사  ⑥ 자리표 → 수식·코드 블록
 * 실패하면 TranslationError (아무것도 저장하지 않는 것은 부르는 쪽 몫)
 */
export async function translatePost(client: LlmClient, source: TranslationContent, lang: TranslationLang): Promise<TranslatedPost> {
  const { text: withoutCode, blocks } = protectCodeBlocks(source.body);
  const { text: body, maths } = protectMath(withoutCode);
  const protectedSource = { ...source, body };

  const response = await client.complete(buildTranslationRequest(protectedSource, lang));
  if (response.finish === "length") {
    throw new TranslationError("too_long", "글이 너무 길어서 번역이 중간에 잘렸어요");
  }

  const result = parseTranslation(response.text);
  const problem = checkMathPlaceholders(result.body, maths) ?? checkTranslation(protectedSource, result, blocks.length);
  if (problem) throw new TranslationError("invalid_output", `번역 결과가 이상해요: ${problem}`);

  return { ...result, body: restoreCodeBlocks(restoreMath(result.body, maths), blocks), model: client.model };
}
