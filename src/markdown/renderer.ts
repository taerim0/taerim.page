import MarkdownItFactory from "markdown-it";
import type { MarkdownIt } from "markdown-it";
import { addHeadingIds } from "./headings.ts";
import type { HeadingEnv } from "./headings.ts";
import type { MarkdownModule, RenderedDocument, RenderEnv, RenderFn } from "./types.ts";

/** 렌더러 설정 */
export interface RendererOptions {
  /**
   * 이 블로그의 도메인. 이 도메인(과 하위 도메인)을 가리키는 링크는 내부 링크로 보고
   * 같은 탭에서 연다. 그 밖의 http(s) 링크는 새 탭에서 연다.
   */
  siteHost?: string;
}

const DEFAULT_SITE_HOST = "taerim.page";

/**
 * core 문법 규칙. markdown-it의 "zero" 프리셋(모두 꺼진 상태)에서 이것만 켠다.
 *
 * - 블록: 제목(# 방식), 목록, 코드 블록(```), 구분선. 문단(paragraph)은 zero에서도 켜져 있음
 * - 인라인: 굵게·기울임, 링크, 인라인 코드, 줄바꿈, 이스케이프
 *
 * 일부러 켜지 않은 것: 인용(blockquote → quote 모듈), 밑줄식 제목(lheading),
 * 4칸 들여쓰기 코드(code), HTML(html_block, html_inline), 표, 이미지, 취소선 등
 */
const CORE_BLOCK_RULES = ["heading", "list", "fence", "hr"];
const CORE_INLINE_RULES = ["emphasis", "link", "backticks", "newline", "escape"];

/**
 * 렌더러를 만든다.
 *
 * @param modules core 위에 추가할 기능 모듈 (기본: 없음 = core만)
 * @param options 렌더러 설정
 * @returns Markdown → HTML 함수
 */
export function createRenderer(modules: MarkdownModule[] = [], options: RendererOptions = {}): RenderFn {
  const md = createMarkdownIt(modules, options);
  // env는 렌더링마다 새로 (모듈이 env에 값을 모으기도 하므로 넘겨받은 것을 그대로 쓰지 않음)
  return (markdown, env = {}) => md.render(markdown, { ...env });
}

/**
 * 글 페이지용 렌더러: HTML과 함께 목차(제목 목록)도 돌려준다. (빌드에서 사용)
 * HTML은 createRenderer와 똑같다 (같은 설정·같은 제목 id).
 */
export function createDocumentRenderer(
  modules: MarkdownModule[] = [],
  options: RendererOptions = {},
): (markdown: string, extra?: RenderEnv) => RenderedDocument {
  const md = createMarkdownIt(modules, options);
  return (markdown, extra = {}) => {
    // extra.imageSizes: 이미지 원래 크기 (이미지 모듈이 width·height에 씀), extra.locale: 언어 (콜아웃 기본 제목)
    const env: HeadingEnv & RenderEnv = { ...extra, toc: [] };
    const html = md.render(markdown, env);
    return { html, toc: env.toc ?? [] };
  };
}

/** 두 렌더러가 같이 쓰는 markdown-it 설정 */
function createMarkdownIt(modules: MarkdownModule[], options: RendererOptions): MarkdownIt {
  const md = new MarkdownItFactory("zero", {
    html: false, // 글 안에 쓴 HTML은 실행하지 않고 글자 그대로 표시
    breaks: true, // 엔터 한 번 = 줄바꿈(<br>)
    linkify: false, // 주소만 쓴 글자를 자동으로 링크로 만들지 않음
    typographer: false, // 따옴표·대시 자동 변환 안 함
  });

  md.enable(CORE_BLOCK_RULES);
  md.enable(CORE_INLINE_RULES);

  openExternalLinksInNewTab(md, options.siteHost ?? DEFAULT_SITE_HOST);
  addHeadingIds(md); // 제목에 id → 목차·#주소로 바로 이동

  for (const mod of modules) {
    mod.setup(md);
  }
  return md;
}

/**
 * 외부 링크에 target="_blank" rel="noopener noreferrer"를 붙인다.
 * 위험한 주소(javascript: 등)는 markdown-it이 링크로 만들기 전에 이미 걸러낸다.
 */
function openExternalLinksInNewTab(md: MarkdownIt, siteHost: string): void {
  const renderDefault = md.renderer.rules.link_open
    ?? ((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts));

  md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    const token = tokens[idx]!;
    const href = token.attrGet("href");
    if (typeof href === "string" && isExternalLink(href, siteHost)) {
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener noreferrer");
    }
    return renderDefault(tokens, idx, opts, env, self);
  };
}

/**
 * http(s) 링크이면서 블로그 도메인(또는 그 하위 도메인)이 아닌 경우 외부 링크.
 * 상대 경로(/posts/…, #제목), mailto: 등은 외부 링크로 보지 않는다.
 */
export function isExternalLink(href: string, siteHost: string): boolean {
  let url: URL;
  try {
    // 상대 경로는 블로그 주소 기준으로 해석된다 → 내부 링크가 됨
    url = new URL(href, `https://${siteHost}/`);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return host !== siteHost && !host.endsWith(`.${siteHost}`);
}
