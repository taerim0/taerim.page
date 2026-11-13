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
  postListTitle: string;
  emptyPosts: string;
  emptyTags: string;
  tagsHeading: string;
  pageSuffix: (page: number) => string;
  tagDescription: (heading: string) => string;
  prev: string;
  next: string;
  pagerLabel: string;
  /** 글 목록 왼쪽 카드 (설계 16-9) */
  browseByTag: string;
  byYear: string;
  allShort: string;
  allTags: string;
  toc: string;
  /** 번역 언어 목록에서 아직 번역 안 된 글 표시 */
  koreanOnly: string;
  koreanOnlyTitle: string;
  /** 아카이브에서 펼친 활동 내용이 한국어일 때 맨 위 한 줄 (설계 16-7, 번역 언어에만) */
  activityUntranslated: string;
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
  monthName: (month: number) => string;
  /** 아카이브 줄의 날짜 (달은 따로 보이므로 일만, 설계 16-6) */
  dayOfMonth: (day: number) => string;
  /** 통계 탭 (설계 15-9) */
  navStats: string;
  /** 노트 (설계 17) */
  navNotes: string;
  noteListTitle: string;
  recentNotes: string;
  allNotes: string;
  noteBadge: string;
  emptyNotes: string;
  statsHeading: string;
  statPosts: string;
  statActivities: string;
  statTags: string;
  statTranslated: string;
  statStarted: string;
  statChars: string;
  /** 숫자 뒤 단위 ("개" / "") */
  unitCount: string;
  unitChars: string;
  statsDays: (days: number) => string;
  statsFirst: (date: string) => string;
  topTags: string;
  grassHeading: string;
  grassLabel: string;
  grassLegendBlog: string;
  grassLegendGithub: string;
  grassSummary: (blogDays: number, github: number | null) => string;
  /** 잔디 칸 설명 (마우스를 올리면) */
  grassTitle: (date: string, posts: number, activities: number, github: number | null) => string;
  less: string;
  more: string;
  monthlyHeading: string;
  monthShort: (month: number) => string;
  languagesHeading: string;
  languagesOther: string;
  languagesEmpty: string;
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
    postListTitle: "글 목록",
    emptyPosts: "아직 글이 없어요.",
    emptyTags: "아직 태그가 없어요.",
    tagsHeading: "태그",
    pageSuffix: (page) => ` (${page}쪽)`,
    tagDescription: (heading) => `${heading} 태그가 붙은 글`,
    prev: "‹ 이전",
    next: "다음 ›",
    pagerLabel: "페이지",
    browseByTag: "태그",
    byYear: "연도",
    allShort: "전체",
    allTags: "모든 태그 →",
    toc: "목차",
    koreanOnly: "KR",
    koreanOnlyTitle: "아직 번역되지 않은 글 (한국어)",
    activityUntranslated: "아직 번역되지 않았어요 — 한국어로 보여요.",
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
    monthName: (month) => `${month}월`,
    dayOfMonth: (day) => `${day}일`,
    navStats: "통계",
    navNotes: "노트",
    noteListTitle: "노트",
    recentNotes: "최근 노트",
    allNotes: "노트 전체 보기 →",
    noteBadge: "노트",
    emptyNotes: "아직 노트가 없어요.",
    statsHeading: "통계",
    statPosts: "글",
    statActivities: "활동",
    statTags: "태그",
    statTranslated: "번역된 글",
    statStarted: "블로그 시작",
    statChars: "쓴 글자",
    unitCount: "개",
    unitChars: "자",
    statsDays: (days) => `${days.toLocaleString("ko-KR")}일째`,
    statsFirst: (date) => `첫 글 ${date}`,
    topTags: "태그 순위",
    grassHeading: "잔디 · 최근 1년",
    grassLabel: "최근 1년 동안 날마다 쓴 글·활동과 GitHub 기여",
    grassLegendBlog: "글·활동 쓴 날",
    grassLegendGithub: "GitHub 기여",
    grassSummary: (days, github) => `글·활동 쓴 날 ${days}일${github === null ? "" : ` · GitHub 기여 ${github.toLocaleString("ko-KR")}`}`,
    grassTitle: (date, posts, activities, github) => `${date} · 글 ${posts} · 활동 ${activities}${github === null ? "" : ` · GitHub ${github}`}`,
    less: "적음",
    more: "많음",
    monthlyHeading: "달마다 · 최근 12달",
    monthShort: (month) => `${month}월`,
    languagesHeading: "코드 블록 언어",
    languagesOther: "그 밖",
    languagesEmpty: "아직 언어가 적힌 코드 블록이 없어요.",
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
    postListTitle: "Posts",
    emptyPosts: "No posts yet.",
    emptyTags: "No tags yet.",
    tagsHeading: "Tags",
    pageSuffix: (page) => ` (page ${page})`,
    tagDescription: (heading) => `Posts tagged ${heading}`,
    prev: "‹ Prev",
    next: "Next ›",
    pagerLabel: "Pages",
    browseByTag: "Tags",
    byYear: "Years",
    allShort: "All",
    allTags: "All tags →",
    toc: "Contents",
    koreanOnly: "KR",
    koreanOnlyTitle: "Not translated yet (Korean only)",
    activityUntranslated: "Not translated yet — shown in Korean.",
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
    monthName: (month) => new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, month - 1, 1))),
    dayOfMonth: (day) => String(day),
    navStats: "Stats",
    navNotes: "Notes",
    noteListTitle: "Notes",
    recentNotes: "Recent notes",
    allNotes: "All notes →",
    noteBadge: "Note",
    emptyNotes: "No notes yet.",
    statsHeading: "Stats",
    statPosts: "Posts",
    statActivities: "Activities",
    statTags: "Tags",
    statTranslated: "Translated",
    statStarted: "Blogging for",
    statChars: "Characters written",
    unitCount: "",
    unitChars: "",
    statsDays: (days) => `${days.toLocaleString("en-US")} ${days === 1 ? "day" : "days"}`,
    statsFirst: (date) => `First post ${date}`,
    topTags: "Top tags",
    grassHeading: "Activity · last year",
    grassLabel: "Posts, activities and GitHub contributions per day over the last year",
    grassLegendBlog: "Days with posts or activities",
    grassLegendGithub: "GitHub contributions",
    grassSummary: (days, github) => `${days} ${days === 1 ? "day" : "days"} with posts or activities${github === null ? "" : ` · ${github.toLocaleString("en-US")} GitHub contributions`}`,
    grassTitle: (date, posts, activities, github) => `${date} · ${posts} posts · ${activities} activities${github === null ? "" : ` · ${github} on GitHub`}`,
    less: "Less",
    more: "More",
    monthlyHeading: "By month · last 12 months",
    monthShort: (month) => new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2000, month - 1, 1))),
    languagesHeading: "Code block languages",
    languagesOther: "Other",
    languagesEmpty: "No code blocks with a language yet.",
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
 * - 버튼으로 바꿀 때 물결 (설계 16-19): View Transitions로 화면을 찍어 두고 바꾼 뒤, 다크 쪽 화면을 물결 모양 clip-path로 자름
 *   라이트→다크 = 새 화면(다크)이 아래에서 차오름, 다크→라이트 = 옛 화면(다크)이 위에서부터 빠짐. 0.7초, 물결 12px(가운데서 가장 크고 끝에서 0)
 *   물결 모양 43장을 미리 계산해 Web Animations로 재생. 지원 안 하는 브라우저·동작 줄이기면 바로 바뀜. 기기 설정이 바뀔 때는 움직임 없음
 *
 * 홈 태그 트리 (설계 15-4)
 * - 홈 태그 카드(<details class="home-tags" open>, 설계 16-7)는 좁은 화면(799px 이하)이면 처음에 접음. JS가 꺼지면 펼친 채. 넓은 화면은 CSS가 접기 단추를 숨김
 * - 글 페이지 목차(<details class="toc" open>, 설계 16-3)는 목차가 글 위로 오는 폭(899px 이하)이면 처음에 접음 (CSS가 스르륵 펼침).
 *   옆 칸에 있는 넓은 화면은 접기 없음 (제목을 눌러도·Enter도 안 접힘) → 좁았다가 넓어지면 다시 펼침 (2026-11-12)
 *
 * 페이지 바뀔 때 움직임 (설계 16-15) — 상단바·하단바는 그대로, 가운데(.site-main)의 덩어리만
 * - 덩어리 = 카드·페이지 제목·아카이브 머리·이전/다음·목차·페이지 번호 (다른 덩어리 안에 든 것은 빼고). 없으면 main의 자식들
 * - 들어올 때: 그리기 전에 <html class="enter-pending">(가운데 숨김) → 문서를 다 읽으면 덩어리마다 --i(0~6)를 달고
 *   entering → CSS가 페이드인 + 아래에서 위로 (0.06초씩 늦게). 혹시 멈춰도 1.5초 뒤 숨김을 풂
 * - 나갈 때: 같은 사이트 페이지 링크(새 탭·수정 키·다운로드·같은 페이지 안 #이동·RSS/JSON 제외)를 누르면
 *   (지금 페이지 자기 자신 링크 — 예: 글 탭에서 [글] — 도 같은 움직임 뒤 다시 열기. 2026-11-12 고침: 예전엔 # 없이도 빠졌음)
 *   leaving → 페이드아웃 + 아래로 → 끝나면 그 주소로. 뒤로 가기로 돌아오면(bfcache) leaving을 풂
 * - 기기 설정 "동작 줄이기"면 아무것도 안 함. JS가 꺼지면 숨김 자체가 없음
 *
 * 다음 페이지 미리 받기 (설계 16-17) — 페이드아웃 동안 로딩이 겹치게
 * - 같은 사이트 페이지 링크(나갈 때 움직임과 같은 조건, U)에 마우스를 0.07초 올리면·터치가 닿으면·키보드 초점이 가면·늦어도 누를 때
 *   <link rel="prefetch">를 하나 붙임. 한 주소(# 뺀) 한 번, 지금 페이지는 안 받음. 데이터 절약·2G면 안 함. 지원 안 하는 브라우저는 그냥 무시
 *
 * 언어 메뉴 (설계 16-16, 시안 G-2)
 * - 지구본 + KO/EN 버튼(.lang-button)을 누르면 .lang-menu에 open을 붙였다 뗌 (aria-expanded 같이). CSS가 목록을 버튼 아래 오른쪽 맞춤으로
 * - 목록 바깥을 누르면·Esc면 닫음 (Esc는 버튼으로 초점). 뒤로 가기로 돌아오면 닫힌 채. JS가 꺼지면 버튼이 안 보이고 목록이 글자 링크로
 *
 * 아카이브 활동 접기 (설계 15-8)
 * - 주소 조각(#activity-n)이 가리키는 곳 안의 <details>를 펼침 (열 때 + 조각이 바뀔 때). 나머지는 닫힌 채
 */
export const SITE_SCRIPT = `(function(){var K="lang",T="theme",d=document.documentElement;d.classList.add("js");var R=matchMedia("(prefers-reduced-motion: reduce)").matches;if(!R){d.classList.add("enter-pending");setTimeout(function(){d.classList.remove("enter-pending")},1500)}try{var m=localStorage.getItem(T);if(m==="dark"||m==="light")d.setAttribute("data-theme",m)}catch(e){}function dark(){var v=d.getAttribute("data-theme");return v==="dark"||(v!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches)}function sync(){var g=document.querySelector("[data-theme-toggle]");if(g)g.setAttribute("aria-pressed",String(dark()))}function M(n){d.setAttribute("data-theme",n);try{localStorage.setItem(T,n)}catch(x){}sync()}function V(n){if(R||!document.startViewTransition||!d.animate){M(n);return}var up=n==="dark",w=innerWidth,h=innerHeight,k=[],N=42;for(var j=0;j<=N;j++){var s=j/N,e=s<.5?2*s*s:1-Math.pow(-2*s+2,2)/2,y=h*(1-(up?e:1-e)),a=12*Math.sin(Math.PI*s),ph=s*4,p=[];for(var i=0;i<=24;i++){var q=i/24;p.push((w*q).toFixed(1)+"px "+(y+a*Math.sin(q*Math.PI*3+ph)+a*.5*Math.sin(q*Math.PI*7-ph*1.3)).toFixed(1)+"px")}p.push(w+"px "+h+"px","0px "+h+"px");k.push({clipPath:"polygon("+p.join(",")+")"})}d.classList.add(up?"wave-up":"wave-down");var v=document.startViewTransition(function(){M(n)});v.ready.then(function(){d.animate(k,{duration:700,easing:"linear",pseudoElement:up?"::view-transition-new(root)":"::view-transition-old(root)"})});v.finished.then(function(){d.classList.remove("wave-up","wave-down")})}function L(o,f){var w=document.querySelector(".lang-menu");if(!w)return;w.classList.toggle("open",o);var b=w.querySelector(".lang-button");if(b){b.setAttribute("aria-expanded",String(o));if(f)b.focus()}}addEventListener("keydown",function(e){var w=document.querySelector(".lang-menu.open");if(w&&e.key==="Escape")L(false,true)});function hash(){var i=location.hash.slice(1),e=i&&document.getElementById(i),t=e&&e.querySelector("details");if(t)t.open=true}addEventListener("hashchange",hash);document.addEventListener("DOMContentLoaded",function(){sync();hash();if(matchMedia("(max-width: 799px)").matches)[].forEach.call(document.querySelectorAll(".home-tags"),function(x){x.removeAttribute("open")});var W=matchMedia("(min-width: 900px)"),O=document.querySelector(".post-side .toc");if(O){if(!W.matches)O.removeAttribute("open");O.querySelector("summary").addEventListener("click",function(e){if(W.matches)e.preventDefault()});W.addEventListener("change",function(e){if(e.matches)O.setAttribute("open","")})}});try{var s=localStorage.getItem(K);if(s&&s!==d.lang&&!/[?&]lang=/.test(location.search)){var p=d.getAttribute("data-path-"+s);if(p){location.replace(p+location.hash);return}}}catch(e){}document.addEventListener("click",function(e){var t=e.target&&e.target.closest?e.target:null;if(!t)return;if(t.closest(".lang-button")){L(!document.querySelector(".lang-menu.open"));return}if(!t.closest(".lang-switch"))L(false);var a=t.closest("a[data-set-lang]");if(a)try{localStorage.setItem(K,a.getAttribute("data-set-lang"))}catch(x){}if(t.closest("[data-theme-toggle]")){V(dark()?"light":"dark");return}var b=t.closest(".code-copy"),c=b&&b.closest(".code-block");if(!c||!navigator.clipboard)return;var l=[].slice.call(c.querySelectorAll(".line")).filter(function(n){return!n.classList.contains("line-del")}).map(function(n){var x=n.querySelector(".code-text");return x?x.textContent:""});navigator.clipboard.writeText(l.join("\\n")).then(function(){b.setAttribute("data-copied","true");setTimeout(function(){b.removeAttribute("data-copied")},1500)})});var P={},H;function A(e){return e.target&&e.target.closest?e.target.closest("a[href]"):null}function U(a){if(!a||(a.target&&a.target!=="_self")||a.hasAttribute("download"))return null;var u=new URL(a.href,location.href);if(u.origin!==location.origin||/[.](xml|json)$/.test(u.pathname))return null;if(u.pathname===location.pathname&&u.search===location.search&&u.hash)return null;return u}function F(a){var u=U(a);if(!u)return;u.hash="";var h=u.href,c=navigator.connection;if(P[h]||h===location.href.split("#")[0]||(c&&(c.saveData||/2g/.test(c.effectiveType||""))))return;P[h]=1;var l=document.createElement("link");l.rel="prefetch";l.href=h;document.head.appendChild(l)}document.addEventListener("mouseover",function(e){var a=A(e);clearTimeout(H);if(a)H=setTimeout(function(){F(a)},70)});document.addEventListener("mouseout",function(){clearTimeout(H)});document.addEventListener("touchstart",function(e){F(A(e))},{passive:true});document.addEventListener("focusin",function(e){F(A(e))});function Q(){var w=document.querySelector(".site-main");if(!w)return[];var S=".card,.list-heading,.list-head,.archive-top,.post-nav,.toc,.pager,.empty,.tag-path";var r=[].slice.call(w.querySelectorAll(S)).filter(function(el){for(var q=el.parentElement;q&&q!==w;q=q.parentElement)if(q.matches(S))return false;return true});return r.length?r:[].slice.call(w.children)}document.addEventListener("DOMContentLoaded",function(){if(R)return;Q().forEach(function(el,i){el.style.setProperty("--i",String(Math.min(i,6)));el.classList.add("enter-block")});d.classList.add("entering");d.classList.remove("enter-pending");setTimeout(function(){d.classList.remove("entering")},1200)});document.addEventListener("click",function(e){if(R||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;var t=A(e),u=U(t);if(!u)return;F(t);var k=Q();if(!k.length)return;e.preventDefault();k.forEach(function(el,i){el.style.setProperty("--i",String(Math.min(i,6)))});d.classList.remove("entering");d.classList.add("leaving");setTimeout(function(){location.href=u.href},200+Math.min(k.length-1,6)*30)});window.addEventListener("pageshow",function(e){if(e.persisted){d.classList.remove("leaving","enter-pending");L(false)}})})();`;
