import { TranslationError } from "./llm.ts";
import type { LlmRequest } from "./llm.ts";
import type { TranslationContent, TranslationLang } from "./types.ts";

/** 언어 코드 → 프롬프트에 쓰는 이름 */
const LANGUAGE_NAMES: Record<TranslationLang, string> = { en: "English" };

/**
 * 번역 요청 (설계 12-8). 지시는 영어로 쓴다 (대부분의 모델이 영어 지시를 더 정확히 따름).
 * 한글은 JSON으로 보내고 JSON으로 받는다 → 제목·요약·본문이 섞이지 않음.
 * 본문은 코드 블록이 이미 [[CODE_n]] 자리표로 바뀐 상태여야 한다.
 */
export function buildTranslationRequest(source: TranslationContent, lang: TranslationLang): LlmRequest {
  const language = LANGUAGE_NAMES[lang];
  const system = [
    `You translate posts from a Korean personal software-development blog into ${language}.`,
    "",
    "Rules:",
    `- Translate into natural, fluent ${language} that a developer would enjoy reading. Keep the author's voice and tone.`,
    "- Translate everything faithfully. Do not add, remove, summarize, or explain anything.",
    "- Keep the Markdown structure exactly: headings and their levels, lists, tables, blockquotes, emphasis, blank lines, and line breaks.",
    "- Lines like [[CODE_1]] are placeholders for code blocks. Copy each one unchanged, on its own line, in the same place.",
    "- [[MATH_1]] and similar are placeholders for math formulas, either on their own line or inside a sentence. Copy each one unchanged in the matching place.",
    "- Do not change inline code (`like this`), URLs, link targets, or image addresses.",
    "- Callout markers such as > [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING], > [!CAUTION], > [!FOLD], including a trailing - or + (e.g. > [!NOTE]-), must stay exactly as they are. Translate only the title text after the marker, if any.",
    "- Embed lines like !embed[title](https://…) must stay on their own line with the same address. Translate only the title inside the brackets, if any.",
    "- Image syntax is ![description|options](address). Translate the description, but keep options such as |400, |50%, |center, |left, |right exactly as they are.",
    "- If the summary is an empty string, return an empty string.",
    "",
    'Input and output are a single JSON object: {"title": string, "summary": string, "body": string}.',
    "Reply with that JSON object only, with no other text.",
  ].join("\n");
  const user = JSON.stringify({ title: source.title, summary: source.summary ?? "", body: source.body });
  return { system, user };
}

/**
 * 모델 답에서 JSON 읽기. ```json … ``` 으로 감싸 보내도 벗긴다.
 * 요약 ""은 null로. 모양이 틀리면 invalid_output
 */
export function parseTranslation(text: string): TranslationContent {
  const unwrapped = text.trim().replace(/^```(?:json)?[ \t]*\n([\s\S]*)\n```$/i, "$1");
  let value: unknown;
  try {
    value = JSON.parse(unwrapped);
  } catch {
    throw new TranslationError("invalid_output", "번역 결과가 JSON이 아니에요");
  }
  if (typeof value !== "object" || value === null) {
    throw new TranslationError("invalid_output", "번역 결과가 JSON 객체가 아니에요");
  }
  const { title, summary, body } = value as Record<string, unknown>;
  if (typeof title !== "string" || typeof body !== "string" || (summary !== undefined && summary !== null && typeof summary !== "string")) {
    throw new TranslationError("invalid_output", "번역 결과에 title·summary·body 글자가 없어요");
  }
  return { title: title.trim(), summary: typeof summary === "string" && summary.trim() !== "" ? summary.trim() : null, body };
}
