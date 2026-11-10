import type { MarkdownModule } from "./types.ts";

/**
 * 취소선 모듈 (설계 13-4): `~~지운 글자~~` → `<s>지운 글자</s>` (markdown-it 기본 규칙 strikethrough)
 * 물결 하나(`~글자~`)는 그대로 글자.
 */
export const strikethroughModule: MarkdownModule = {
  name: "strikethrough",
  setup(md) {
    md.enable("strikethrough");
  },
};
