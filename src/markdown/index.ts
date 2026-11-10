/**
 * Markdown 렌더러의 공개 입구.
 * 다른 코드(빌드, 관리자 미리보기)는 이 파일에서만 가져다 쓴다.
 */
import { calloutModule } from "./callout.ts";
import { codeModule } from "./code.ts";
import { imageModule } from "./image.ts";
import { mathModule } from "./math.ts";
import { quoteModule } from "./quote.ts";
import { strikethroughModule } from "./strikethrough.ts";
import { tableModule } from "./table.ts";
import { createDocumentRenderer, createRenderer } from "./renderer.ts";
import type { MarkdownModule } from "./types.ts";

export { slugify } from "./headings.ts";
export { calloutMarkers, calloutModule, CALLOUT_KINDS } from "./callout.ts";
export { codeModule, parseFenceInfo, setCodeHighlighter } from "./code.ts";
export type { CodeHighlighter, FenceOptions, HighlightToken } from "./code.ts";
export { imageModule } from "./image.ts";
export { inlineMathEnd, mathModule, setMathRenderer } from "./math.ts";
export type { MathRenderer } from "./math.ts";
export { quoteModule } from "./quote.ts";
export { strikethroughModule } from "./strikethrough.ts";
export { tableModule } from "./table.ts";
export type { TocItem } from "./headings.ts";
export { createDocumentRenderer, createRenderer, isExternalLink } from "./renderer.ts";
export type { RendererOptions } from "./renderer.ts";
export type { MarkdownModule, RenderedDocument, RenderEnv, RenderFn } from "./types.ts";

/**
 * 블로그에서 실제로 켜는 모듈 목록.
 * 모듈을 추가·제거할 때는 여기만 고친다.
 */
export const enabledModules: readonly MarkdownModule[] = [quoteModule, calloutModule, tableModule, strikethroughModule, codeModule, mathModule, imageModule];

/** 블로그 설정이 적용된 렌더러. 빌드와 미리보기가 같은 이 함수를 쓴다. */
export const renderMarkdown = createRenderer([...enabledModules]);

/** 글 페이지용(HTML + 목차). renderMarkdown과 HTML이 똑같다. 빌드가 쓴다. */
export const renderDocument = createDocumentRenderer([...enabledModules]);
