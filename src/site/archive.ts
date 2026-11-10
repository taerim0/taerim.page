/**
 * 아카이브 묶기 (설계 15-5): 글과 이슈를 날짜(한국 시간) 순으로 섞어 연 → 월로.
 * 순수 함수 — 렌더링(HTML)은 templates.ts, 데이터 준비는 build.ts
 */
import { formatDate } from "./i18n.ts";
import type { PostCardData } from "./templates.ts";

/** 아카이브의 이슈 한 줄 (언어에 맞게 고른 제목·내용) */
export interface ArchiveIssue {
  id: number;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  /** 영어 페이지인데 영어 제목이 없어 한국어로 보일 때 "ko" */
  titleLang: string | null;
  /** 렌더러가 만든 내용 HTML (빈 내용이면 "") */
  bodyHtml: string;
  bodyLang: string | null;
}

export type ArchiveEntry =
  | { kind: "post"; date: string; post: PostCardData }
  | { kind: "issue"; date: string; issue: ArchiveIssue };

export interface ArchiveCounts {
  posts: number;
  issues: number;
}

export interface ArchiveMonth extends ArchiveCounts {
  /** 1~12 */
  month: number;
  entries: ArchiveEntry[];
}

export interface ArchiveYear extends ArchiveCounts {
  year: number;
  months: ArchiveMonth[];
}

/** 글의 공개 날짜 (한국 시간) YYYY-MM-DD */
export function postDate(post: PostCardData): string {
  return formatDate(post.publishedAt ?? post.createdAt, "ko");
}

/**
 * 최신부터 연 → 월로 묶음. 같은 날이면 글(최신 공개 순) 다음에 이슈(id 큰 것 먼저).
 * posts는 이미 최신 공개 순, issues는 날짜·id 최신 순이라고 가정하지 않고 여기서 정렬한다
 */
export function groupArchive(posts: readonly PostCardData[], issues: readonly ArchiveIssue[]): ArchiveYear[] {
  const entries: (ArchiveEntry & { order: number })[] = [
    ...posts.map((post, i) => ({ kind: "post" as const, date: postDate(post), post, order: i })),
    ...[...issues].sort((a, b) => b.id - a.id).map((issue, i) => ({ kind: "issue" as const, date: issue.date, issue, order: posts.length + i })),
  ];
  // 날짜 내림차순, 같은 날이면 들어온 순서 (글 최신 순 → 이슈)
  entries.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? 1 : -1));

  const years: ArchiveYear[] = [];
  for (const { order: _order, ...entry } of entries) {
    const year = Number(entry.date.slice(0, 4));
    const month = Number(entry.date.slice(5, 7));
    let y = years.at(-1);
    if (!y || y.year !== year) years.push((y = { year, posts: 0, issues: 0, months: [] }));
    let m = y.months.at(-1);
    if (!m || m.month !== month) y.months.push((m = { month, posts: 0, issues: 0, entries: [] }));
    m.entries.push(entry);
    const key = entry.kind === "post" ? "posts" : "issues";
    m[key]++;
    y[key]++;
  }
  return years;
}
