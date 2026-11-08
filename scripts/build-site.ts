/**
 * 공개 사이트 빌드: D1의 공개 글 → dist/site/ 정적 파일.  `npm run build:site`
 *
 *   ② 저장소에서 공개 글 읽기 (listPublished)
 *   ① buildSite → { 주소: 내용 }
 *   ③ dist/site/ 를 비우고 → site-static/(CSS·기본 이미지) 복사 → 페이지 파일 쓰기
 *
 * 지금은 로컬 D1(wrangler dev가 쓰는 .wrangler/state)을 읽는다.
 * 클라우드에서 원격 D1을 읽어 배포하는 건 배포 단계(Phase 7)에서 정한다.
 */
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getPlatformProxy } from "wrangler";
import type { D1Database } from "../src/posts/d1.ts";
import { D1PostRepository } from "../src/posts/d1-repository.ts";
import { buildSite } from "../src/site/build.ts";
import { SITE_CONFIG } from "../src/site/config.ts";
import { fileNameFor } from "../src/site/files.ts";

const OUT_DIR = "dist/site";
const STATIC_DIR = "site-static";

async function main(): Promise<void> {
  const started = performance.now();

  // persist 기본값(true) → wrangler dev와 같은 로컬 D1을 읽는다
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: "wrangler.jsonc" });
  let posts;
  try {
    posts = await new D1PostRepository(proxy.env.DB).listPublished();
  } finally {
    await proxy.dispose();
  }

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
  console.log(`공개 글 ${posts.length}개 → 파일 ${files.size}개 (+ 정적 파일) → ${OUT_DIR}/ (${seconds}초)`);
}

await main();
