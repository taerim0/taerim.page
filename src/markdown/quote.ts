import type { MarkdownModule } from "./types.ts";

/**
 * 인용 모듈: `> 문장` → `<blockquote>` (설계 13-3)
 * markdown-it 기본 규칙을 켜기만 한다. 여러 줄·중첩(>>)·안의 목록·코드 블록 모두 표준대로.
 * 콜아웃 모듈(`> [!NOTE]`)이 이 위에 얹힌다.
 */
export const quoteModule: MarkdownModule = {
  name: "quote",
  setup(md) {
    md.enable("blockquote");
  },
};
