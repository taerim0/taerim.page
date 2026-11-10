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
  /** 번역 안 된 글 팝업 (번역 언어에만 쓰임) */
  untranslatedTitle: string;
  readInKorean: string;
  backToPosts: string;
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
    untranslatedTitle: "아직 번역되지 않은 글입니다.",
    readInKorean: "한국어로 읽기",
    backToPosts: "글 목록으로",
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
    untranslatedTitle: "This post hasn't been translated yet.",
    readInKorean: "한국어로 읽기",
    backToPosts: "Back to posts",
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
 * 언어 기억·자동 이동 스크립트 (설계 12-11). <head> 끝에 그대로 넣는다 — 화면을 그리기 전에 실행되어 깜빡임 없음.
 * - 머리글 언어 선택(data-set-lang)을 누르면 그 언어를 기억
 * - 기억한 언어가 이 페이지 언어와 다르면 같은 페이지의 그 언어 주소(<html data-path-{언어}>)로 바로 이동
 * - 주소에 ?lang= 이 있으면 이동하지 않음 (미번역 팝업의 [한국어로 읽기] 등 한 번만 다른 언어로 볼 때)
 * - 저장이 막힌 브라우저는 아무것도 안 함. 봇은 이동을 따라가지 않음
 */
export const LANGUAGE_SCRIPT = `(function(){var K="lang",d=document.documentElement;try{var s=localStorage.getItem(K);if(s&&s!==d.lang&&!/[?&]lang=/.test(location.search)){var p=d.getAttribute("data-path-"+s);if(p){location.replace(p+location.hash);return}}}catch(e){}document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[data-set-lang]");if(a)try{localStorage.setItem(K,a.getAttribute("data-set-lang"))}catch(e){}})})();`;
