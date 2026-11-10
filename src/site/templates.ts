/**
 * 공개 사이트(taerim.page) 페이지 틀. 빌드가 이 함수들로 정적 HTML을 만든다.
 *
 * - Hono `html` 태그 템플릿: ${…}로 넣는 값은 자동으로 이스케이프된다 (제목에 <b>가 있어도 글자로)
 * - 본문만 `raw(…)`: 렌더러가 HTML을 막고 안전하게 만든 결과이기 때문
 * - 방문자 화면의 JS는 언어 기억용 작은 스크립트 하나뿐 (설계 12-11, i18n.ts의 LANGUAGE_SCRIPT)
 * - 요소에 id를 쓰지 않고 class만 쓴다 → 본문 제목 id(#설치-하기 등)와 겹치지 않게
 * - 언어(locale): 화면 글자는 i18n.ts 사전에서, 주소는 localizedPath로. 생략하면 한국어
 * - 꾸미기는 나중(UI/UX 단계). 지금은 구조와 의미만
 */
import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { TocItem } from "../markdown/index.ts";
import type { Post, TagCount } from "../posts/types.ts";
import { formatDate, LANGUAGE_SCRIPT, LOCALES, localizedPath, MESSAGES, SOURCE_LOCALE } from "./i18n.ts";
import type { Locale } from "./i18n.ts";
import type { ImageSize } from "./images.ts";
import { pagePath, postPath, tagPath, TAGS_PATH } from "./paths.ts";

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
  /** 목록 주소 (한국어 기준: "/" 또는 태그 주소). n페이지 주소는 pagePath(listPath, n), 언어는 템플릿이 붙임 */
  listPath: string;
}

// ── 공통 틀 ─────────────────────────────────────────

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
  /** 검색 엔진에 "같은 페이지의 다른 언어"로 알릴 언어들 (hreflang). 생략하면 모든 언어. 둘 미만이면 넣지 않음 */
  alternates?: readonly Locale[];
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
  <script>${raw(LANGUAGE_SCRIPT)}</script>
</head>
<body>
  <header class="site-header">
    <a class="site-name" href="${localizedPath(locale, "/")}">${site.name}</a>
    <nav class="site-nav">
      <a href="${localizedPath(locale, "/")}">${m.navPosts}</a> <a href="${localizedPath(locale, TAGS_PATH)}">${m.navTags}</a>
      <span class="lang-switch" role="group" aria-label="${m.languageLabel}">${LOCALES.map(
        (l) => html`<a href="${localizedPath(l, props.path)}" hreflang="${l}" lang="${l}" data-set-lang="${l}"${l === locale ? html` aria-current="true"` : ""}>${MESSAGES[l].languageName}</a>`,
      )}</span>
    </nav>
  </header>
  <main class="site-main">
${props.body}
  </main>
  <footer class="site-footer">
    <a href="${localizedPath(locale, "/rss.xml")}">RSS</a>
  </footer>
</body>
</html>
`;
}

function siteDescription(site: SiteConfig, locale: Locale): string {
  return site.descriptions?.[locale] ?? site.description;
}

// ── 목록 (홈·태그별) ─────────────────────────────────

interface ListPageProps {
  site: SiteConfig;
  locale?: Locale;
  posts: PostCardData[];
  pagination: Pagination;
  /** 태그별 목록이면 그 태그 */
  tag?: string;
  /** 이미지 주소 → 원래 크기 (대표 이미지에 width·height). 없으면 크기 없이 */
  imageSizes?: ReadonlyMap<string, ImageSize>;
}

export function listPage({ site, locale = SOURCE_LOCALE, posts, pagination, tag, imageSizes }: ListPageProps): Html {
  const m = MESSAGES[locale];
  const heading = tag === undefined ? null : `#${tag}`;
  const pageSuffix = pagination.page > 1 ? m.pageSuffix(pagination.page) : "";
  const body = html`
    ${heading === null ? "" : html`<h1 class="list-heading">${heading}</h1>`}
    ${posts.length === 0
      ? html`<p class="empty">${m.emptyPosts}</p>`
      : html`<ul class="post-list">${posts.map((post) => postCard(site, locale, post, imageSizes))}</ul>`}
    ${pager(locale, pagination)}`;
  return layout({
    site,
    locale,
    title: heading === null ? (pagination.page > 1 ? `${m.postListTitle}${pageSuffix}` : undefined) : `${heading}${pageSuffix}`,
    description: heading === null ? undefined : m.tagDescription(heading),
    path: pagePath(pagination.listPath, pagination.page),
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
function postMeta(locale: Locale, post: PostCardData): Html {
  return html`<p class="post-meta">
        ${post.publishedAt ? html`<time datetime="${post.publishedAt}">${formatDate(post.publishedAt, locale)}</time>` : ""}
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
}

/**
 * 글 페이지. 목차는 본문 앞에 두고, 넓은 화면에서는 CSS로 옆에 붙인다 (좁으면 제목 아래 그대로).
 * 제목이 하나뿐이거나 없으면 목차를 넣지 않는다.
 */
export function postPage({ site, locale = SOURCE_LOCALE, post, bodyHtml, toc, alternates }: PostPageProps): Html {
  return layout({
    site,
    locale,
    title: post.title,
    description: post.summary ?? undefined,
    path: postPath(post.id),
    image: post.thumbnail,
    type: "article",
    alternates,
    body: article(locale, post, bodyHtml, toc),
  });
}

/** 글 본문 덩어리 (글 페이지와 미번역 페이지가 같이 씀) */
function article(locale: Locale, post: Post, bodyHtml: string, toc: TocItem[]): Html {
  const items = toc.filter((item) => item.level <= TOC_MAX_LEVEL);
  const minLevel = Math.min(...items.map((item) => item.level));
  return html`
    <article class="post">
      <header class="post-header">
        <h1 class="post-title">${post.title}</h1>
        ${postMeta(locale, post)}
      </header>
      ${items.length < 2
        ? ""
        : html`<nav class="toc" aria-label="${MESSAGES[locale].toc}">
        <p class="toc-title">${MESSAGES[locale].toc}</p>
        <ol>${items.map(
          (item) => html`<li class="toc-level-${item.level - minLevel + 1}"><a href="#${item.id}">${item.text}</a></li>`,
        )}</ol>
      </nav>`}
      <div class="post-body">
${raw(bodyHtml)}
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
      <div class="untranslated-content" lang="ko" inert aria-hidden="true">${article(SOURCE_LOCALE, post, bodyHtml, [])}
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
  return layout({ site, locale, title: post.title, path: postPath(post.id), image: post.thumbnail, noindex: true, body });
}

// ── 태그 모음 ────────────────────────────────────────

export function tagsPage({ site, locale = SOURCE_LOCALE, tags }: { site: SiteConfig; locale?: Locale; tags: TagCount[] }): Html {
  const m = MESSAGES[locale];
  const body = html`
    <h1 class="list-heading">${m.tagsHeading}</h1>
    ${tags.length === 0
      ? html`<p class="empty">${m.emptyTags}</p>`
      : html`<ul class="tag-cloud">${tags.map(
          (tag) =>
            html`<li><a class="tag" href="${localizedPath(locale, tagPath(tag.name))}">#${tag.name} <span class="count">${tag.count}</span></a></li>`,
        )}</ul>`}`;
  return layout({ site, locale, title: m.tagsHeading, path: TAGS_PATH, body });
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
