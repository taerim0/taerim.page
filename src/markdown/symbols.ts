import type { MarkdownModule } from "./types.ts";

/**
 * 기호 바꾸기 (설계 13-10): 글자로 쓴 화살표·같지 않음을 기호로.
 * `<=>` ⇔ · `<->` ↔ · `=>` ⇒ · `<=` ⇐ · `->` → · `<-` ← · `!=` ≠ (긴 것부터 맞춤)
 *
 * - 일반 글자 조각(text 토큰)만 바꾼다 → 인라인 코드·코드 블록·수식·링크 주소는 그대로
 * - `\->`처럼 `\`를 붙이면 그대로: markdown-it이 이스케이프한 글자를 text_special로 따로 두므로,
 *   그것들이 글자로 합쳐지기(text_join) 전에 바꾼다
 * - 저장한 원문(md)은 그대로, 보여 줄 때만 바뀜
 */
const SYMBOLS: Readonly<Record<string, string>> = {
  "<=>": "⇔",
  "<->": "↔",
  "=>": "⇒",
  "<=": "⇐",
  "->": "→",
  "<-": "←",
  "!=": "≠",
};

/** 긴 것부터: `<=>`가 `<=` + `>`로 쪼개지지 않게 */
const PATTERN = /<=>|<->|=>|<=|->|<-|!=/g;

/** 글자 안의 기호를 바꾼다 (모듈 밖에서도 쓸 수 있게 내보냄) */
export function replaceSymbols(text: string): string {
  return text.replace(PATTERN, (match) => SYMBOLS[match] ?? match);
}

export const symbolsModule: MarkdownModule = {
  name: "symbols",
  setup(md) {
    md.core.ruler.before("text_join", "symbols", (state) => {
      for (const block of state.tokens) {
        if (block.type !== "inline" || !block.children) continue;
        for (const token of block.children) {
          if (token.type === "text") token.content = replaceSymbols(token.content);
        }
      }
    });
  },
};
