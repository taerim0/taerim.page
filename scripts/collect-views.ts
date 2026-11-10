/**
 * 조회수 모으기 (설계 2-2, docs/05): Cloudflare Web Analytics → D1 page_views_daily.
 *
 *   node scripts/collect-views.ts             최근 3일 → 로컬 D1 (.wrangler/state, 확인용)
 *   node scripts/collect-views.ts --remote    최근 3일 → 원격 D1 (GitHub Actions, 매일 빌드 전)
 *   --days 7                                  받을 날 수 (최근 7일까지가 표본 없는 값)
 *   --dry-run                                 받기만 하고 저장 안 함 (받은 행을 출력)
 *
 * 필요한 환경 변수
 *   CLOUDFLARE_ANALYTICS_TOKEN   권한: Account Analytics 읽기 (Web Analytics 읽기 전용)
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_API_TOKEN         --remote일 때만. 권한: D1 편집 (저장)
 * 로컬에서는 .dev.vars의 값도 읽는다
 */
import { readFile } from "node:fs/promises";
import { getPlatformProxy } from "wrangler";
import type { D1Database } from "../src/posts/d1.ts";
import { createD1Http } from "../src/posts/d1-http.ts";
import { CLOUDFLARE_GRAPHQL, D1ViewsRepository, parseRumResponse, RUM_QUERY, recentRange } from "../src/stats/views.ts";
import { SITE_CONFIG } from "../src/site/config.ts";

const WRANGLER_CONFIG = "wrangler.jsonc";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const dryRun = args.includes("--dry-run");
const daysArg = args.indexOf("--days");
const days = daysArg >= 0 ? Number(args[daysArg + 1]) : 3;
// 범위가 넓으면 Cloudflare가 표본으로 줄여 답함 (31일로 물으면 숫자가 줄었음, 2026-11-11 확인) → 7일까지만
if (!Number.isInteger(days) || days < 1 || days > 7) throw new Error("--days 는 1~7 (넓으면 표본이 되어 숫자가 줄어요)");

/** .dev.vars (KEY=VALUE 줄)를 환경 변수에 없는 것만 채움. 없으면 그냥 넘어감 */
async function loadDevVars(): Promise<void> {
  let text: string;
  try {
    text = await readFile(".dev.vars", "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (match && process.env[match[1]!] === undefined) process.env[match[1]!] = match[2];
  }
}

async function configValue(key: string): Promise<string> {
  const config = await readFile(WRANGLER_CONFIG, "utf8");
  const value = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`).exec(config)?.[1];
  if (!value) throw new Error(`${WRANGLER_CONFIG}에서 ${key}를 찾지 못했어요`);
  return value;
}

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`환경 변수 ${name} 가 필요해요`);
  return value;
}

async function main(): Promise<void> {
  if (!remote) await loadDevVars();
  const accountId = need("CLOUDFLARE_ACCOUNT_ID");
  const host = new URL(SITE_CONFIG.url).host;
  const { from, to } = recentRange(new Date(), days);

  const response = await fetch(CLOUDFLARE_GRAPHQL, {
    method: "POST",
    headers: { authorization: `Bearer ${need("CLOUDFLARE_ANALYTICS_TOKEN")}`, "content-type": "application/json" },
    body: JSON.stringify({ query: RUM_QUERY, variables: { accountTag: accountId, host, from, to } }),
  });
  if (!response.ok) throw new Error(`Web Analytics 조회 실패: HTTP ${response.status} ${await response.text()}`);
  const rows = parseRumResponse(await response.json());
  const total = rows.reduce((sum, r) => sum + r.views, 0);
  console.log(`Web Analytics ${host} ${from}~${to}: ${rows.length}줄, 조회 ${total}`);
  if (dryRun) {
    for (const r of rows) console.log(`  ${r.date} ${r.path} 조회 ${r.views} 방문 ${r.visits}`);
    return;
  }

  let db: D1Database;
  let close = async () => {};
  if (remote) {
    db = createD1Http({ accountId, databaseId: await configValue("database_id"), apiToken: need("CLOUDFLARE_API_TOKEN") });
  } else {
    const proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: WRANGLER_CONFIG, remoteBindings: false });
    db = proxy.env.DB;
    close = () => proxy.dispose();
  }
  try {
    await new D1ViewsRepository(db).upsert(rows);
    console.log(`${remote ? "원격" : "로컬"} D1 page_views_daily에 ${rows.length}줄 저장`);
  } finally {
    await close();
  }
}

await main();
