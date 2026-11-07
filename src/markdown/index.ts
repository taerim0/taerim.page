/**
 * Markdown 렌더러의 공개 입구.
 * 다른 코드(빌드, 관리자 미리보기)는 이 파일에서만 가져다 쓴다.
 */
import { createRenderer } from "./renderer.ts";
import type { MarkdownModule } from "./types.ts";

export { createRenderer, isExternalLink } from "./renderer.ts";
export type { RendererOptions } from "./renderer.ts";
export type { MarkdownModule, RenderFn } from "./types.ts";

/**
 * 블로그에서 실제로 켜는 모듈 목록.
 * 모듈을 추가·제거할 때는 여기만 고친다. 지금은 core만 쓴다.
 */
export const enabledModules: readonly MarkdownModule[] = [];

/** 블로그 설정이 적용된 렌더러. 빌드와 미리보기가 같은 이 함수를 쓴다. */
export const renderMarkdown = createRenderer([...enabledModules]);
