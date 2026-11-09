/**
 * 공개 사이트(taerim.page) 페이지 틀. 빌드가 이 함수들로 정적 HTML을 만든다.
 *
 * - Hono `html` 태그 템플릿: ${…}로 넣는 값은 자동으로 이스케이프된다 (제목에 <b>가 있어도 글자로)
 * - 본문만 `raw(…)`: 렌더러가 HTML을 막고 안전하게 만든 결과이기 때문
 * - 방문자 화면에 JS는 넣지 않는다
 * - 요소에 id를 쓰지 않고 class만 쓴다 → 본문 제목 id(#설치-하기 등)와 겹치지 않게
 * - 꾸미기는 나중(UI/UX 단계). 지금은 구조와 의미만
 */
import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { TocItem } from "../markdown/index.ts";
import type { Post, TagCount } from "../posts/types.ts";
import type { ImageSize } from "./images.ts";
import { pagePath, postPath, tagPath, TAGS_PATH } from "./paths.ts";

/** 템플릿 결과 (값이 모두 동기라 실제로는 바로 문자열이 나오지만, 타입상 Promise일 수 있음 → 빌드에서 await) */
export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

/** 사이트 공통 설정 */
export interface SiteConfig {
  /** 사이트 이름 (머리말·제목 뒤에 붙음) */
  name: string;
  /** 사이트 주소 (끝에 / 없이). 절대 주소가 필요한 곳(대표 이미지 공유, canonical)에 쓴다. 예) https://taerim.page */
  url: string;
  /** 짧은 소개 (홈의 description) */
  description: string;
  /** 대표 이미지가 없는 글에 쓸 기본 이미지 주소 (예: /assets/default-thumbnail.svg) */
  defaultThumbnail: string;
}

/** 목록에 쓰는 글 정보 (본문 없음) */
export type PostCardData = Omit<Post, "body">;

/** 목록의 페이지 정보 */
export interface Pagination {
  page: number;
  totalPages: number;
  /** 목록 주소 ("/" 또는 태그 주소). n페이지 주소는 pagePath(listPath, n) */
  listPath: string;
}

// ── 공통 틀 ─────────────────────────────────────────

interface LayoutProps {
  site: SiteConfig;
  /** 페이지 제목 (없으면 사이트 이름만) */
  title?: string;
  description?: string;
  /** 이 페이지 주소 (canonical·공유용) */
  path: string;
  /** 공유할 때 보일 이미지 (없으면 기본 이미지) */
  image?: string | null;
  /** 공유 미리보기 종류 */
  type?: "website" | "article";
  /** 검색 엔진에 넣지 않을 페이지 (404 등) */
  noindex?: boolean;
  body: Html;
}

export function layout(props: LayoutProps): Html {
  const { site } = props;
  const fullTitle = props.title ? `${props.title} · ${site.name}` : site.name;
  const description = props.description ?? site.description;
  const image = absoluteUrl(site, props.image || site.defaultThumbnail);
  return html`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${fullTitle}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${absoluteUrl(site, props.path)}">
  ${props.noindex ? html`<meta name="robots" content="noindex">` : ""}
  <meta property="og:site_name" content="${site.name}">
  <meta property="og:title" content="${props.title ?? site.name}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="${props.type ?? "website"}">
  <meta property="og:url" content="${absoluteUrl(site, props.path)}">
  <meta property="og:image" content="${image}">
  <link rel="alternate" type="application/rss+xml" title="${site.name}" href="/rss.xml">
  <link rel="stylesheet" href="/assets/site.css">
</head>
<body>
  <header class="site-header">
    <a class="site-name" href="/">${site.name}</a>
    <nav class="site-nav"><a href="/">글</a> <a href="${TAGS_PATH}">태그</a></nav>
  </header>
  <main class="site-main">
${props.body}
  </main>
  <footer class="site-footer">
    <a href="/rss.xml">RSS</a>
  </footer>
</body>
</html>
`;
}

// ── 목록 (홈·태그별) ─────────────────────────────────

interface ListPageProps {
  site: SiteConfig;
  posts: PostCardData[];
  pagination: Pagination;
  /** 태그별 목록이면 그 태그 */
  tag?: string;
  /** 이미지 주소 → 원래 크기 (대표 이미지에 width·height). 없으면 크기 없이 */
  imageSizes?: ReadonlyMap<string, ImageSize>;
}

export function listPage({ site, posts, pagination, tag, imageSizes }: ListPageProps): Html {
  const heading = tag === undefined ? null : `#${tag}`;
  const pageSuffix = pagination.page > 1 ? ` (${pagination.page}쪽)` : "";
  const body = html`
    ${heading === null ? "" : html`<h1 class="list-heading">${heading}</h1>`}
    ${posts.length === 0
      ? html`<p class="empty">아직 글이 없어요.</p>`
      : html`<ul class="post-list">${posts.map((post) => postCard(site, post, imageSizes))}</ul>`}
    ${pager(pagination)}`;
  return layout({
    site,
    title: heading === null ? (pagination.page > 1 ? `글 목록${pageSuffix}` : undefined) : `${heading}${pageSuffix}`,
    description: heading === null ? undefined : `${heading} 태그가 붙은 글`,
    path: pagePath(pagination.listPath, pagination.page),
    body,
  });
}

/** 목록의 글 하나 */
function postCard(site: SiteConfig, post: PostCardData, imageSizes?: ReadonlyMap<string, ImageSize>): Html {
  const src = post.thumbnail || site.defaultThumbnail;
  const size = imageSizes?.get(src);
  return html`<li class="post-card">
      <a class="post-card-link" href="${postPath(post.id)}">
        <img class="thumbnail" src="${src}" alt=""${size ? html` width="${size.width}" height="${size.height}"` : ""} loading="lazy">
        <h2 class="post-title">${post.title}</h2>
        ${post.summary ? html`<p class="summary">${post.summary}</p>` : ""}
      </a>
      ${postMeta(post)}
    </li>`;
}

/** 공개 날짜 + 태그 링크 */
function postMeta(post: PostCardData): Html {
  return html`<p class="post-meta">
        ${post.publishedAt ? html`<time datetime="${post.publishedAt}">${formatDate(post.publishedAt)}</time>` : ""}
        ${post.tags.map((tag) => html` <a class="tag" href="${tagPath(tag)}">#${tag}</a>`)}
      </p>`;
}

/** 이전·다음 페이지 */
function pager({ page, totalPages, listPath }: Pagination): Html {
  if (totalPages <= 1) return html``;
  return html`<nav class="pager" aria-label="페이지">
      ${page > 1 ? html`<a rel="prev" href="${pagePath(listPath, page - 1)}">‹ 이전</a>` : ""}
      <span>${page} / ${totalPages}</span>
      ${page < totalPages ? html`<a rel="next" href="${pagePath(listPath, page + 1)}">다음 ›</a>` : ""}
    </nav>`;
}

// ── 글 ──────────────────────────────────────────────

/** 목차에 보일 제목 단계 (본문 #·##·###까지) */
const TOC_MAX_LEVEL = 3;

interface PostPageProps {
  site: SiteConfig;
  post: Post;
  /** 렌더러가 만든 본문 HTML (안전하게 만들어진 것만) */
  bodyHtml: string;
  toc: TocItem[];
}

/**
 * 글 페이지. 목차는 본문 앞에 두고, 넓은 화면에서는 CSS로 옆에 붙인다 (좁으면 제목 아래 그대로).
 * 제목이 하나뿐이거나 없으면 목차를 넣지 않는다.
 */
export function postPage({ site, post, bodyHtml, toc }: PostPageProps): Html {
  const items = toc.filter((item) => item.level <= TOC_MAX_LEVEL);
  const minLevel = Math.min(...items.map((item) => item.level));
  const body = html`
    <article class="post">
      <header class="post-header">
        <h1 class="post-title">${post.title}</h1>
        ${postMeta(post)}
      </header>
      ${items.length < 2
        ? ""
        : html`<nav class="toc" aria-label="목차">
        <p class="toc-title">목차</p>
        <ol>${items.map(
          (item) => html`<li class="toc-level-${item.level - minLevel + 1}"><a href="#${item.id}">${item.text}</a></li>`,
        )}</ol>
      </nav>`}
      <div class="post-body">
${raw(bodyHtml)}
      </div>
    </article>`;
  return layout({
    site,
    title: post.title,
    description: post.summary ?? undefined,
    path: postPath(post.id),
    image: post.thumbnail,
    type: "article",
    body,
  });
}

// ── 태그 모음 ────────────────────────────────────────

export function tagsPage({ site, tags }: { site: SiteConfig; tags: TagCount[] }): Html {
  const body = html`
    <h1 class="list-heading">태그</h1>
    ${tags.length === 0
      ? html`<p class="empty">아직 태그가 없어요.</p>`
      : html`<ul class="tag-cloud">${tags.map(
          (tag) => html`<li><a class="tag" href="${tagPath(tag.name)}">#${tag.name} <span class="count">${tag.count}</span></a></li>`,
        )}</ul>`}`;
  return layout({ site, title: "태그", path: TAGS_PATH, body });
}

// ── 없는 주소 ────────────────────────────────────────

export function notFoundPage({ site }: { site: SiteConfig }): Html {
  const body = html`
    <h1 class="list-heading">페이지를 찾을 수 없어요</h1>
    <p>주소가 바뀌었거나 지워진 글일 수 있어요. <a href="/">글 목록으로</a></p>`;
  return layout({ site, title: "페이지를 찾을 수 없어요", path: "/404", noindex: true, body });
}

// ── 도우미 ──────────────────────────────────────────

/** "/posts/1" → "https://taerim.page/posts/1". 이미 절대 주소면 그대로 */
export function absoluteUrl(site: SiteConfig, path: string): string {
  return /^https?:\/\//.test(path) ? path : `${site.url}${path}`;
}

/** ISO 시각 → 한국 날짜 "2026-11-08" (빌드하는 컴퓨터의 시간대와 상관없이) */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date(iso));
}
