/**
 * 공개 사이트 언어 (설계 12-11).
 * 한국어가 원문, 번역 언어(TRANSLATION_LANGS)는 주소 앞에 /{언어}를 붙인 같은 페이지들로 만든다.
 * 화면 글자는 모두 이 사전에서 꺼낸다 (템플릿에 글자를 직접 쓰지 않음).
 */
import { TRANSLATION_LANGS } from "../translations/types.ts";
import type { TranslationLang } from "../translations/types.ts";

/** 사이트 언어. 코드는 <html lang>·hreflang 값과 같다 */
export type Locale = "ko" | TranslationLang;

/** 원문 언어 */
export const SOURCE_LOCALE = "ko" satisfies Locale;

/** 모든 언어 (원문 먼저) — 언어 선택 순서 */
export const LOCALES: readonly Locale[] = [SOURCE_LOCALE, ...TRANSLATION_LANGS];

/**
 * 같은 페이지의 그 언어 주소. 한국어는 그대로, 번역 언어는 앞에 /{언어}
 * 예) ("en", "/") → "/en", ("en", "/posts/7") → "/en/posts/7", ("ko", "/tags") → "/tags"
 */
export function localizedPath(locale: Locale, path: string): string {
  if (locale === SOURCE_LOCALE) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** 화면 글자 */
export interface Messages {
  /** 언어 선택에 보일 이름 (그 언어로) */
  languageName: string;
  languageLabel: string;
  navPosts: string;
  navTags: string;
  postListTitle: string;
  emptyPosts: string;
  emptyTags: string;
  tagsHeading: string;
  pageSuffix: (page: number) => string;
  tagDescription: (heading: string) => string;
  prev: string;
  next: string;
  pagerLabel: string;
  toc: string;
  /** 번역 언어 목록에서 아직 번역 안 된 글 표시 */
  koreanOnly: string;
  koreanOnlyTitle: string;
  /** 라이트/다크 바꾸기 버튼 (설계 13-7) */
  themeToggle: string;
  /** 번역 안 된 글 팝업 (번역 언어에만 쓰임) */
  untranslatedTitle: string;
  readInKorean: string;
  backToPosts: string;
  /** 홈 (설계 15-4) */
  latestPosts: string;
  allPosts: string;
  profileLabel: string;
  /** 이메일 앞 글자 "Contact" (링크 없이 글로만, 2026-11-11) */
  contact: string;
  /** 아카이브·활동 (설계 15-5, 15-8) */
  navArchive: string;
  archiveHeading: string;
  archiveYears: string;
  /** "글 3 · 활동 1" (0인 쪽은 뺌) */
  archiveCounts: (posts: number, activities: number) => string;
  monthName: (month: number) => string;
  activityBadge: string;
  recentActivities: string;
  viewArchive: string;
  /** 이전·다음 글 (설계 15-6) */
  postNavLabel: string;
  /** 조회 수 (설계 2-2) */
  views: (n: number) => string;
  /** 반응·댓글 (설계 2-1) */
  commentsHeading: string;
  commentsNeedJs: string;
  prevPost: string;
  nextPost: string;
  /** 검색 (설계 15-7) */
  navSearch: string;
  searchHeading: string;
  searchLabel: string;
  searchPlaceholder: string;
  /** 검색 스크립트가 쓰는 글자 ({n} = 개수) */
  searchCount: string;
  searchMore: string;
  searchNone: string;
  searchLoadingBody: string;
  searchFailed: string;
  searchNeedsJs: string;
}

export const MESSAGES: Record<Locale, Messages> = {
  ko: {
    languageName: "한국어",
    languageLabel: "언어",
    navPosts: "글",
    navTags: "태그",
    postListTitle: "글 목록",
    emptyPosts: "아직 글이 없어요.",
    emptyTags: "아직 태그가 없어요.",
    tagsHeading: "태그",
    pageSuffix: (page) => ` (${page}쪽)`,
    tagDescription: (heading) => `${heading} 태그가 붙은 글`,
    prev: "‹ 이전",
    next: "다음 ›",
    pagerLabel: "페이지",
    toc: "목차",
    koreanOnly: "KR",
    koreanOnlyTitle: "아직 번역되지 않은 글 (한국어)",
    themeToggle: "다크 모드",
    untranslatedTitle: "아직 번역되지 않은 글입니다.",
    readInKorean: "한국어로 읽기",
    backToPosts: "홈으로",
    latestPosts: "최신 글",
    allPosts: "전체 글 보기 →",
    profileLabel: "소개",
    contact: "Contact",
    navArchive: "아카이브",
    archiveHeading: "아카이브",
    archiveYears: "연도",
    archiveCounts: (posts, activities) => [posts > 0 ? `글 ${posts}` : "", activities > 0 ? `활동 ${activities}` : ""].filter(Boolean).join(" · "),
    monthName: (month) => `${month}월`,
    activityBadge: "활동",
    recentActivities: "최근 활동",
    viewArchive: "아카이브 전체 보기 →",
    postNavLabel: "이전·다음 글",
    commentsHeading: "반응·댓글",
    views: (n) => `조회 ${n.toLocaleString("ko-KR")}`,
    commentsNeedJs: "반응·댓글은 JavaScript가 필요해요. 토론은 여기서 볼 수 있어요:",
    prevPost: "← 이전 글",
    nextPost: "다음 글 →",
    navSearch: "검색",
    searchHeading: "검색",
    searchLabel: "찾을 말",
    searchPlaceholder: "제목·태그·내용으로 찾기",
    searchCount: "{n}개 찾았어요",
    searchMore: "{n}개 찾았어요 (앞의 50개만 보여요. 낱말을 더 넣어 보세요)",
    searchNone: "찾은 글이 없어요.",
    searchLoadingBody: "본문 불러오는 중… (지금은 제목·태그·요약에서만 찾았어요)",
    searchFailed: "검색 파일을 불러오지 못했어요. 새로고침해 보세요.",
    searchNeedsJs: "검색은 JavaScript가 필요해요.",
  },
  en: {
    languageName: "English",
    languageLabel: "Language",
    navPosts: "Posts",
    navTags: "Tags",
    postListTitle: "Posts",
    emptyPosts: "No posts yet.",
    emptyTags: "No tags yet.",
    tagsHeading: "Tags",
    pageSuffix: (page) => ` (page ${page})`,
    tagDescription: (heading) => `Posts tagged ${heading}`,
    prev: "‹ Prev",
    next: "Next ›",
    pagerLabel: "Pages",
    toc: "Contents",
    koreanOnly: "KR",
    koreanOnlyTitle: "Not translated yet (Korean only)",
    themeToggle: "Dark mode",
    untranslatedTitle: "This post hasn't been translated yet.",
    readInKorean: "Read in Korean",
    backToPosts: "Go to homepage",
    latestPosts: "Latest posts",
    allPosts: "All posts →",
    profileLabel: "About",
    contact: "Contact",
    navArchive: "Archive",
    archiveHeading: "Archive",
    archiveYears: "Years",
    archiveCounts: (posts, activities) =>
      [posts > 0 ? `${posts} ${posts === 1 ? "post" : "posts"}` : "", activities > 0 ? `${activities} ${activities === 1 ? "activity" : "activities"}` : ""].filter(Boolean).join(" · "),
    monthName: (month) => new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, month - 1, 1))),
    activityBadge: "Activity",
    recentActivities: "Recent activity",
    viewArchive: "View full archive →",
    postNavLabel: "Previous and next posts",
    commentsHeading: "Reactions & comments",
    views: (n) => `${n.toLocaleString("en-US")} ${n === 1 ? "view" : "views"}`,
    commentsNeedJs: "Reactions and comments need JavaScript. You can read the discussions here:",
    prevPost: "← Previous",
    nextPost: "Next →",
    navSearch: "Search",
    searchHeading: "Search",
    searchLabel: "Search for",
    searchPlaceholder: "Search titles, tags and content",
    searchCount: "{n} found",
    searchMore: "{n} found (showing the first 50 — try adding more words)",
    searchNone: "Nothing found.",
    searchLoadingBody: "Loading post bodies… (searched titles, tags and summaries only so far)",
    searchFailed: "Couldn't load the search data. Try reloading.",
    searchNeedsJs: "Search needs JavaScript.",
  },
};

/** 날짜 형식 (서울 시간 기준, 빌드하는 컴퓨터의 시간대와 상관없이) */
const DATE_FORMATS: Record<Locale, Intl.DateTimeFormat> = {
  // sv-SE = 2026-11-08 모양
  ko: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }),
  en: new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "short", day: "numeric" }),
};

/** 한국 날짜(YYYY-MM-DD) → 그 언어 날짜 글자 ("2026-11-08" / "Nov 8, 2026") */
export function formatDay(day: string, locale: Locale = SOURCE_LOCALE): string {
  return formatDate(`${day}T12:00:00+09:00`, locale);
}

/** ISO 시각 → "2026-11-08" / "Nov 8, 2026" */
export function formatDate(iso: string, locale: Locale = SOURCE_LOCALE): string {
  return DATE_FORMATS[locale].format(new Date(iso));
}

/**
 * 공개 사이트의 유일한 스크립트 (<head> 끝에 그대로, 화면을 그리기 전에 실행되어 깜빡임 없음)
 *
 * 언어 기억·자동 이동 (설계 12-11)
 * - 머리글 언어 선택(data-set-lang)을 누르면 그 언어를 기억
 * - 기억한 언어가 이 페이지 언어와 다르면 같은 페이지의 그 언어 주소(<html data-path-{언어}>)로 바로 이동
 * - 주소에 ?lang= 이 있으면 이동하지 않음 (미번역 팝업의 [한국어로 읽기] 등 한 번만 다른 언어로 볼 때)
 * - 저장이 막힌 브라우저는 아무것도 안 함. 봇은 이동을 따라가지 않음
 *
 * 코드 복사 (설계 13-6)
 * - <html>에 js 표시 → CSS가 복사 버튼을 보여 줌 (JS가 꺼지면 버튼이 안 보임)
 * - 복사 버튼을 누르면 코드 블록의 줄마다 .code-text, 지운 줄(.line-del)은 빼고 클립보드에 → 잠깐 data-copied
 *   (관리자 미리보기 admin-ui/assets/code-blocks.js와 같은 규칙)
 *
 * 라이트/다크 (설계 13-7)
 * - 기본은 기기 설정 (CSS의 prefers-color-scheme). 머리글 버튼(data-theme-toggle)을 누르면 반대 모드로 바꾸고 기억
 * - 기억한 모드는 그리기 전에 <html data-theme="light|dark">로 → 깜빡임 없음. CSS가 data-theme을 기기 설정보다 먼저 봄
 * - 버튼의 aria-pressed = 지금 다크인지
 *
 * 홈 태그 트리 (설계 15-4)
 * - 글 페이지 목차(<details class="toc" open>, 설계 16-3)를 좁은 화면(799px 이하)이면 처음에 접음. JS가 꺼지면 펼친 채 (홈 태그 카드는 접기 없음)
 *
 * 아카이브 활동 접기 (설계 15-8)
 * - 주소 조각(#activity-n)이 가리키는 곳 안의 <details>를 펼침 (열 때 + 조각이 바뀔 때). 나머지는 닫힌 채
 */
export const SITE_SCRIPT = `(function(){var K="lang",T="theme",d=document.documentElement;d.classList.add("js");try{var m=localStorage.getItem(T);if(m==="dark"||m==="light")d.setAttribute("data-theme",m)}catch(e){}function dark(){var v=d.getAttribute("data-theme");return v==="dark"||(v!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches)}function sync(){var g=document.querySelector("[data-theme-toggle]");if(g)g.setAttribute("aria-pressed",String(dark()))}function hash(){var i=location.hash.slice(1),e=i&&document.getElementById(i),t=e&&e.querySelector("details");if(t)t.open=true}addEventListener("hashchange",hash);document.addEventListener("DOMContentLoaded",function(){sync();hash();if(matchMedia("(max-width: 799px)").matches)[].forEach.call(document.querySelectorAll(".post-side .toc"),function(x){x.removeAttribute("open")})});try{var s=localStorage.getItem(K);if(s&&s!==d.lang&&!/[?&]lang=/.test(location.search)){var p=d.getAttribute("data-path-"+s);if(p){location.replace(p+location.hash);return}}}catch(e){}document.addEventListener("click",function(e){var t=e.target&&e.target.closest?e.target:null;if(!t)return;var a=t.closest("a[data-set-lang]");if(a)try{localStorage.setItem(K,a.getAttribute("data-set-lang"))}catch(x){}if(t.closest("[data-theme-toggle]")){var n=dark()?"light":"dark";d.setAttribute("data-theme",n);try{localStorage.setItem(T,n)}catch(x){}sync();return}var b=t.closest(".code-copy"),c=b&&b.closest(".code-block");if(!c||!navigator.clipboard)return;var l=[].slice.call(c.querySelectorAll(".line")).filter(function(n){return!n.classList.contains("line-del")}).map(function(n){var x=n.querySelector(".code-text");return x?x.textContent:""});navigator.clipboard.writeText(l.join("\\n")).then(function(){b.setAttribute("data-copied","true");setTimeout(function(){b.removeAttribute("data-copied")},1500)})})})();`;
