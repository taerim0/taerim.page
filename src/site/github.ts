/**
 * 통계 잔디의 GitHub 기여 (설계 15-9): 빌드 때 GitHub GraphQL contributionCalendar(최근 1년 날짜별 기여 수)를 받는다.
 * 토큰은 GitHub Actions 기본 GITHUB_TOKEN (공개 기여만). 실패는 던지고, 빌드 스크립트가 경고 후 GitHub 없이 계속
 */

const ENDPOINT = "https://api.github.com/graphql";
const QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
    }
  }
}`;

/** GitHub 아이디 모양 (영문·숫자·하이픈, 39자까지, 하이픈으로 시작·끝나지 않음) */
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

/** 사이트 설정의 GitHub 주소 → 아이디. https://github.com/아이디(/…) 가 아니면 null */
export function githubLogin(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") return null;
    const login = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
    return LOGIN.test(login) ? login : null;
  } catch {
    return null;
  }
}

interface CalendarResponse {
  data?: { user?: { contributionsCollection?: { contributionCalendar?: { weeks?: { contributionDays?: { date?: unknown; contributionCount?: unknown }[] }[] } } } | null };
  errors?: { message?: string }[];
}

/** GraphQL 응답 → 날짜(YYYY-MM-DD)별 기여 수. 모양이 다르면 오류 */
export function parseContributions(body: CalendarResponse): Map<string, number> {
  if (body.errors?.length) throw new Error(`GitHub GraphQL 오류: ${body.errors.map((e) => e.message ?? "").join("; ")}`);
  const weeks = body.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
  if (!Array.isArray(weeks)) throw new Error("GitHub 응답에 contributionCalendar가 없어요 (아이디가 맞는지 확인)");
  const days = new Map<string, number>();
  for (const week of weeks) {
    for (const day of week.contributionDays ?? []) {
      if (typeof day.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day.date) && typeof day.contributionCount === "number") {
        days.set(day.date, day.contributionCount);
      }
    }
  }
  return days;
}

/** 최근 1년 날짜별 기여 수 받기 */
export async function fetchContributions(login: string, token: string, fetchFn: typeof fetch = fetch): Promise<Map<string, number>> {
  const response = await fetchFn(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "taerim.page-build" },
    body: JSON.stringify({ query: QUERY, variables: { login } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GitHub 응답 ${response.status}`);
  return parseContributions((await response.json()) as CalendarResponse);
}
