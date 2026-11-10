// @ts-check
/**
 * 번역 상태 작은 표시 (글 목록·편집 화면 공통, 설계 12-10)
 *   공개본이 옛 한글 기준 → "EN 원문 바뀜"(빨강) / 공개됨 → "EN" / 초안만 → "EN 초안" / 없음 → 표시 안 함
 */
import { el } from "./ui.js";

/** @typedef {import("./api.js").TranslationLang} TranslationLang */
/** @typedef {import("../../src/translations/status.ts").TranslationStatus} TranslationStatus */

/**
 * 누르면 그 글의 번역 화면으로 가는 작은 표시. 번역이 없으면 null
 * @param {number} postId
 * @param {TranslationLang} lang
 * @param {TranslationStatus | undefined} status
 */
export function translationBadge(postId, lang, status) {
  if (!status || (!status.published && !status.hasDraft)) return null;
  const code = lang.toUpperCase();
  const [text, kind, title] = status.published
    ? status.outdated
      ? [`${code} 원문 바뀜`, "outdated", "번역을 만든 뒤 한글이 바뀌었어요"]
      : [code, "published", status.hasDraft ? "번역 공개됨 (고치는 초안 있음)" : "번역 공개됨"]
    : [`${code} 초안`, "editing", "번역 초안만 있어요 (공개 안 됨)"];
  return el("a", { class: `pill ${kind}`, href: `/posts/translate/${postId}/${lang}`, title }, text);
}
