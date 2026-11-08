/**
 * 공개 사이트 빌드: D1의 공개 글 → dist/site/ 정적 파일.
 *
 *   npm run build:site                로컬 D1 (wrangler dev와 같은 데이터, .wrangler/state)
 *   npm run build:site -- --remote    원격 D1 (실제 블로그 데이터, GitHub Actions에서 사용)
 *       필요한 환경 변수: CLOUDFLARE_API_TOKEN(권한: D1 읽기), CLOUDFLARE_ACCOUNT_ID
 *       DB id는 wrangler.jsonc의 database_id
 *
 *   ② 저장소에서 공개 글 읽기 (listPublished)
 *   ① buildSite → { 주소: 내용 }
 *   ③ dist/site/ 를 비우고 → site-static/(CSS·기본 이미지) 복사 → 페이지 파일 쓰기
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getPlatformProxy } from "wrangler";
import type { D1Database } from "../src/posts/d1.ts";
import { createD1Http } from "../src/posts/d1-http.ts";
import { D1PostRepository } from "../src/posts/d1-repository.ts";
import type { Post } from "../src/posts/types.ts";
import { buildSite } from "../src/site/build.ts";
import { SITE_CONFIG } from "../src/site/config.ts";
import { fileNameFor } from "../src/site/files.ts";

const OUT_DIR = "dist/site";
const STATIC_DIR = "site-static";
const WRANGLER_CONFIG = "wrangler.jsonc";

/** 원격 D1: HTTP API로 읽는다 (Worker 밖이라 진짜 D1 연결이 없음) */
async function readRemote(): Promise<Post[]> {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!apiToken || !accountId) {
    throw new Error("--remote 에는 환경 변수 CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID 가 필요해요");
  }
  // DB id는 한 곳(wrangler.jsonc)에서만 관리한다
  const config = await readFile(WRANGLER_CONFIG, "utf8");
  const databaseId = /"database_id"\s*:\s*"([^"]+)"/.exec(config)?.[1];
  if (!databaseId) throw new Error(`${WRANGLER_CONFIG}에서 database_id를 찾지 못했어요`);
  return new D1PostRepository(createD1Http({ accountId, databaseId, apiToken })).listPublished();
}

/** 로컬 D1: wrangler dev가 쓰는 것과 같은 데이터 */
async function readLocal(): Promise<Post[]> {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: WRANGLER_CONFIG, remoteBindings: false });
  try {
    return await new D1PostRepository(proxy.env.DB).listPublished();
  } finally {
    await proxy.dispose();
  }
}

async function main(): Promise<void> {
  const started = performance.now();
  const remote = process.argv.includes("--remote");
  const posts = remote ? await readRemote() : await readLocal();

  const files = await buildSite({ site: SITE_CONFIG, posts });

  // 지난 빌드의 파일(지운 글 등)이 남지 않게 통째로 비우고 다시 쓴다
  await rm(OUT_DIR, { recursive: true, force: true });
  await cp(STATIC_DIR, OUT_DIR, { recursive: true });
  for (const [urlPath, content] of files) {
    const target = join(OUT_DIR, fileNameFor(urlPath));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }

  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const source = remote ? "원격 D1" : "로컬 D1";
  console.log(`${source}: 공개 글 ${posts.length}개 → 파일 ${files.size}개 (+ 정적 파일) → ${OUT_DIR}/ (${seconds}초)`);
}

await main();
