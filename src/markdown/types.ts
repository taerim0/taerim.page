import type { MarkdownIt } from "markdown-it";

/**
 * Markdown 기능 모듈.
 *
 * core 문법 위에 필요한 기능만 골라서 얹는다. (예: 인용, 표, 콜아웃)
 * 모듈은 markdown-it 인스턴스를 받아서 문법 규칙을 켜거나, 출력 방식을 바꾸거나,
 * 새 규칙을 등록한다.
 */
export interface MarkdownModule {
  /** 모듈 이름. 디버깅이나 설정 목록 표시에 쓴다. */
  readonly name: string;

  /** markdown-it 인스턴스에 이 모듈의 기능을 등록한다. */
  setup(md: MarkdownIt): void;
}

/** Markdown 문자열을 받아 HTML 문자열을 돌려주는 함수. */
export type RenderFn = (markdown: string) => string;
