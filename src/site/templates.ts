/**
 * 공개 사이트(taerim.page) 페이지 틀. 빌드가 이 함수들로 정적 HTML을 만든다.
 *
 * - Hono `html` 태그 템플릿: ${…}로 넣는 값은 자동으로 이스케이프된다 (제목에 <b>가 있어도 글자로)
 * - 본문만 `raw(…)`: 렌더러가 HTML을 막고 안전하게 만든 결과이기 때문
 * - 방문자 화면의 JS는 작은 스크립트 하나뿐: 언어 기억(설계 12-11) + 코드 복사(설계 13-6) — i18n.ts의 SITE_SCRIPT
 * - 요소에 id를 쓰지 않고 class만 쓴다 → 본문 제목 id(#설치-하기 등)와 겹치지 않게
 * - 언어(locale): 화면 글자는 i18n.ts 사전에서, 주소는 localizedPath로. 생략하면 한국어
 * - 꾸미기는 나중(UI/UX 단계). 지금은 구조와 의미만
 */
import type { GiscusConfig } from "./comments.ts";
import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { TocItem } from "../markdown/index.ts";
import type { SiteSettings } from "../settings/settings.ts";
import { DEFAULT_AVATAR } from "../settings/settings.ts";
import type { TagTree } from "../posts/tag-tree.ts";
import type { Post, TagCount } from "../posts/types.ts";
import type { ArchiveActivity, ArchiveYear } from "./archive.ts";
import { formatDate, formatDay, SITE_SCRIPT, LOCALES, localizedPath, MESSAGES, SOURCE_LOCALE } from "./i18n.ts";
import type { Locale } from "./i18n.ts";
import type { ImageSize } from "./images.ts";
import { ARCHIVE_PATH, activityAnchor, pagePath, postPath, POSTS_PATH, SEARCH_BODY_PATH, SEARCH_INDEX_PATH, SEARCH_PATH, tagPath, TAGS_PATH } from "./paths.ts";

export { formatDate } from "./i18n.ts";

/** 템플릿 결과 (값이 모두 동기라 실제로는 바로 문자열이 나오지만, 타입상 Promise일 수 있음 → 빌드에서 await) */
export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

/** 사이트 공통 설정 */
export interface SiteConfig {
  /** 사이트 이름 (머리말·제목 뒤에 붙음) */
  name: string;
  /** 사이트 주소 (끝에 / 없이). 절대 주소가 필요한 곳(대표 이미지 공유, canonical)에 쓴다. 예) https://taerim.page */
  url: string;
  /** 짧은 소개 (홈의 description, 한국어) */
  description: string;
  /** 번역 언어별 소개. 없으면 한국어 소개 */
  descriptions?: Partial<Record<Locale, string>>;
  /** 대표 이미지가 없는 글에 쓸 기본 이미지 주소 (예: /assets/default-thumbnail.svg) */
  defaultThumbnail: string;
  /** 관리자 사이트 설정 (설계 15-3): 홈 소개 카드·바닥글. 없으면 바닥글은 RSS와 사이트 이름만 */
  profile?: SiteSettings;
  /** 반응·댓글 (설계 2-1). 없으면 글 페이지에 댓글 칸 없음 */
  giscus?: GiscusConfig;
}

/**
 * 목록에 쓰는 글 정보 (본문 없음). 번역 언어 목록에서는 제목·요약이 번역본 것이고,
 * 번역이 없으면 한글 그대로 + untranslated
 */
export type PostCardData = Omit<Post, "body"> & { untranslated?: boolean };

/** 목록의 페이지 정보 */
export interface Pagination {
  page: number;
  totalPages: number;
  /** 목록 주소 (한국어 기준: "/posts" 또는 태그 주소). n페이지 주소는 pagePath(listPath, n), 언어는 템플릿이 붙임 */
  listPath: string;
}

// ── 공통 틀 ─────────────────────────────────────────

/** KaTeX CSS (빌드가 node_modules/katex/dist에서 복사, 글꼴은 같은 폴더의 fonts/) */
export const KATEX_CSS = "/assets/katex/katex.min.css";

/** 본문 HTML에 KaTeX 수식이 있는지 */
function hasMath(bodyHtml: string): boolean {
  return bodyHtml.includes('class="katex');
}

interface LayoutProps {
  site: SiteConfig;
  locale?: Locale;
  /** 페이지 제목 (없으면 사이트 이름만) */
  title?: string;
  description?: string;
  /** 이 페이지 주소 (한국어 기준). 언어 주소는 localizedPath로 */
  path: string;
  /** 공유할 때 보일 이미지 (없으면 기본 이미지) */
  image?: string | null;
  /** 공유 미리보기 종류 */
  type?: "website" | "article";
  /** 검색 엔진에 넣지 않을 페이지 (404, 미번역 글 등) */
  noindex?: boolean;
  /** 수식이 있는 페이지면 KaTeX CSS를 넣음 (설계 13-8, 수식 없는 페이지는 무게 그대로) */
  math?: boolean;
  /** 검색 엔진에 "같은 페이지의 다른 언어"로 알릴 언어들 (hreflang). 생략하면 모든 언어. 둘 미만이면 넣지 않음 */
  alternates?: readonly Locale[];
  /** <body> class (홈 page-home, 글 page-post, 나머지 page-basic = 흰 카드 한 장) */
  bodyClass?: string;
  /** 머리 메뉴에서 지금 표시할 칸 (설계 16-1: 초록 밑줄) */
  section?: "posts" | "tags" | "archive" | "search";
  /** 이 페이지에만 붙일 모듈 스크립트 (검색 페이지의 /assets/search.js) */
  moduleScript?: string;
  body: Html;
}

export function layout(props: LayoutProps): Html {
  const { site } = props;
  const locale = props.locale ?? SOURCE_LOCALE;
  const m = MESSAGES[locale];
  const fullTitle = props.title ? `${props.title} · ${site.name}` : site.name;
  const description = props.description ?? siteDescription(site, locale);
  const image = absoluteUrl(site, props.image || site.defaultThumbnail);
  const here = localizedPath(locale, props.path);
  const alternates = props.noindex ? [] : (props.alternates ?? LOCALES);
  return html`<!doctype html>
<html lang="${locale}"${LOCALES.map((l) => html` data-path-${l}="${localizedPath(l, props.path)}"`)}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${fullTitle}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${absoluteUrl(site, here)}">
  ${props.noindex ? html`<meta name="robots" content="noindex">` : ""}
  ${alternates.length < 2
    ? ""
    : html`${alternates.map((l) => html`<link rel="alternate" hreflang="${l}" href="${absoluteUrl(site, localizedPath(l, props.path))}">
  `)}<link rel="alternate" hreflang="x-default" href="${absoluteUrl(site, props.path)}">`}
  <meta property="og:site_name" content="${site.name}">
  <meta property="og:title" content="${props.title ?? site.name}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="${props.type ?? "website"}">
  <meta property="og:url" content="${absoluteUrl(site, here)}">
  <meta property="og:image" content="${image}">
  <link rel="alternate" type="application/rss+xml" title="${site.name}" href="${localizedPath(locale, "/rss.xml")}">
  <link rel="stylesheet" href="/assets/site.css">
  ${props.math ? html`<link rel="stylesheet" href="${KATEX_CSS}">` : ""}
  <script>${raw(SITE_SCRIPT)}</script>
  ${props.moduleScript ? html`<script type="module" src="${props.moduleScript}"></script>` : ""}
</head>
<body class="${props.bodyClass ?? "page-basic"}">
  <header class="site-header">
    <div class="site-header-inner">
      <a class="site-name" href="${localizedPath(locale, "/")}">${site.name}</a>
      <nav class="site-nav">
        ${navLink(localizedPath(locale, POSTS_PATH), m.navPosts, props.section === "posts")}
        ${navLink(localizedPath(locale, TAGS_PATH), m.navTags, props.section === "tags")}
        ${navLink(localizedPath(locale, ARCHIVE_PATH), m.navArchive, props.section === "archive")}
        ${navLink(localizedPath(locale, SEARCH_PATH), m.navSearch, props.section === "search")}
        <span class="lang-switch" role="group" aria-label="${m.languageLabel}">${LOCALES.map(
          (l) => html`<a href="${localizedPath(l, props.path)}" hreflang="${l}" lang="${l}" data-set-lang="${l}"${l === locale ? html` aria-current="true"` : ""}>${MESSAGES[l].languageName}</a>`,
        )}</span>
        <button class="theme-toggle" type="button" data-theme-toggle aria-pressed="false" aria-label="${m.themeToggle}" title="${m.themeToggle}"></button>
      </nav>
    </div>
  </header>
  <main class="site-main">
${props.body}
  </main>
  ${footer(site, locale)}
</body>
</html>
`;
}

/** 머리 메뉴 한 칸. 지금 칸이면 aria-current="page" (CSS가 초록 밑줄) */
function navLink(href: string, label: string, current: boolean): Html {
  return html`<a class="nav-link" href="${href}"${current ? html` aria-current="page"` : ""}>${label}</a>`;
}

/** 바닥글 (설계 15-4): RSS · GitHub · Contact: 이메일 (비운 칸은 안 보임, 이메일은 링크 없이 글로만) + © 빌드한 해 이름 */
function footer(site: SiteConfig, locale: Locale): Html {
  const m = MESSAGES[locale];
  const p = site.profile;
  const links = [
    html`<a href="${localizedPath(locale, "/rss.xml")}">RSS</a>`,
    p?.github ? html`<a href="${p.github}" rel="me noopener">GitHub</a>` : null,
    p?.email ? contact(locale, p.email) : null,
  ].filter((link) => link !== null);
  return html`<footer class="site-footer">
    <div class="site-footer-inner">
      <p class="footer-links">${links.map((link, i) => (i === 0 ? link : html` · ${link}`))}</p>
      <p class="copyright">© ${new Date().getFullYear()} ${p?.name ?? site.name}</p>
    </div>
  </footer>`;
}

/** 이메일은 링크(mailto) 없이 글로만: "Contact: me@example.com" */
function contact(locale: Locale, email: string): Html {
  return html`<span class="contact">${MESSAGES[locale].contact}: <span class="contact-email">${email}</span></span>`;
}

function siteDescription(site: SiteConfig, locale: Locale): string {
  return site.descriptions?.[locale] ?? site.description;
}

// ── 목록 (홈·태그별) ─────────────────────────────────

/** 태그 페이지의 위아래 길잡이 (설계 14) */
export interface TagNav {
  /** 맨 위부터 바로 위 부모까지 */
  ancestors: string[];
  /** 바로 아래 태그들 (글이 있는 것만) */
  children: TagCount[];
}

interface ListPageProps {
  site: SiteConfig;
  locale?: Locale;
  posts: PostCardData[];
  pagination: Pagination;
  /** 태그별 목록이면 그 태그 */
  tag?: string;
  /** 태그 페이지의 상위 경로·하위 태그 */
  tagNav?: TagNav;
  /** 이미지 주소 → 원래 크기 (대표 이미지에 width·height). 없으면 크기 없이 */
  imageSizes?: ReadonlyMap<string, ImageSize>;
}

export function listPage({ site, locale = SOURCE_LOCALE, posts, pagination, tag, tagNav, imageSizes }: ListPageProps): Html {
  const m = MESSAGES[locale];
  const heading = tag === undefined ? null : `#${tag}`;
  const pageSuffix = pagination.page > 1 ? m.pageSuffix(pagination.page) : "";
  const body = html`
    ${tagNav && tagNav.ancestors.length > 0
      ? html`<nav class="tag-path" aria-label="${m.tagsHeading}">${tagNav.ancestors.map(
          (name) => html`<a class="tag" href="${localizedPath(locale, tagPath(name))}">#${name}</a> › `,
        )}</nav>`
      : ""}
    ${heading === null ? "" : html`<h1 class="list-heading">${heading}</h1>`}
    ${tagNav && tagNav.children.length > 0
      ? html`<ul class="tag-children">${tagNav.children.map(
          (child) => html`<li><a class="tag" href="${localizedPath(locale, tagPath(child.name))}">#${child.name} <span class="count">${child.count}</span></a></li>`,
        )}</ul>`
      : ""}
    ${posts.length === 0
      ? html`<p class="empty">${m.emptyPosts}</p>`
      : html`<ul class="post-list">${posts.map((post) => postCard(site, locale, post, imageSizes))}</ul>`}
    ${pager(locale, pagination)}`;
  return layout({
    site,
    locale,
    title: heading === null ? `${m.postListTitle}${pageSuffix}` : `${heading}${pageSuffix}`,
    description: heading === null ? undefined : m.tagDescription(heading),
    path: pagePath(pagination.listPath, pagination.page),
    section: heading === null ? "posts" : "tags",
    body,
  });
}

/** 목록의 글 하나. 번역 언어 목록의 미번역 글은 한글 제목(lang="ko") + KR 표시 */
function postCard(site: SiteConfig, locale: Locale, post: PostCardData, imageSizes?: ReadonlyMap<string, ImageSize>): Html {
  const m = MESSAGES[locale];
  const src = post.thumbnail || site.defaultThumbnail;
  const size = imageSizes?.get(src);
  const korean = post.untranslated === true && locale !== SOURCE_LOCALE;
  return html`<li class="post-card">
      <a class="post-card-link" href="${localizedPath(locale, postPath(post.id))}">
        <img class="thumbnail" src="${src}" alt=""${size ? html` width="${size.width}" height="${size.height}"` : ""} loading="lazy">
        <h2 class="post-title"${korean ? html` lang="ko"` : ""}>${post.title}${korean ? html` <span class="lang-badge" title="${m.koreanOnlyTitle}">${m.koreanOnly}</span>` : ""}</h2>
        ${post.summary ? html`<p class="summary"${korean ? html` lang="ko"` : ""}>${post.summary}</p>` : ""}
      </a>
      ${postMeta(locale, post)}
    </li>`;
}

/** 공개 날짜 + 태그 링크 */
/** 날짜 · (글 페이지만) 조회 수 · 태그 */
function postMeta(locale: Locale, post: PostCardData, views?: number): Html {
  return html`<p class="post-meta">
        ${post.publishedAt ? html`<time datetime="${post.publishedAt}">${formatDate(post.publishedAt, locale)}</time>` : ""}
        ${views ? html` <span class="post-views">${MESSAGES[locale].views(views)}</span>` : ""}
        ${post.tags.map((tag) => html` <a class="tag" href="${localizedPath(locale, tagPath(tag))}">#${tag}</a>`)}
      </p>`;
}

/** 이전·다음 페이지 */
function pager(locale: Locale, { page, totalPages, listPath }: Pagination): Html {
  if (totalPages <= 1) return html``;
  const m = MESSAGES[locale];
  const at = (n: number) => localizedPath(locale, pagePath(listPath, n));
  return html`<nav class="pager" aria-label="${m.pagerLabel}">
      ${page > 1 ? html`<a rel="prev" href="${at(page - 1)}">${m.prev}</a>` : ""}
      <span>${page} / ${totalPages}</span>
      ${page < totalPages ? html`<a rel="next" href="${at(page + 1)}">${m.next}</a>` : ""}
    </nav>`;
}

// ── 글 ──────────────────────────────────────────────

/** 목차에 보일 제목 단계 (본문 #·##·###까지) */
const TOC_MAX_LEVEL = 3;

interface PostPageProps {
  site: SiteConfig;
  locale?: Locale;
  /** 글 (번역 언어면 제목·요약이 번역본 것) */
  post: Post;
  /** 렌더러가 만든 본문 HTML (안전하게 만들어진 것만) */
  bodyHtml: string;
  toc: TocItem[];
  /** 이 글이 있는 언어들 (hreflang). 생략하면 모든 언어 */
  alternates?: readonly Locale[];
  /** 이전(더 옛날)·다음(더 새) 글 (설계 15-6). 없으면 그쪽 칸은 비움 */
  neighbors?: { prev?: PostCardData; next?: PostCardData };
  /** 조회 수 (설계 2-2, 한·영 합계). 0이거나 없으면 안 보임 */
  views?: number;
}

/**
 * 글 페이지. 목차는 본문 앞에 두고, 넓은 화면에서는 CSS로 옆에 붙인다 (좁으면 제목 아래 그대로).
 * 제목이 하나뿐이거나 없으면 목차를 넣지 않는다.
 */
export function postPage({ site, locale = SOURCE_LOCALE, post, bodyHtml, toc, alternates, neighbors, views }: PostPageProps): Html {
  return layout({
    site,
    locale,
    title: post.title,
    description: post.summary ?? undefined,
    path: postPath(post.id),
    image: post.thumbnail,
    type: "article",
    alternates,
    math: hasMath(bodyHtml),
    moduleScript: site.giscus ? COMMENTS_SCRIPT : undefined,
    bodyClass: "page-post",
    section: "posts",
    body: postLayout(locale, toc, html`${article(locale, post, bodyHtml, views, true)}
        ${postNav(locale, neighbors)}
        ${site.giscus ? comments(locale, site.giscus, post.id) : ""}`),
  });
}

/**
 * 글 페이지 배치 (설계 16-3): 본문 왼쪽 + 목차 오른쪽(스크롤 따라옴).
 * 좁으면 목차가 본문 위로 오고 접힘 (방문자 스크립트). 목차 항목이 둘 미만이면 목차 칸 없이 한 칸
 */
function postLayout(locale: Locale, toc: TocItem[], main: Html): Html {
  const items = toc.filter((item) => item.level <= TOC_MAX_LEVEL);
  if (items.length < 2) return html`<div class="post-layout no-toc"><div class="post-main">${main}</div></div>`;
  const minLevel = Math.min(...items.map((item) => item.level));
  const m = MESSAGES[locale];
  return html`<div class="post-layout">
      <div class="post-main">${main}</div>
      <aside class="post-side">
        <details class="toc" open>
          <summary class="toc-title">${m.toc}</summary>
          <nav aria-label="${m.toc}"><ol>${items.map(
            (item) => html`<li class="toc-level-${item.level - minLevel + 1}"><a href="#${item.id}">${item.text}</a></li>`,
          )}</ol></nav>
        </details>
      </aside>
    </div>`;
}

/** 반응·댓글 스크립트 주소 (빌드가 src/site/comments-client.ts를 묶어 씀) */
export const COMMENTS_SCRIPT = "/assets/comments.js";

/**
 * 반응·댓글 칸 (설계 2-1): 스크립트가 .giscus 안에 giscus iframe을 넣는다.
 * 토론은 글 id로 묶음(post-n) → 한·영 페이지가 같은 토론. JS가 없으면 Discussions 링크
 */
function comments(locale: Locale, giscus: GiscusConfig, postId: number): Html {
  const m = MESSAGES[locale];
  return html`<section class="comments card" aria-labelledby="comments-heading">
      <h2 class="section-heading" id="comments-heading">${m.commentsHeading}</h2>
      <div class="giscus" data-repo="${giscus.repo}" data-repo-id="${giscus.repoId}" data-category="${giscus.category}" data-category-id="${giscus.categoryId}" data-post-id="${postId}" data-lang="${locale}" data-title="${m.commentsHeading}"></div>
      <noscript><p class="empty">${m.commentsNeedJs} <a href="https://github.com/${giscus.repo}/discussions">GitHub Discussions</a></p></noscript>
    </section>`;
}

/**
 * 이전·다음 글 두 칸 (설계 15-6). 다음 글은 항상 오른쪽 칸 (이전이 없으면 왼쪽은 빈 자리).
 * 번역 언어의 미번역 글은 한글 제목(lang="ko") + KR (목록과 같은 표시)
 */
function postNav(locale: Locale, neighbors: PostPageProps["neighbors"]): Html | "" {
  if (!neighbors || (!neighbors.prev && !neighbors.next)) return "";
  const m = MESSAGES[locale];
  const link = (post: PostCardData, rel: "prev" | "next", label: string) => {
    const korean = post.untranslated === true && locale !== SOURCE_LOCALE;
    return html`<a class="post-nav-${rel}" rel="${rel}" href="${localizedPath(locale, postPath(post.id))}">
        <span class="post-nav-label">${label}</span>
        <span class="post-nav-title"${korean ? html` lang="ko"` : ""}>${post.title}${korean ? html` <span class="lang-badge" title="${m.koreanOnlyTitle}">${m.koreanOnly}</span>` : ""}</span>
      </a>`;
  };
  return html`<nav class="post-nav" aria-label="${m.postNavLabel}">
      ${neighbors.prev ? link(neighbors.prev, "prev", m.prevPost) : html`<span class="post-nav-empty"></span>`}
      ${neighbors.next ? link(neighbors.next, "next", m.nextPost) : ""}
    </nav>`;
}

/**
 * 글 박스 (글 페이지와 미번역 페이지가 같이 씀, 설계 16-3):
 * 대표 이미지(있을 때만, 맨 위) → 제목 → 요약 → 날짜·조회 수·태그 → 구분선 → 본문
 */
function article(locale: Locale, post: Post, bodyHtml: string, views?: number, hero = false): Html {
  return html`
    <article class="post card">
      ${hero && post.thumbnail ? html`<img class="post-hero" src="${post.thumbnail}" alt="">` : ""}
      <div class="post-inner">
        <header class="post-header">
          <h1 class="post-title">${post.title}</h1>
          ${post.summary ? html`<p class="post-summary">${post.summary}</p>` : ""}
          ${postMeta(locale, post, views)}
        </header>
        <div class="post-body">
${raw(bodyHtml)}
        </div>
      </div>
    </article>`;
}

interface UntranslatedPageProps {
  site: SiteConfig;
  /** 번역 언어 */
  locale: Locale;
  /** 한글 글 */
  post: Post;
  /** 한글 본문 HTML */
  bodyHtml: string;
}

/**
 * 번역 안 된 글의 번역 언어 페이지 (/en/posts/7, 설계 12-11).
 * 한글 글을 흐리게 깔고(inert·aria-hidden: 포커스·클릭·화면 읽기 제외) 그 위에 안내 카드. CSS만, 검색 엔진 제외.
 * [한국어로 읽기]는 ?lang=ko → 언어 기억을 바꾸지 않고 이번만 한국어로
 */
export function untranslatedPostPage({ site, locale, post, bodyHtml }: UntranslatedPageProps): Html {
  const m = MESSAGES[locale];
  const ko = MESSAGES[SOURCE_LOCALE];
  const body = html`
    <div class="untranslated">
      <div class="untranslated-content" lang="ko" inert aria-hidden="true">${article(SOURCE_LOCALE, post, bodyHtml)}
      </div>
      <div class="untranslated-backdrop">
        <section class="untranslated-dialog" role="dialog" aria-label="${m.untranslatedTitle}">
          <p class="untranslated-title">${m.untranslatedTitle}</p>
          <p class="untranslated-note" lang="ko">${ko.untranslatedTitle}</p>
          <p class="untranslated-actions">
            <a class="untranslated-button primary" href="${postPath(post.id)}?lang=${SOURCE_LOCALE}" hreflang="ko" lang="ko">${m.readInKorean}</a>
            <a class="untranslated-button" href="${localizedPath(locale, "/")}">${m.backToPosts}</a>
          </p>
        </section>
      </div>
    </div>`;
  return layout({ site, locale, title: post.title, path: postPath(post.id), image: post.thumbnail, noindex: true, math: hasMath(bodyHtml), bodyClass: "page-post", section: "posts", body });
}

// ── 태그 모음 ────────────────────────────────────────

/**
 * 태그 모음. 상하관계가 있으면 트리(들여쓴 목록)로 (설계 14). 개수는 그 태그 + 하위 태그 글 (중복 없이)
 */
export function tagsPage({ site, locale = SOURCE_LOCALE, tags, tree }: { site: SiteConfig; locale?: Locale; tags: TagCount[]; tree?: TagTree }): Html {
  const m = MESSAGES[locale];
  const body = html`
    <h1 class="list-heading">${m.tagsHeading}</h1>
    ${tags.length === 0 ? html`<p class="empty">${m.emptyTags}</p>` : tagList(locale, tags, tree)}`;
  return layout({ site, locale, title: m.tagsHeading, path: TAGS_PATH, section: "tags", body });
}

/** 태그 목록: 트리가 있으면 들여쓴 트리, 없으면 나열. 태그 모음·홈이 같이 씀 */
function tagList(locale: Locale, tags: TagCount[], tree?: TagTree): Html {
  const counts = new Map(tags.map((tag) => [tag.name, tag.count]));
  const link = (name: string) => html`<a class="tag" href="${localizedPath(locale, tagPath(name))}">#${name} <span class="count">${counts.get(name) ?? 0}</span></a>`;
  if (!tree) return html`<ul class="tag-cloud">${tags.map((tag) => html`<li>${link(tag.name)}</li>`)}</ul>`;
  const item = (name: string): Html => html`<li>${link(name)}${branch(name)}</li>`;
  /** 글이 있는 하위 태그들 */
  const branch = (name: string): Html | "" => {
    const kids = tree.childrenOf(name).filter((child) => counts.has(child));
    return kids.length === 0 ? "" : html`<ul class="tag-tree">${kids.map(item)}</ul>`;
  };
  // 맨 위: 트리에서 부모가 없거나(또는 부모에 글이 없어) 위에서 안 보이는 태그들
  const roots = tags.map((tag) => tag.name).filter((name) => tree.parentOf(name) === null || !counts.has(tree.parentOf(name)!));
  return html`<ul class="tag-tree tag-tree-root">${roots.map(item)}</ul>`;
}

// ── 홈 (설계 15-4) ───────────────────────────────────

/** 홈에 보일 최신 글 수 */
export const HOME_POST_COUNT = 5;

interface HomePageProps {
  site: SiteConfig;
  locale?: Locale;
  profile: SiteSettings;
  /** 최신 글 (HOME_POST_COUNT개까지) */
  posts: PostCardData[];
  /** 태그별 글 수 (없으면 태그 트리를 안 보임) */
  tags: TagCount[];
  tree?: TagTree;
  imageSizes?: ReadonlyMap<string, ImageSize>;
  /** 최근 활동 (설계 15-5, HOME_ACTIVITY_COUNT개까지). 없으면 그 부분을 안 보임 */
  activities?: ArchiveActivity[];
  /** 전체 활동 수. HOME_ACTIVITY_COUNT보다 많을 때만 "아카이브 전체 보기" (설계 16-1). 없으면 activities 수 */
  activityTotal?: number;
}

/** 홈에 보일 최근 활동 수 */
export const HOME_ACTIVITY_COUNT = 10;

/**
 * 홈: 넓으면 왼쪽(소개 카드 + 태그 트리) · 오른쪽(최신 글 + 전체 글 보기), 좁으면 세로로 (CSS).
 * 태그 트리는 <details open> 하나 → 좁은 화면에서는 방문자 스크립트가 처음에 접음
 */
export function homePage({ site, locale = SOURCE_LOCALE, profile, posts, tags, tree, imageSizes, activities = [], activityTotal }: HomePageProps): Html {
  const m = MESSAGES[locale];
  const [first, ...rest] = posts;
  const moreActivities = (activityTotal ?? activities.length) > HOME_ACTIVITY_COUNT;
  const body = html`
    <div class="home">
      <aside class="home-side">
        ${profileCard(locale, profile)}
        ${tags.length === 0
          ? ""
          : html`<details class="home-tags card" open>
          <summary>${m.tagsHeading}</summary>
          ${tagList(locale, tags, tree)}
        </details>`}
      </aside>
      <section class="home-main" aria-labelledby="home-latest">
        <h2 class="visually-hidden" id="home-latest">${m.latestPosts}</h2>
        ${first === undefined
          ? html`<p class="empty card">${m.emptyPosts}</p>`
          : html`${featuredCard(site, locale, first, imageSizes)}
        <div class="card list-card">
          ${rest.length === 0 ? "" : html`<ul class="post-rows">${rest.map((post) => postRow(locale, post, imageSizes))}</ul>`}
          <p class="card-more"><a href="${localizedPath(locale, POSTS_PATH)}">${m.allPosts}</a></p>
        </div>`}
        ${activities.length === 0
          ? ""
          : html`<section class="card list-card home-activities" aria-labelledby="home-activities">
          <h2 class="card-heading" id="home-activities">${m.recentActivities}</h2>
          <ul class="activity-lines">${activities.map(
            (activity) =>
              html`<li><time datetime="${activity.date}">${formatDay(activity.date, locale)}</time> ${activityBadge(locale, activity)} <a href="${localizedPath(locale, ARCHIVE_PATH)}#${activityAnchor(activity.id)}"${activity.titleLang ? html` lang="${activity.titleLang}"` : ""}>${activity.title}</a></li>`,
          )}</ul>
          ${moreActivities ? html`<p class="card-more"><a href="${localizedPath(locale, ARCHIVE_PATH)}">${m.viewArchive}</a></p>` : ""}
        </section>`}
      </section>
    </div>`;
  return layout({ site, locale, path: "/", bodyClass: "page-home", body });
}

/** 홈 맨 위 큰 카드 (설계 16-1): 넓으면 그림 왼쪽·글 오른쪽, 좁으면 그림 위. 대표 이미지가 없으면 기본 그림 */
function featuredCard(site: SiteConfig, locale: Locale, post: PostCardData, imageSizes?: ReadonlyMap<string, ImageSize>): Html {
  const m = MESSAGES[locale];
  const src = post.thumbnail || site.defaultThumbnail;
  const size = imageSizes?.get(src);
  const korean = post.untranslated === true && locale !== SOURCE_LOCALE;
  return html`<article class="card featured">
          <a class="featured-image" href="${localizedPath(locale, postPath(post.id))}" tabindex="-1" aria-hidden="true"><img src="${src}" alt=""${size ? html` width="${size.width}" height="${size.height}"` : ""}></a>
          <div class="featured-text">
            <h3 class="featured-title"${korean ? html` lang="ko"` : ""}><a href="${localizedPath(locale, postPath(post.id))}">${post.title}</a>${korean ? html` <span class="lang-badge" title="${m.koreanOnlyTitle}">${m.koreanOnly}</span>` : ""}</h3>
            ${post.summary ? html`<p class="summary"${korean ? html` lang="ko"` : ""}>${post.summary}</p>` : ""}
            ${postMeta(locale, post)}
          </div>
        </article>`;
}

/** 홈 목록 카드의 한 줄 (설계 16-1): 제목 → 요약 → 날짜·태그, 대표 이미지가 있을 때만 오른쪽에 작은 그림 */
function postRow(locale: Locale, post: PostCardData, imageSizes?: ReadonlyMap<string, ImageSize>): Html {
  const m = MESSAGES[locale];
  const size = post.thumbnail ? imageSizes?.get(post.thumbnail) : undefined;
  const korean = post.untranslated === true && locale !== SOURCE_LOCALE;
  return html`<li class="post-row${post.thumbnail ? " has-thumb" : ""}">
            <div class="post-row-text">
              <h3 class="post-row-title"${korean ? html` lang="ko"` : ""}><a href="${localizedPath(locale, postPath(post.id))}">${post.title}</a>${korean ? html` <span class="lang-badge" title="${m.koreanOnlyTitle}">${m.koreanOnly}</span>` : ""}</h3>
              ${post.summary ? html`<p class="summary"${korean ? html` lang="ko"` : ""}>${post.summary}</p>` : ""}
              ${postMeta(locale, post)}
            </div>
            ${post.thumbnail ? html`<img class="post-row-thumb" src="${post.thumbnail}" alt=""${size ? html` width="${size.width}" height="${size.height}"` : ""} loading="lazy">` : ""}
          </li>`;
}

/** 소개 카드: 사진(없으면 기본 그림) · 이름 · 한 줄 소개 · 링크(비운 칸은 안 보임) · Contact: 이메일(글로만) */
function profileCard(locale: Locale, p: SiteSettings): Html {
  const m = MESSAGES[locale];
  const tagline = locale === SOURCE_LOCALE ? p.tagline : (p.taglineEn ?? p.tagline);
  const taglineLang = locale !== SOURCE_LOCALE && !p.taglineEn ? SOURCE_LOCALE : null;
  const links = [
    p.github ? html`<li><a href="${p.github}" rel="me noopener">GitHub</a></li>` : null,
    p.linkedin ? html`<li><a href="${p.linkedin}" rel="me noopener">LinkedIn</a></li>` : null,
    p.solvedac ? html`<li><a href="${p.solvedac}" rel="me noopener">solved.ac</a></li>` : null,
  ].filter((link) => link !== null);
  return html`<section class="profile-card card" aria-label="${m.profileLabel}">
          <img class="avatar" src="${p.photo ?? DEFAULT_AVATAR}" alt="" width="96" height="96">
          <p class="profile-name">${p.name}</p>
          ${tagline ? html`<p class="profile-tagline"${taglineLang ? html` lang="${taglineLang}"` : ""}>${tagline}</p>` : ""}
          ${links.length > 0 ? html`<ul class="profile-links">${links}</ul>` : ""}
          ${p.email ? html`<p class="profile-contact">${contact(locale, p.email)}</p>` : ""}
        </section>`;
}

// ── 아카이브 (설계 15-5) ─────────────────────────────

/**
 * 아카이브: 글과 활동을 연 → 월로 (최신부터), 맨 위에 연도 바로 가기.
 * 글은 날짜 + 제목 링크 한 줄, 활동은 꼬리표 + 제목 (설계 15-8).
 * 내용이 있는 활동은 <details>로 접어 둠 (모두 닫힌 채로 시작, 주소 조각 #activity-n으로 오면 방문자 스크립트가 그것만 펼침).
 * 내용이 없으면 접기 없이 한 줄
 */
export function archivePage({ site, locale = SOURCE_LOCALE, years }: { site: SiteConfig; locale?: Locale; years: ArchiveYear[] }): Html {
  const m = MESSAGES[locale];
  const total = years.reduce((sum, y) => ({ posts: sum.posts + y.posts, activities: sum.activities + y.activities }), { posts: 0, activities: 0 });
  const body = html`
    <h1 class="list-heading">${m.archiveHeading}</h1>
    ${years.length === 0
      ? html`<p class="empty">${m.emptyPosts}</p>`
      : html`<p class="archive-total">${m.archiveCounts(total.posts, total.activities)}</p>
    <nav class="archive-years" aria-label="${m.archiveYears}">${years.map(
      (y, i) => html`${i > 0 ? " · " : ""}<a href="#year-${y.year}">${y.year}</a>`,
    )}</nav>
    ${years.map(
      (y) => html`<section class="archive-year">
      <h2 id="year-${y.year}">${y.year} <span class="count">${m.archiveCounts(y.posts, y.activities)}</span></h2>
      ${y.months.map(
        (month) => html`<section class="archive-month">
        <h3>${m.monthName(month.month)} <span class="count">${m.archiveCounts(month.posts, month.activities)}</span></h3>
        <ul class="archive-list">${month.entries.map((entry) =>
          entry.kind === "post"
            ? archivePostLine(locale, entry.date, entry.post)
            : archiveActivityLine(locale, entry.activity),
        )}</ul>
      </section>`,
      )}
    </section>`,
    )}`}`;
  const math = years.some((y) => y.months.some((mo) => mo.entries.some((e) => e.kind === "activity" && hasMath(e.activity.bodyHtml))));
  return layout({ site, locale, title: m.archiveHeading, path: ARCHIVE_PATH, math, section: "archive", body });
}

/** 활동 꼬리표 (비었으면 기본 "활동"/"Activity") */
function activityBadge(locale: Locale, activity: Pick<ArchiveActivity, "label" | "labelLang">): Html {
  return html`<span class="activity-badge"${activity.labelLang ? html` lang="${activity.labelLang}"` : ""}>${activity.label ?? MESSAGES[locale].activityBadge}</span>`;
}

/** 아카이브의 활동 한 줄: 내용이 있으면 <details>(닫힘) 안에, 없으면 한 줄 (설계 15-8) */
function archiveActivityLine(locale: Locale, activity: ArchiveActivity): Html {
  const head = html`<time datetime="${activity.date}">${activity.date.slice(5)}</time> ${activityBadge(locale, activity)} <span class="archive-activity-title"${activity.titleLang ? html` lang="${activity.titleLang}"` : ""}>${activity.title}</span>`;
  const id = activityAnchor(activity.id);
  if (!activity.bodyHtml) return html`<li class="archive-activity" id="${id}"><p class="archive-activity-head">${head}</p></li>`;
  return html`<li class="archive-activity has-body" id="${id}"><details class="archive-activity-toggle">
            <summary class="archive-activity-head">${head}</summary>
            <div class="post-body archive-activity-body"${activity.bodyLang ? html` lang="${activity.bodyLang}"` : ""}>${raw(activity.bodyHtml)}</div>
          </details></li>`;
}

/** 아카이브의 글 한 줄: 월-일 + 제목 (번역 언어의 미번역 글은 한글 제목 + KR) */
function archivePostLine(locale: Locale, date: string, post: PostCardData): Html {
  const m = MESSAGES[locale];
  const korean = post.untranslated === true && locale !== SOURCE_LOCALE;
  return html`<li class="archive-post"><time datetime="${date}">${date.slice(5)}</time> <a href="${localizedPath(locale, postPath(post.id))}"${korean ? html` lang="ko"` : ""}>${post.title}</a>${korean ? html` <span class="lang-badge" title="${m.koreanOnlyTitle}">${m.koreanOnly}</span>` : ""}</li>`;
}

// ── 검색 (설계 15-7) ─────────────────────────────────

/** 검색 스크립트 주소 (빌드가 src/site/search-client.ts를 묶어 씀) */
export const SEARCH_SCRIPT = "/assets/search.js";

/**
 * 검색 페이지: 입력 칸 + 결과 자리. 찾기는 검색 스크립트가 (검색 파일 둘을 받아서).
 * 화면 글자·파일 주소는 data-* 로 넘김 (스크립트는 언어를 모름). JS가 없으면 안내 + 아카이브 링크
 */
export function searchPage({ site, locale = SOURCE_LOCALE }: { site: SiteConfig; locale?: Locale }): Html {
  const m = MESSAGES[locale];
  const body = html`
    <h1 class="list-heading">${m.searchHeading}</h1>
    <form class="search-form" role="search" action="${localizedPath(locale, SEARCH_PATH)}" method="get"
      data-index="${localizedPath(locale, SEARCH_INDEX_PATH)}" data-body="${localizedPath(locale, SEARCH_BODY_PATH)}"
      data-msg-count="${m.searchCount}" data-msg-more="${m.searchMore}" data-msg-none="${m.searchNone}"
      data-msg-loading="${m.searchLoadingBody}" data-msg-failed="${m.searchFailed}"
      data-badge-activity="${m.activityBadge}" data-badge-kr="${m.koreanOnly}" data-badge-kr-title="${m.koreanOnlyTitle}">
      <label class="search-label" for="search-q">${m.searchLabel}</label>
      <input class="search-input" id="search-q" name="q" type="search" placeholder="${m.searchPlaceholder}" autocomplete="off" autofocus>
    </form>
    <p class="search-status" aria-live="polite"></p>
    <ul class="search-results"></ul>
    <noscript><p class="empty">${m.searchNeedsJs} <a href="${localizedPath(locale, ARCHIVE_PATH)}">${m.archiveHeading}</a></p></noscript>`;
  return layout({ site, locale, title: m.searchHeading, path: SEARCH_PATH, moduleScript: SEARCH_SCRIPT, section: "search", body });
}

// ── 없는 주소 ────────────────────────────────────────

/** 404 하나를 모든 언어가 같이 쓴다 (정적 파일 규칙상 하나뿐) → 두 언어 문구를 함께 */
export function notFoundPage({ site }: { site: SiteConfig }): Html {
  const body = html`
    <h1 class="list-heading">페이지를 찾을 수 없어요</h1>
    <p>주소가 바뀌었거나 지워진 글일 수 있어요. <a href="/">글 목록으로</a></p>
    <p lang="en">Page not found. The address may have changed or the post was removed. <a href="${localizedPath("en", "/")}">Back to posts</a></p>`;
  return layout({ site, title: "페이지를 찾을 수 없어요", path: "/404", noindex: true, body });
}

// ── 도우미 ──────────────────────────────────────────

/** "/posts/1" → "https://taerim.page/posts/1". 이미 절대 주소면 그대로 */
export function absoluteUrl(site: SiteConfig, path: string): string {
  return /^https?:\/\//.test(path) ? path : `${site.url}${path}`;
}
