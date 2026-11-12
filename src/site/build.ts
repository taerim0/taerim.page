/**
 * 공개 사이트 빌드의 핵심: 공개 글 목록(+ 번역본) → { 주소: 파일 내용 }.
 *
 * 순수 함수다. 데이터를 어디서 읽는지(D1), 파일을 어디에 어떤 이름으로 쓰는지는 모른다 (그건 빌드 스크립트 몫).
 * 그래서 테스트에서는 글 목록만 넣어 결과를 바로 확인할 수 있다.
 */
import { DEFAULT_SETTINGS } from "../settings/settings.ts";
import type { SiteSettings } from "../settings/settings.ts";
import type { Activity } from "../activities/activities.ts";
import { byNewestActivity } from "../activities/activities.ts";
import { renderDocument, renderMarkdown } from "../markdown/index.ts";
import { compareTagNames } from "../posts/tag-order.ts";
import { TagTree } from "../posts/tag-tree.ts";
import { kindOf } from "../posts/types.ts";
import type { Post, TagCount, TagParent } from "../posts/types.ts";
import type { ImageInfo } from "../images/types.ts";
import type { PublishedTranslation } from "../translations/types.ts";
import { formatDate, formatDay, LOCALES, localizedPath, SOURCE_LOCALE } from "./i18n.ts";
import type { Locale } from "./i18n.ts";
import { imageSizeMap } from "./images.ts";
import type { ImageSize } from "./images.ts";
import { groupArchive, postDate } from "./archive.ts";
import { htmlToText } from "./search.ts";
import { computeStats } from "./stats.ts";
import type { SiteStats } from "./stats.ts";
import type { SearchBodies, SearchIndex, SearchItem } from "./search.ts";
import type { ArchiveActivity } from "./archive.ts";
import { ARCHIVE_PATH, activityAnchor, entryPath, NOTES_PATH, notePath, pagePath, postPath, POSTS_PATH, SEARCH_BODY_PATH, SEARCH_INDEX_PATH, SEARCH_PATH, STATS_PATH, tagPath, TAGS_PATH } from "./paths.ts";
import { absoluteUrl, archivePage, searchPage, statsPage, HOME_ACTIVITY_COUNT, HOME_NOTE_COUNT, HOME_POST_COUNT, homePage, listPage, notesPage, notFoundPage, postPage, tagsPage, untranslatedPostPage } from "./templates.ts";
import type { Html, ListBrowse, PostCardData, SiteConfig, TagNav } from "./templates.ts";

/** 목록 한 페이지의 글 수 (관리자 목록과 같은 10개) */
export const SITE_PAGE_SIZE = 10;
/** RSS에 넣는 최신 글 수 */
export const RSS_ITEM_COUNT = 20;
/** 없는 주소일 때 보여줄 페이지의 주소 */
export const NOT_FOUND_PATH = "/404";

export interface BuildInput {
  site: SiteConfig;
  /** 사이트 설정 (설계 15-3). 지금은 사이트 소개만 반영, 홈 소개 카드·바닥글은 2단계 */
  settings?: SiteSettings;
  /** 활동 (설계 15-5): 아카이브에 글과 섞이고 홈에 최근 몇 개 */
  activities?: Activity[];
  /** 공개 글들 (본문 포함). 초안·휴지통 글이 섞여 있어도 여기서 한 번 더 걸러낸다 */
  posts: Post[];
  /** 공개된 번역본들 (언어 섞여도 됨). 공개된 한글 글의 것만 쓴다 (설계 12-11) */
  translations?: readonly PublishedTranslation[];
  /** 글이 쓰는 블로그 이미지 정보 → <img width height>. 없으면 크기 없이 (파일 복사는 빌드 스크립트 몫) */
  images?: readonly ImageInfo[];
  /** 태그 상하관계 (설계 14). 글의 태그에 상위 태그를 붙여 보여 주고, 태그 모음·태그 페이지를 트리로 */
  tagParents?: readonly TagParent[];
  /** 글 id → 조회 수 (설계 2-2, 한·영 합계). 없으면 숫자 없이 */
  views?: ReadonlyMap<number, number>;
  /** 통계 잔디의 GitHub 날짜별 기여 수 (설계 15-9). 없으면(못 받음·설정 없음) GitHub 없이 */
  github?: ReadonlyMap<string, number> | null;
  /** 빌드한 날 (한국 날짜 YYYY-MM-DD, 통계의 "오늘"). 없으면 지금 */
  today?: string;
}

/** 언어 하나의 글: 글 + 그 언어 번역본(없으면 undefined) */
interface LocalizedPost {
  post: Post;
  translation?: PublishedTranslation;
}

/**
 * 사이트 전체를 만든다. 한국어 페이지들 + 번역 언어마다 같은 구성의 /{언어}/… 페이지들 (설계 12-11)
 * @returns 주소("/", "/posts/7", "/en/posts/7", "/rss.xml" …) → 파일 내용. 주소 순서는 정해져 있지 않다
 */
/** 코드 설정 + 관리자 사이트 설정 → 빌드에 쓸 설정 (사이트 소개는 관리자 설정이 이김, 영어가 비면 한국어) */
export function applySettings(site: SiteConfig, settings: SiteSettings | undefined): SiteConfig {
  if (!settings) return site;
  return {
    ...site,
    description: settings.description,
    descriptions: { ...site.descriptions, en: settings.descriptionEn ?? settings.description },
    profile: settings,
  };
}

export async function buildSite({ site: baseSite, settings, activities = [], posts, translations = [], images = [], tagParents = [], views, github = null, today = formatDate(new Date().toISOString(), SOURCE_LOCALE) }: BuildInput): Promise<Map<string, string>> {
  const site = applySettings(baseSite, settings);
  const imageSizes = imageSizeMap(images);
  const tree = new TagTree(tagParents);
  // 글의 태그 = 직접 고른 태그 + 상위 태그 (트리 순). 이후 목록·태그 페이지·개수·RSS가 모두 이걸로 → #개발 목록에 #react 글도
  const published = posts
    .filter((post) => post.status === "published" && post.deletedAt === null && post.publishedAt !== null)
    .map((post) => ({ ...post, tags: tree.withAncestors(post.tags) }))
    .sort(byNewest);
  // 설계 17: 글(다른 사람이 읽는 글) / 노트(공부 정리). 홈·/posts·RSS는 글만, /notes는 노트만, 태그·아카이브·검색은 둘 다
  const publishedPosts = published.filter((post) => kindOf(post) === "post");
  const publishedNotes = published.filter((post) => kindOf(post) === "note");
  const files = new Map<string, string>();
  /** 검색 엔진에 넣지 않는 페이지 (sitemap에서 뺌) */
  const noindex = new Set<string>([NOT_FOUND_PATH]);
  /** sitemap의 lastmod (글 페이지만) */
  const lastmod = new Map<string, string>();
  const add = async (path: string, page: Html) => files.set(path, String(await page));

  // 언어별 번역본: 글 id → 번역본
  const byLocale = new Map<Locale, Map<number, PublishedTranslation>>();
  for (const translation of translations) {
    let map = byLocale.get(translation.lang);
    if (!map) byLocale.set(translation.lang, (map = new Map()));
    map.set(translation.postId, translation);
  }
  /** 이 글이 있는 언어들 (hreflang) */
  const localesOf = (id: number) => LOCALES.filter((l) => l === SOURCE_LOCALE || byLocale.get(l)?.has(id));
  const tags = countTags(published);
  /** 글 목록·태그 페이지 왼쪽 카드 (설계 16-9) */
  const browse: ListBrowse = {
    total: publishedPosts.length,
    tags,
    years: [...new Set(publishedPosts.map((post) => Number(formatDate(post.publishedAt!, SOURCE_LOCALE).slice(0, 4))))].sort((a, b) => b - a),
  };
  /** 통계 (설계 15-9): 한국어 본문 글자는 한국어 차례에서 모으고, 수치는 언어와 상관없이 한 번만 셈 */
  const koreanTexts = new Map<number, string>();
  let stats: SiteStats | null = null;
  const sortedActivities = [...activities].sort(byNewestActivity);

  for (const locale of LOCALES) {
    const localized: LocalizedPost[] = published.map((post) => ({ post, translation: byLocale.get(locale)?.get(post.id) }));
    const cards = new Map(localized.map((item) => [item.post.id, toCard(locale, item)]));
    const cardsOf = (list: Post[]) => list.map((post) => cards.get(post.id)!);

    // 홈 (설계 15-4): 소개 카드 + 태그 트리 + 최신 글. 전체 목록은 /posts (10개씩)
    const profile = site.profile ?? { ...DEFAULT_SETTINGS, name: site.name };
    const archiveActivities = sortedActivities.map((activity) => localizeActivity(activity, locale, imageSizes));
    await add(
      localizedPath(locale, "/"),
      homePage({ site, locale, profile, posts: cardsOf(publishedPosts.slice(0, HOME_POST_COUNT)), tags, tree, imageSizes, activities: archiveActivities.slice(0, HOME_ACTIVITY_COUNT), notes: cardsOf(publishedNotes.slice(0, HOME_NOTE_COUNT)) }),
    );
    // 아카이브 (설계 15-5): 글 + 활동을 연 → 월로
    await add(localizedPath(locale, ARCHIVE_PATH), archivePage({ site, locale, years: groupArchive(cardsOf(published), archiveActivities) }));
    for (const [path, page] of listPages(site, locale, cardsOf(publishedPosts), POSTS_PATH, imageSizes, undefined, undefined, browse)) await add(path, page);
    // 노트 목록 (설계 17): 한 줄씩, 한 페이지
    await add(localizedPath(locale, NOTES_PATH), notesPage({ site, locale, notes: cardsOf(publishedNotes) }));

    // 글: 한국어 / 번역본 / 미번역(한글을 흐리게 + 안내)
    /** 검색용 본문 HTML (글 id → 이 언어 페이지에 보이는 본문) */
    const bodyHtmlOf = new Map<number, string>();
    for (const { post, translation } of localized) {
      const path = localizedPath(locale, entryPath(post));
      // 이전 = 더 옛날 글(목록에서 다음 칸), 다음 = 더 새 글 (설계 15-6). 같은 종류 안에서만 (설계 17)
      const sameKind = localized.filter((item) => kindOf(item.post) === kindOf(post));
      const index = sameKind.findIndex((item) => item.post.id === post.id);
      const neighbors = { prev: sameKind[index + 1] && cards.get(sameKind[index + 1]!.post.id), next: sameKind[index - 1] && cards.get(sameKind[index - 1]!.post.id) };
      if (locale === SOURCE_LOCALE) {
        const { html, toc } = renderDocument(post.body, { imageSizes });
        bodyHtmlOf.set(post.id, html);
        await add(path, postPage({ site, post, bodyHtml: html, toc, alternates: localesOf(post.id), neighbors, views: views?.get(post.id) }));
        lastmod.set(path, post.updatedAt);
      } else if (translation) {
        const { html, toc } = renderDocument(translation.body, { imageSizes, locale });
        const translated = { ...post, title: translation.title, summary: translation.summary };
        bodyHtmlOf.set(post.id, html);
        await add(path, postPage({ site, locale, post: translated, bodyHtml: html, toc, alternates: localesOf(post.id), neighbors, views: views?.get(post.id) }));
        lastmod.set(path, translation.updatedAt);
      } else {
        const { html } = renderDocument(post.body, { imageSizes });
        bodyHtmlOf.set(post.id, html);
        await add(path, untranslatedPostPage({ site, locale, post, bodyHtml: html }));
        noindex.add(path);
      }
    }

    // 태그 모음 + 태그별 목록 (태그 이름은 번역하지 않음)
    await add(localizedPath(locale, TAGS_PATH), tagsPage({ site, locale, tags, tree }));
    for (const { name } of tags) {
      const tagged = publishedPosts.filter((post) => post.tags.includes(name));
      const taggedNotes = publishedNotes.filter((post) => post.tags.includes(name));
      // 태그 페이지 위: 상위 경로 / 아래: 하위 태그 (글이 있는 것만)
      const nav = { ancestors: tree.ancestorsOf(name), children: tags.filter((tag) => tree.parentOf(tag.name) === name) };
      for (const [path, page] of listPages(site, locale, cardsOf(tagged), tagPath(name), imageSizes, name, nav, browse, cardsOf(taggedNotes))) await add(path, page);
    }

    // 통계 (설계 15-9): 첫 차례(한국어)에서 본문 글자를 모은 뒤 셈
    if (locale === SOURCE_LOCALE) for (const [id, bodyHtml] of bodyHtmlOf) koreanTexts.set(id, htmlToText(bodyHtml, Number.POSITIVE_INFINITY));
    stats ??= computeStats({
      posts: published,
      activities,
      translatedIds: new Set(translations.filter((t) => published.some((p) => p.id === t.postId)).map((t) => t.postId)),
      bodyTexts: koreanTexts,
      tags,
      today,
      github,
    });
    await add(localizedPath(locale, STATS_PATH), statsPage({ site, locale, stats }));

    // 검색 (설계 15-7): 페이지 + 검색 파일 둘 (제목·태그·요약 / 본문)
    await add(localizedPath(locale, SEARCH_PATH), searchPage({ site, locale }));
    const search = searchFiles(locale, cardsOf(published), bodyHtmlOf, archiveActivities);
    files.set(localizedPath(locale, SEARCH_INDEX_PATH), JSON.stringify(search.index));
    files.set(localizedPath(locale, SEARCH_BODY_PATH), JSON.stringify(search.bodies));

    // RSS: 번역 언어는 번역된 글만
    // RSS는 글만 (설계 17: 노트는 나를 위한 정리)
    const feed = localized.filter((item) => kindOf(item.post) === "post" && (locale === SOURCE_LOCALE || item.translation)).slice(0, RSS_ITEM_COUNT);
    files.set(localizedPath(locale, "/rss.xml"), rss(site, locale, feed));
  }

  // 404는 하나 (정적 파일 규칙상), 두 언어 문구
  await add(NOT_FOUND_PATH, notFoundPage({ site }));
  files.set("/sitemap.xml", sitemap(site, [...files.keys()], noindex, lastmod));
  return files;
}

/** 검색 파일 내용: 글(최신 순) 다음 활동(최신 순). 본문은 HTML을 걷어낸 글자 */
function searchFiles(locale: Locale, cards: PostCardData[], bodyHtmlOf: ReadonlyMap<number, string>, activities: ArchiveActivity[]): { index: SearchIndex; bodies: SearchBodies } {
  const korean = (untranslated: boolean) => (untranslated && locale !== SOURCE_LOCALE ? { l: SOURCE_LOCALE, kr: true as const } : {});
  const items: SearchItem[] = [];
  const bodies: string[] = [];
  for (const card of cards) {
    const date = postDate(card);
    items.push({
      k: card.kind === "note" ? "note" : "post",
      u: localizedPath(locale, entryPath(card)),
      t: card.title,
      d: date,
      dt: formatDay(date, locale),
      g: card.tags,
      s: card.summary ?? "",
      ...korean(card.untranslated === true),
    });
    bodies.push(htmlToText(bodyHtmlOf.get(card.id) ?? ""));
  }
  for (const activity of activities) {
    items.push({
      k: "activity",
      u: `${localizedPath(locale, ARCHIVE_PATH)}#${activityAnchor(activity.id)}`,
      t: activity.title,
      ...(activity.label ? { b: activity.label } : {}),
      d: activity.date,
      dt: formatDay(activity.date, locale),
      g: [],
      s: "",
      ...(activity.titleLang ? { l: activity.titleLang } : {}),
      // 영어 페이지에서 한국어로 보이는 활동 (설계 16-7)
      ...(locale !== SOURCE_LOCALE && (activity.titleLang || activity.bodyLang) ? { kr: true as const } : {}),
    });
    bodies.push(htmlToText(activity.bodyHtml));
  }
  return { index: { items }, bodies: { b: bodies } };
}

/** 활동을 그 언어로: 영어 꼬리표가 없으면 한국어 꼬리표(lang=ko) → 그것도 없으면 null(기본 글자). 영어 제목이 없으면 한국어 그대로(lang=ko), 영어 내용이 없으면 한국어 내용 */
function localizeActivity(activity: Activity, locale: Locale, imageSizes: ReadonlyMap<string, ImageSize>): ArchiveActivity {
  const english = locale !== SOURCE_LOCALE;
  const title = english && activity.titleEn ? activity.titleEn : activity.title;
  const translatedBody = english && activity.bodyEn !== null;
  const body = translatedBody ? activity.bodyEn! : activity.body;
  const label = english ? (activity.labelEn ?? activity.label) : activity.label;
  return {
    id: activity.id,
    date: activity.date,
    label,
    labelLang: english && !activity.labelEn && activity.label ? SOURCE_LOCALE : null,
    title,
    titleLang: english && !activity.titleEn ? SOURCE_LOCALE : null,
    bodyHtml: body.trim() === "" ? "" : renderMarkdown(body, { imageSizes, locale: translatedBody || !english ? locale : SOURCE_LOCALE }),
    bodyLang: english && !translatedBody ? SOURCE_LOCALE : null,
  };
}

/** 최신 공개 순 (같으면 id가 큰 글이 앞). 관리자 목록의 "공개" 정렬과 같다 */
function byNewest(a: Post, b: Post): number {
  return a.publishedAt! < b.publishedAt! ? 1 : a.publishedAt! > b.publishedAt! ? -1 : b.id - a.id;
}

/** 목록 카드: 번역 언어면 번역본 제목·요약, 번역이 없으면 한글 그대로 + untranslated */
function toCard(locale: Locale, { post, translation }: LocalizedPost): PostCardData {
  const { body: _body, ...rest } = post;
  if (locale === SOURCE_LOCALE) return rest;
  return translation ? { ...rest, title: translation.title, summary: translation.summary } : { ...rest, untranslated: true };
}

/**
 * 종류를 바꾼 글의 옛 주소를 옮기는 규칙 (설계 17, _redirects 줄들). 공개 글마다 반대쪽 주소 → 지금 주소 301.
 * 빌드 스크립트가 site-static/_redirects 뒤에 붙인다 (그 글이 처음부터 그 종류였어도 해롭지 않음)
 */
export function kindRedirects(posts: readonly Post[]): string[] {
  const lines: string[] = [];
  for (const post of posts) {
    if (post.status !== "published" || post.deletedAt !== null) continue;
    const [from, to] = kindOf(post) === "note" ? [postPath(post.id), notePath(post.id)] : [notePath(post.id), postPath(post.id)];
    for (const locale of LOCALES) lines.push(`${localizedPath(locale, from)} ${localizedPath(locale, to)} 301`);
  }
  return lines;
}

/** 목록을 10개씩 끊어 페이지들을 만든다. 글이 없어도 1페이지는 만든다 ("아직 글이 없어요") */
function* listPages(
  site: SiteConfig,
  locale: Locale,
  cards: PostCardData[],
  listPath: string,
  imageSizes: ReadonlyMap<string, ImageSize>,
  tag?: string,
  tagNav?: TagNav,
  browse?: ListBrowse,
  /** 태그 페이지의 노트 (설계 17, 첫 페이지에만) */
  notes: PostCardData[] = [],
): Generator<[string, Html]> {
  const totalPages = Math.ceil(cards.length / SITE_PAGE_SIZE);
  for (let page = 1; page <= Math.max(totalPages, 1); page++) {
    const items = cards.slice((page - 1) * SITE_PAGE_SIZE, page * SITE_PAGE_SIZE);
    yield [
      localizedPath(locale, pagePath(listPath, page)),
      listPage({ site, locale, posts: items, pagination: { page, totalPages, listPath }, tag, tagNav, imageSizes, browse, notes: page === 1 ? notes : [] }),
    ];
  }
}

/** 공개 글 기준 태그별 개수, 이름순 (관리자 태그 목록과 같은 순서) */
function countTags(posts: Post[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const post of posts) for (const tag of post.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => compareTagNames(a.name, b.name));
}

// ── RSS·sitemap ─────────────────────────────────────

/** RSS 2.0. 글 내용은 소개글만 (전문은 사이트에서). 번역 언어는 번역본 제목·소개 */
function rss(site: SiteConfig, locale: Locale, items: LocalizedPost[]): string {
  const entries = items.map(({ post, translation }) => {
    const link = absoluteUrl(site, localizedPath(locale, postPath(post.id)));
    const title = translation ? translation.title : post.title;
    const summary = translation ? translation.summary : post.summary;
    return `    <item>
      <title>${xml(title)}</title>
      <link>${xml(link)}</link>
      <guid isPermaLink="true">${xml(link)}</guid>
      <pubDate>${new Date(post.publishedAt!).toUTCString()}</pubDate>
${summary ? `      <description>${xml(summary)}</description>\n` : ""}${post.tags.map((tag) => `      <category>${xml(tag)}</category>\n`).join("")}    </item>`;
  });
  const newest = items[0]?.post;
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xml(site.name)}</title>
    <link>${xml(absoluteUrl(site, localizedPath(locale, "/")))}</link>
    <description>${xml(site.descriptions?.[locale] ?? site.description)}</description>
    <language>${locale}</language>
${newest ? `    <lastBuildDate>${new Date(newest.publishedAt!).toUTCString()}</lastBuildDate>\n` : ""}${entries.join("\n")}${entries.length ? "\n" : ""}  </channel>
</rss>
`;
}

/**
 * sitemap: 만든 HTML 페이지 전부(404·미번역 글 페이지 제외). 글은 마지막으로 고친 날짜(lastmod)를 붙인다.
 * 주소는 이미 인코딩된 상태(/tags/%EB%B8%94…)라 그대로 쓴다.
 */
function sitemap(site: SiteConfig, paths: string[], noindex: ReadonlySet<string>, lastmod: ReadonlyMap<string, string>): string {
  const urls = paths
    .filter((path) => !noindex.has(path) && !path.endsWith(".xml") && !path.endsWith(".json"))
    .sort()
    .map((path) => {
      const modified = lastmod.get(path);
      return `  <url><loc>${xml(absoluteUrl(site, path))}</loc>${modified ? `<lastmod>${modified}</lastmod>` : ""}</url>`;
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
