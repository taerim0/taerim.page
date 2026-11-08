/**
 * 공개 사이트 빌드의 핵심: 공개 글 목록 → { 주소: 파일 내용 }.
 *
 * 순수 함수다. 데이터를 어디서 읽는지(D1), 파일을 어디에 어떤 이름으로 쓰는지는 모른다 (그건 빌드 스크립트 몫).
 * 그래서 테스트에서는 글 목록만 넣어 결과를 바로 확인할 수 있다.
 */
import { renderDocument } from "../markdown/index.ts";
import { compareTagNames } from "../posts/tag-order.ts";
import type { Post, TagCount } from "../posts/types.ts";
import { pagePath, postPath, tagPath, TAGS_PATH } from "./paths.ts";
import { absoluteUrl, listPage, notFoundPage, postPage, tagsPage } from "./templates.ts";
import type { Html, PostCardData, SiteConfig } from "./templates.ts";

/** 목록 한 페이지의 글 수 (관리자 목록과 같은 10개) */
export const SITE_PAGE_SIZE = 10;
/** RSS에 넣는 최신 글 수 */
export const RSS_ITEM_COUNT = 20;
/** 없는 주소일 때 보여줄 페이지의 주소 */
export const NOT_FOUND_PATH = "/404";

export interface BuildInput {
  site: SiteConfig;
  /** 공개 글들 (본문 포함). 초안·휴지통 글이 섞여 있어도 여기서 한 번 더 걸러낸다 */
  posts: Post[];
}

/**
 * 사이트 전체를 만든다.
 * @returns 주소("/", "/posts/7", "/rss.xml" …) → 파일 내용. 주소 순서는 정해져 있지 않다
 */
export async function buildSite({ site, posts }: BuildInput): Promise<Map<string, string>> {
  const published = posts
    .filter((post) => post.status === "published" && post.deletedAt === null && post.publishedAt !== null)
    .sort(byNewest);
  const files = new Map<string, string>();
  const add = async (path: string, page: Html) => files.set(path, String(await page));

  // 홈 = 전체 글 목록 (10개씩)
  for (const [path, page] of listPages(site, published, "/")) await add(path, page);

  // 글
  for (const post of published) {
    const { html, toc } = renderDocument(post.body);
    await add(postPath(post.id), postPage({ site, post, bodyHtml: html, toc }));
  }

  // 태그 모음 + 태그별 목록
  const tags = countTags(published);
  await add(TAGS_PATH, tagsPage({ site, tags }));
  for (const { name } of tags) {
    const tagged = published.filter((post) => post.tags.includes(name));
    for (const [path, page] of listPages(site, tagged, tagPath(name), name)) await add(path, page);
  }

  await add(NOT_FOUND_PATH, notFoundPage({ site }));
  files.set("/rss.xml", rss(site, published.slice(0, RSS_ITEM_COUNT)));
  files.set("/sitemap.xml", sitemap(site, published, [...files.keys()]));
  return files;
}

/** 최신 공개 순 (같으면 id가 큰 글이 앞). 관리자 목록의 "공개" 정렬과 같다 */
function byNewest(a: Post, b: Post): number {
  return a.publishedAt! < b.publishedAt! ? 1 : a.publishedAt! > b.publishedAt! ? -1 : b.id - a.id;
}

/** 목록을 10개씩 끊어 페이지들을 만든다. 글이 없어도 1페이지는 만든다 ("아직 글이 없어요") */
function* listPages(site: SiteConfig, posts: Post[], listPath: string, tag?: string): Generator<[string, Html]> {
  const totalPages = Math.ceil(posts.length / SITE_PAGE_SIZE);
  for (let page = 1; page <= Math.max(totalPages, 1); page++) {
    const items = posts.slice((page - 1) * SITE_PAGE_SIZE, page * SITE_PAGE_SIZE).map(withoutBody);
    yield [pagePath(listPath, page), listPage({ site, posts: items, pagination: { page, totalPages, listPath }, tag })];
  }
}

function withoutBody({ body: _body, ...rest }: Post): PostCardData {
  return rest;
}

/** 공개 글 기준 태그별 개수, 이름순 (관리자 태그 목록과 같은 순서) */
function countTags(posts: Post[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const post of posts) for (const tag of post.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => compareTagNames(a.name, b.name));
}

// ── RSS·sitemap ─────────────────────────────────────

/** RSS 2.0. 글 내용은 소개글만 (전문은 사이트에서) */
function rss(site: SiteConfig, posts: Post[]): string {
  const items = posts.map((post) => {
    const link = absoluteUrl(site, postPath(post.id));
    return `    <item>
      <title>${xml(post.title)}</title>
      <link>${xml(link)}</link>
      <guid isPermaLink="true">${xml(link)}</guid>
      <pubDate>${new Date(post.publishedAt!).toUTCString()}</pubDate>
${post.summary ? `      <description>${xml(post.summary)}</description>\n` : ""}${post.tags.map((tag) => `      <category>${xml(tag)}</category>\n`).join("")}    </item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xml(site.name)}</title>
    <link>${xml(absoluteUrl(site, "/"))}</link>
    <description>${xml(site.description)}</description>
    <language>ko</language>
${posts[0] ? `    <lastBuildDate>${new Date(posts[0].publishedAt!).toUTCString()}</lastBuildDate>\n` : ""}${items.join("\n")}${items.length ? "\n" : ""}  </channel>
</rss>
`;
}

/**
 * sitemap: 만든 HTML 페이지 전부(404 제외). 글은 마지막으로 고친 날짜(lastmod)를 붙인다.
 * 주소는 이미 인코딩된 상태(/tags/%EB%B8%94…)라 그대로 쓴다.
 */
function sitemap(site: SiteConfig, posts: Post[], paths: string[]): string {
  const updatedAt = new Map(posts.map((post) => [postPath(post.id), post.updatedAt]));
  const urls = paths
    .filter((path) => path !== NOT_FOUND_PATH && !path.endsWith(".xml"))
    .sort()
    .map((path) => {
      const lastmod = updatedAt.get(path);
      return `  <url><loc>${xml(absoluteUrl(site, path))}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

/** XML 글자 이스케이프 */
function xml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
