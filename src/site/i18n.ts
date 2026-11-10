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
  email: string;
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
    backToPosts: "글 목록으로",
    latestPosts: "최신 글",
    allPosts: "전체 글 보기 →",
    profileLabel: "소개",
    email: "이메일",
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
    readInKorean: "한국어로 읽기",
    backToPosts: "Back to posts",
    latestPosts: "Latest posts",
    allPosts: "All posts →",
    profileLabel: "About",
    email: "Email",
  },
};

/** 날짜 형식 (서울 시간 기준, 빌드하는 컴퓨터의 시간대와 상관없이) */
const DATE_FORMATS: Record<Locale, Intl.DateTimeFormat> = {
  // sv-SE = 2026-11-08 모양
  ko: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }),
  en: new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "short", day: "numeric" }),
};

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
 * - <details class="home-tags" open>을 좁은 화면(799px 이하)이면 처음에 접음. JS가 꺼지면 펼친 채
 */
export const SITE_SCRIPT = `(function(){var K="lang",T="theme",d=document.documentElement;d.classList.add("js");try{var m=localStorage.getItem(T);if(m==="dark"||m==="light")d.setAttribute("data-theme",m)}catch(e){}function dark(){var v=d.getAttribute("data-theme");return v==="dark"||(v!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches)}function sync(){var g=document.querySelector("[data-theme-toggle]");if(g)g.setAttribute("aria-pressed",String(dark()))}document.addEventListener("DOMContentLoaded",function(){sync();var h=document.querySelector(".home-tags");if(h&&matchMedia("(max-width: 799px)").matches)h.removeAttribute("open")});try{var s=localStorage.getItem(K);if(s&&s!==d.lang&&!/[?&]lang=/.test(location.search)){var p=d.getAttribute("data-path-"+s);if(p){location.replace(p+location.hash);return}}}catch(e){}document.addEventListener("click",function(e){var t=e.target&&e.target.closest?e.target:null;if(!t)return;var a=t.closest("a[data-set-lang]");if(a)try{localStorage.setItem(K,a.getAttribute("data-set-lang"))}catch(x){}if(t.closest("[data-theme-toggle]")){var n=dark()?"light":"dark";d.setAttribute("data-theme",n);try{localStorage.setItem(T,n)}catch(x){}sync();return}var b=t.closest(".code-copy"),c=b&&b.closest(".code-block");if(!c||!navigator.clipboard)return;var l=[].slice.call(c.querySelectorAll(".line")).filter(function(n){return!n.classList.contains("line-del")}).map(function(n){var x=n.querySelector(".code-text");return x?x.textContent:""});navigator.clipboard.writeText(l.join("\\n")).then(function(){b.setAttribute("data-copied","true");setTimeout(function(){b.removeAttribute("data-copied")},1500)})})})();`;
