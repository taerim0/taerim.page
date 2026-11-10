import type { TranslationContent } from "./types.ts";

/**
 * 한글 원문(제목·요약·본문)의 해시. 번역할 때 같이 저장해 두고,
 * 나중에 지금 한글의 해시와 다르면 "원문 바뀜"으로 본다.
 *
 * - 내용으로만 정한다 → 태그·대표 이미지만 바꾸거나 같은 내용으로 다시 저장하면 그대로
 * - 요약이 null이든 ""이든 같은 것으로 본다 (화면에서는 둘 다 "요약 없음")
 * - SHA-256 16진수 64자. 브라우저·Worker·Node 모두 crypto.subtle이 있다
 */
export async function sourceHash(source: TranslationContent): Promise<string> {
  // 칸 경계가 섞이지 않게 JSON 배열로 (제목 "a" + 본문 "bc" ≠ 제목 "ab" + 본문 "c")
  const text = JSON.stringify([source.title, source.summary ?? "", source.body]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
