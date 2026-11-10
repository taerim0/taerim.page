import type { MarkdownModule } from "./types.ts";

/**
 * 표 모듈 (설계 13-4): GitHub과 같은 `| a | b |` + `|---|---|` 문법 (markdown-it 기본 규칙 table)
 *
 * - 칸 정렬(:--- / :---: / ---:)은 markdown-it이 style="text-align:…"로 붙인다 (규칙이 만든 값만이라 안전)
 * - 칸 안에서 굵게·코드·링크·이미지·취소선 그대로. `\|`는 칸 안의 | 글자
 * - 표를 div.table-wrap으로 감싼다 → 표가 넓으면 표만 가로 스크롤 (글 폭은 그대로)
 */
export const tableModule: MarkdownModule = {
  name: "table",
  setup(md) {
    md.enable("table");
    md.renderer.rules.table_open = (tokens, idx, opts, _env, self) =>
      `<div class="table-wrap">\n${self.renderToken(tokens, idx, opts)}`;
    md.renderer.rules.table_close = (tokens, idx, opts, _env, self) => `${self.renderToken(tokens, idx, opts)}</div>\n`;
  },
};
