/**
 * 통계 탭 (설계 15-9): 빌드 때 글·활동에서 세는 블로그 안쪽 수치. 순수 함수 (렌더링은 templates.ts)
 * 조회 수 같은 바깥 수치는 넣지 않는다
 */
import type { Activity } from "../activities/activities.ts";
import { parseFenceInfo } from "../markdown/code.ts";
import type { Post, TagCount } from "../posts/types.ts";
import { formatDate } from "./i18n.ts";

/** 태그 순위에 보일 개수 */
export const STATS_TOP_TAGS = 10;
/** 코드 언어 띠에 이름으로 보일 개수 (나머지는 "그 밖") */
export const STATS_TOP_LANGUAGES = 5;
/** 잔디 주 수 (GitHub처럼 53주) */
export const GRASS_WEEKS = 53;

export interface StatsInput {
  /** 공개 글 (태그에 상위 태그가 붙은 것) */
  posts: readonly Post[];
  activities: readonly Activity[];
  /** 번역본이 공개된 글 id */
  translatedIds: ReadonlySet<number>;
  /** 글 id → 한국어 본문 순수 글자 (검색 파일과 같은 방식) */
  bodyTexts: ReadonlyMap<number, string>;
  /** 태그별 글 수 (태그 페이지와 같은 셈) */
  tags: readonly TagCount[];
  /** 빌드한 날 (한국 날짜 YYYY-MM-DD) */
  today: string;
  /** GitHub 날짜별 기여 수. 없으면(못 받음·설정 없음) null */
  github: ReadonlyMap<string, number> | null;
}

/** 잔디 칸의 단계: 블로그(글·활동) 1·2, GitHub만 1~3, 없음 0 */
export type GrassLevel = "none" | "blog-1" | "blog-2" | "gh-1" | "gh-2" | "gh-3";

export interface GrassDay {
  date: string;
  posts: number;
  activities: number;
  /** GitHub 기여 (GitHub를 못 받았으면 null) */
  github: number | null;
  level: GrassLevel;
}

export interface Grass {
  /** 53주 × 7일 (일요일부터). 빌드한 날 뒤는 null */
  weeks: (GrassDay | null)[][];
  /** 주마다 그 주에 시작하는 달 (1~12), 없으면 null — 위쪽 달 이름 */
  monthStarts: (number | null)[];
  /** 글이나 활동을 쓴 날 수 */
  blogDays: number;
  /** GitHub 기여 합 (못 받았으면 null) */
  githubTotal: number | null;
}

export interface MonthBar {
  year: number;
  month: number;
  posts: number;
  activities: number;
}

export interface LanguageShare {
  /** 화면 이름 (TypeScript…) 또는 null = 그 밖 */
  name: string | null;
  count: number;
  /** 0~100 (소수 한 자리) */
  percent: number;
}

export interface SiteStats {
  posts: number;
  activities: number;
  tags: number;
  translated: number;
  /** 첫 공개 글 날짜 (글이 없으면 null) */
  firstDate: string | null;
  /** 첫 글부터 오늘까지 n일째 (첫날 = 1) */
  days: number | null;
  /** 쓴 글자 (공개 글 한국어 본문) */
  chars: number;
  topTags: TagCount[];
  grass: Grass;
  months: MonthBar[];
  languages: LanguageShare[];
  /** 언어가 적힌 코드 블록 수 */
  codeBlocks: number;
}

// ── 날짜 (YYYY-MM-DD를 UTC 자정으로 보고 계산) ──────────────

const toTime = (day: string) => Date.parse(`${day}T00:00:00Z`);
const fromTime = (time: number) => new Date(time).toISOString().slice(0, 10);
const DAY = 86_400_000;
export const addDays = (day: string, n: number) => fromTime(toTime(day) + n * DAY);
export const daysBetween = (from: string, to: string) => Math.round((toTime(to) - toTime(from)) / DAY);

/** 글의 공개 날짜 (한국 날짜) */
const postDay = (post: Post) => formatDate(post.publishedAt ?? post.createdAt, "ko");

export function computeStats(input: StatsInput): SiteStats {
  const postDays = input.posts.map(postDay).sort();
  const firstDate = postDays[0] ?? null;
  let chars = 0;
  for (const post of input.posts) chars += [...(input.bodyTexts.get(post.id) ?? "")].length;
  const code = countCodeLanguages(input.posts.map((post) => post.body));
  return {
    posts: input.posts.length,
    activities: input.activities.length,
    tags: input.tags.length,
    translated: input.posts.filter((post) => input.translatedIds.has(post.id)).length,
    firstDate,
    days: firstDate === null ? null : Math.max(1, daysBetween(firstDate, input.today) + 1),
    chars,
    topTags: [...input.tags].sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1)).slice(0, STATS_TOP_TAGS),
    grass: buildGrass(postDays, input.activities.map((activity) => activity.date), input.github, input.today),
    months: monthBars(postDays, input.activities.map((activity) => activity.date), input.today),
    languages: code.shares,
    codeBlocks: code.total,
  };
}

/** 날짜 목록 → 날짜별 개수 */
function countByDay(days: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const day of days) counts.set(day, (counts.get(day) ?? 0) + 1);
  return counts;
}

/**
 * 잔디: 오늘이 든 주를 마지막 열로 53주 (주는 일요일부터). 블로그를 쓴 날은 초록(1개 / 2개 이상),
 * 블로그 없이 GitHub만 한 날은 회색 3단계 (그 해 가장 많은 날의 1/3·2/3 기준)
 */
export function buildGrass(postDays: readonly string[], activityDays: readonly string[], github: ReadonlyMap<string, number> | null, today: string): Grass {
  const posts = countByDay(postDays);
  const activities = countByDay(activityDays);
  const weekday = new Date(toTime(today)).getUTCDay();
  const start = addDays(today, -weekday - (GRASS_WEEKS - 1) * 7);
  let githubMax = 0;
  if (github) for (let i = 0; i < GRASS_WEEKS * 7; i++) githubMax = Math.max(githubMax, github.get(addDays(start, i)) ?? 0);

  const weeks: (GrassDay | null)[][] = [];
  const monthStarts: (number | null)[] = [];
  let blogDays = 0;
  let githubTotal = 0;
  for (let w = 0; w < GRASS_WEEKS; w++) {
    const week: (GrassDay | null)[] = [];
    let monthStart: number | null = null;
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      if (date.slice(8) === "01") monthStart = Number(date.slice(5, 7));
      if (date > today) {
        week.push(null);
        continue;
      }
      const p = posts.get(date) ?? 0;
      const a = activities.get(date) ?? 0;
      const g = github ? (github.get(date) ?? 0) : null;
      if (p + a > 0) blogDays++;
      githubTotal += g ?? 0;
      week.push({ date, posts: p, activities: a, github: g, level: level(p + a, g ?? 0, githubMax) });
    }
    weeks.push(week);
    monthStarts.push(monthStart);
  }
  return { weeks, monthStarts, blogDays, githubTotal: github ? githubTotal : null };
}

function level(blog: number, github: number, githubMax: number): GrassLevel {
  if (blog >= 2) return "blog-2";
  if (blog === 1) return "blog-1";
  if (github <= 0 || githubMax <= 0) return "none";
  if (github <= githubMax / 3) return "gh-1";
  if (github <= (githubMax * 2) / 3) return "gh-2";
  return "gh-3";
}

/** 오늘이 든 달까지 최근 12달 (옛날 → 최근) */
export function monthBars(postDays: readonly string[], activityDays: readonly string[], today: string): MonthBar[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const bars: MonthBar[] = [];
  for (let i = 11; i >= 0; i--) {
    const index = year * 12 + (month - 1) - i;
    bars.push({ year: Math.floor(index / 12), month: (index % 12) + 1, posts: 0, activities: 0 });
  }
  const key = (day: string) => day.slice(0, 7);
  const find = (day: string) => bars.find((bar) => `${bar.year}-${String(bar.month).padStart(2, "0")}` === key(day));
  for (const day of postDays) {
    const bar = find(day);
    if (bar) bar.posts++;
  }
  for (const day of activityDays) {
    const bar = find(day);
    if (bar) bar.activities++;
  }
  return bars;
}

/** 같은 언어의 다른 이름 → 하나로 */
const LANGUAGE_ALIASES: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "jsx",
  py: "python", python3: "python", sh: "bash", shell: "bash", zsh: "bash", console: "bash", shellsession: "bash",
  yml: "yaml", md: "markdown", "c++": "cpp", cc: "cpp", hpp: "cpp", rb: "ruby", rs: "rust", kt: "kotlin", golang: "go", cs: "csharp", "c#": "csharp",
};
/** 셈에서 빼는 것 (언어가 아님) */
const NOT_LANGUAGES = new Set(["text", "txt", "plain", "plaintext", "none", "output"]);
/** 화면 이름 */
const LANGUAGE_NAMES: Record<string, string> = {
  typescript: "TypeScript", tsx: "TSX", javascript: "JavaScript", jsx: "JSX", python: "Python", bash: "Bash", cpp: "C++", c: "C",
  java: "Java", go: "Go", rust: "Rust", kotlin: "Kotlin", swift: "Swift", ruby: "Ruby", csharp: "C#", json: "JSON", yaml: "YAML",
  toml: "TOML", html: "HTML", css: "CSS", scss: "SCSS", sql: "SQL", markdown: "Markdown", diff: "Diff", dockerfile: "Dockerfile", php: "PHP",
};

/** 코드 블록 첫 단어(언어) → 하나로 맞춘 이름. 언어가 없거나 언어가 아니면 null */
export function normalizeLanguage(raw: string | null): string | null {
  if (!raw) return null;
  const lang = raw.toLowerCase();
  if (NOT_LANGUAGES.has(lang)) return null;
  return LANGUAGE_ALIASES[lang] ?? lang;
}

/**
 * 글 본문(Markdown)의 코드 블록 언어 세기. 줄 맨 앞(공백 3칸까지)의 ``` / ~~~ 펜스만 (인용·목록 안의 펜스는 셈에서 빠짐)
 * 위 STATS_TOP_LANGUAGES개 + 나머지는 "그 밖"(name null)
 */
export function countCodeLanguages(bodies: readonly string[]): { total: number; shares: LanguageShare[] } {
  const counts = new Map<string, number>();
  for (const body of bodies) {
    let fence: { char: string; length: number } | null = null;
    for (const line of body.split("\n")) {
      const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (!match) continue;
      const marker = match[1]!;
      if (fence) {
        // 닫는 펜스: 같은 글자, 같거나 더 길게, 뒤에 글자 없음
        if (marker[0] === fence.char && marker.length >= fence.length && match[2]!.trim() === "") fence = null;
        continue;
      }
      if (marker[0] === "`" && match[2]!.includes("`")) continue; // ``` 한 줄 안의 인라인 코드
      fence = { char: marker[0]!, length: marker.length };
      const lang = normalizeLanguage(parseFenceInfo(match[2]!).lang);
      if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
    }
  }
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const sorted = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const top = sorted.slice(0, STATS_TOP_LANGUAGES);
  const rest = sorted.slice(STATS_TOP_LANGUAGES).reduce((sum, [, n]) => sum + n, 0);
  const percent = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 10);
  const shares: LanguageShare[] = top.map(([lang, count]) => ({ name: LANGUAGE_NAMES[lang] ?? lang, count, percent: percent(count) }));
  if (rest > 0) shares.push({ name: null, count: rest, percent: percent(rest) });
  return { total, shares };
}
