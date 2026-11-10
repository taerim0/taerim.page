/**
 * 공개 사이트 빌드: D1의 공개 글 + R2의 이미지 → dist/site/ 정적 파일.
 *
 *   npm run build:site                로컬 D1·R2 (wrangler dev와 같은 데이터, .wrangler/state)
 *   npm run build:site -- --remote    원격 D1·R2 (실제 블로그 데이터, GitHub Actions에서 사용)
 *       필요한 환경 변수: CLOUDFLARE_API_TOKEN(권한: D1 읽기, R2 읽기), CLOUDFLARE_ACCOUNT_ID
 *       DB id·버킷 이름은 wrangler.jsonc의 database_id·bucket_name
 *
 *   ① 공개 글 + 언어별 공개 번역본 읽기 (listPublished)
 *   ② 글(본문·대표 이미지)과 번역본 본문이 쓰는 /images/… 이름 모으기
 *   ③ 그 이미지들의 정보(D1 images)와 파일(R2) 읽기. 없는 이미지는 경고만 하고 계속
 *   ④ buildSite → { 주소: 내용 } (이미지 원래 크기로 <img width height>)
 *   ⑤ dist/site/ 를 비우고 → site-static/(CSS·기본 이미지·_headers) 복사 → 페이지·이미지 파일 쓰기
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getPlatformProxy } from "wrangler";
import { D1ImageRepository } from "../src/images/d1-repository.ts";
import type { R2Bucket } from "../src/images/r2.ts";
import { createR2Http } from "../src/images/r2-http.ts";
import type { ImageRepository } from "../src/images/repository.ts";
import { R2ImageStore } from "../src/images/store.ts";
import type { ImageStore } from "../src/images/store.ts";
import type { ImageInfo } from "../src/images/types.ts";
import type { D1Database } from "../src/posts/d1.ts";
import { createD1Http } from "../src/posts/d1-http.ts";
import { D1PostRepository } from "../src/posts/d1-repository.ts";
import type { Post } from "../src/posts/types.ts";
import { setCodeHighlighter } from "../src/markdown/index.ts";
import { createCodeHighlighter } from "../src/markdown/highlight.ts";
import { createMathRenderer } from "../src/markdown/katex.ts";
import { embedUrls, setEmbedResolver, setMathRenderer } from "../src/markdown/index.ts";
import type { EmbedView } from "../src/markdown/index.ts";
import { copyKatex } from "./copy-katex.ts";
import { buildSite } from "../src/site/build.ts";
import { D1IssueRepository } from "../src/issues/issues.ts";
import type { IssueRepository } from "../src/issues/issues.ts";
import { DEFAULT_SETTINGS, D1SettingsRepository } from "../src/settings/settings.ts";
import type { SettingsRepository } from "../src/settings/settings.ts";
import { SITE_CONFIG } from "../src/site/config.ts";
import { fileNameFor } from "../src/site/files.ts";
import { collectImageNames } from "../src/site/images.ts";
import { D1EmbedRepository } from "../src/embeds/repository.ts";
import type { EmbedRepository } from "../src/embeds/repository.ts";
import { D1TranslationRepository } from "../src/translations/d1-repository.ts";
import type { TranslationRepository } from "../src/translations/repository.ts";
import { TRANSLATION_LANGS } from "../src/translations/types.ts";
import type { PublishedTranslation } from "../src/translations/types.ts";

const OUT_DIR = "dist/site";
const IMAGES_DIR = join(OUT_DIR, "images");
const STATIC_DIR = "site-static";
const EMBEDS_DIR = join(OUT_DIR, "embeds");
const WRANGLER_CONFIG = "wrangler.jsonc";
/** 이미지를 동시에 몇 개씩 받을지 */
const DOWNLOAD_CONCURRENCY = 6;

/** 데이터를 읽어 오는 곳 (로컬 / 원격) */
interface Source {
  label: string;
  posts: D1PostRepository;
  translations: TranslationRepository;
  embeds: EmbedRepository;
  images: ImageRepository;
  settings: SettingsRepository;
  issues: IssueRepository;
  files: ImageStore;
  close(): Promise<void>;
}

/** wrangler.jsonc에서 값 하나 ("database_id", "bucket_name"). 한 곳에서만 관리한다 */
async function configValue(key: string): Promise<string> {
  const config = await readFile(WRANGLER_CONFIG, "utf8");
  const value = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`).exec(config)?.[1];
  if (!value) throw new Error(`${WRANGLER_CONFIG}에서 ${key}를 찾지 못했어요`);
  return value;
}

/** 원격: D1·R2 모두 HTTP API로 (Worker 밖이라 진짜 연결이 없음) */
async function openRemote(): Promise<Source> {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!apiToken || !accountId) {
    throw new Error("--remote 에는 환경 변수 CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID 가 필요해요");
  }
  const db = createD1Http({ accountId, databaseId: await configValue("database_id"), apiToken });
  const bucket = createR2Http({ accountId, bucketName: await configValue("bucket_name"), apiToken });
  return {
    label: "원격",
    posts: new D1PostRepository(db),
    translations: new D1TranslationRepository(db),
    embeds: new D1EmbedRepository(db),
    images: new D1ImageRepository(db),
    settings: new D1SettingsRepository(db),
    issues: new D1IssueRepository(db),
    files: new R2ImageStore(bucket),
    close: async () => {},
  };
}

/** 로컬: wrangler dev가 쓰는 것과 같은 D1·R2 */
async function openLocal(): Promise<Source> {
  const proxy = await getPlatformProxy<{ DB: D1Database; IMAGES: R2Bucket }>({ configPath: WRANGLER_CONFIG, remoteBindings: false });
  return {
    label: "로컬",
    posts: new D1PostRepository(proxy.env.DB),
    translations: new D1TranslationRepository(proxy.env.DB),
    embeds: new D1EmbedRepository(proxy.env.DB),
    images: new D1ImageRepository(proxy.env.DB),
    settings: new D1SettingsRepository(proxy.env.DB),
    issues: new D1IssueRepository(proxy.env.DB),
    files: new R2ImageStore(proxy.env.IMAGES),
    close: () => proxy.dispose(),
  };
}

/** 내려받은 이미지 */
interface Downloaded {
  info: ImageInfo;
  bytes: Uint8Array;
}

/** 이미지를 쓰는 글 하나 (한글 글, 번역본은 대표 이미지 없이 본문만) */
type ImageUser = Pick<Post, "id" | "body" | "thumbnail">;

/**
 * 글이 쓰는 이미지의 정보·파일 읽기. 없는 것은 경고하고 빼고 계속한다
 * (이미지 하나 때문에 모든 글의 배포가 막히지 않게. 그 이미지만 깨져 보임)
 */
async function readImages(source: Source, posts: readonly ImageUser[]): Promise<Downloaded[]> {
  const names = collectImageNames(posts);
  const infos = new Map((await source.images.getMany(names)).map((info) => [info.name, info]));

  const downloaded: Downloaded[] = [];
  const missing = new Set(names.filter((name) => !infos.has(name)));
  const queue = [...infos.values()];
  const worker = async () => {
    for (let info = queue.shift(); info; info = queue.shift()) {
      const file = await source.files.get(info.name);
      if (!file) missing.add(info.name);
      else downloaded.push({ info, bytes: new Uint8Array(await new Response(file.body).arrayBuffer()) });
    }
  };
  await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, worker));

  for (const name of [...missing].sort()) {
    const usedBy = [...new Set(posts.filter((post) => collectImageNames([post]).includes(name)).map((post) => post.id))];
    console.warn(`⚠ 없는 이미지: /images/${name} (글 ${usedBy.map((id) => (id === 0 ? "설정·이슈" : id)).join(", ")}) → 이 이미지는 깨져 보여요`);
  }
  return downloaded.sort((a, b) => (a.info.name < b.info.name ? -1 : 1));
}

/**
 * 임베드 카드 (설계 13-9): 글에 쓰인 !embed 주소들의 저장된 정보(D1)를 읽어 렌더러에 꽂고, 카드 그림을 R2에서 받음.
 * 빌드는 남의 사이트에 접속하지 않는다 → 저장된 게 없으면 단순 카드 (관리자 미리보기에서 한 번 보면 채워짐)
 */
async function readEmbeds(source: Source, bodies: readonly string[]): Promise<{ count: number; images: { name: string; bytes: Uint8Array }[] }> {
  const urls = [...new Set(bodies.flatMap((body) => embedUrls(body)))];
  const infos = await source.embeds.getMany(urls);
  const images: { name: string; bytes: Uint8Array }[] = [];
  for (const info of infos) {
    if (!info.image) continue;
    const file = await source.files.get(info.image).catch(() => null);
    if (file) images.push({ name: info.image, bytes: new Uint8Array(await new Response(file.body).arrayBuffer()) });
    else console.warn(`⚠ 없는 카드 그림: ${info.image} (${info.url}) → 그림 없이`);
  }
  const saved = new Set(images.map((image) => image.name));
  const views = new Map<string, EmbedView>(
    infos.map((info) => [info.url, { ...info, imageSrc: info.image && saved.has(info.image) ? `/embeds/${info.image}` : null }]),
  );
  setEmbedResolver((url) => views.get(url));
  const missing = urls.filter((url) => !views.has(url));
  if (missing.length > 0) console.warn(`⚠ 정보가 저장되지 않은 임베드 ${missing.length}개 → 단순 카드 (관리자 미리보기에서 한 번 열면 채워져요): ${missing.join(", ")}`);
  return { count: infos.length, images };
}

async function main(): Promise<void> {
  const started = performance.now();
  // 코드 블록 색칠 (Shiki): 빌드는 항상 색을 HTML에 넣는다 (방문자 JS 없음)
  setCodeHighlighter(createCodeHighlighter());
  // 수식(KaTeX)도 빌드 때 HTML로 (방문자 JS 없음). CSS·글꼴은 아래에서 assets/katex로 복사
  setMathRenderer(createMathRenderer());
  const source = process.argv.includes("--remote") ? await openRemote() : await openLocal();
  try {
    const posts = await source.posts.listPublished();
    // 번역 언어마다 공개된 번역본 (공개된 한글 글의 것만 쓰는 건 buildSite가 거름)
    const translations: PublishedTranslation[] = [];
    for (const lang of TRANSLATION_LANGS) translations.push(...(await source.translations.listPublished(lang)));
    // 사이트 설정 (설계 15-3): 저장한 적 없으면 기본값. 프로필 사진도 이미지처럼 복사 (id 0 = 설정)
    const settings = (await source.settings.get())?.settings ?? DEFAULT_SETTINGS;
    // 이슈 (설계 15-5): 내용의 이미지·임베드도 글처럼 (id 0 = 글이 아님)
    const issues = await source.issues.list();
    const issueBodies = issues.flatMap((issue) => [issue.body, issue.bodyEn ?? ""]);
    const imageUsers = [
      ...posts,
      ...translations.map((t) => ({ id: t.postId, body: t.body, thumbnail: null })),
      ...(settings.photo ? [{ id: 0, body: "", thumbnail: settings.photo }] : []),
      ...issueBodies.map((body) => ({ id: 0, body, thumbnail: null })),
    ];
    const images = await readImages(source, imageUsers);
    // 태그 상하관계 (설계 14): 글의 태그에 상위 태그를 붙이고 태그 모음을 트리로
    const tagParents = await source.posts.listTagParents();
    const embeds = await readEmbeds(source, [...posts.map((p) => p.body), ...translations.map((t) => t.body), ...issueBodies]);
    const files = await buildSite({ site: SITE_CONFIG, settings, issues, posts, translations, tagParents, images: images.map((image) => image.info) });

    // 지난 빌드의 파일(지운 글 등)이 남지 않게 통째로 비우고 다시 쓴다
    await rm(OUT_DIR, { recursive: true, force: true });
    await cp(STATIC_DIR, OUT_DIR, { recursive: true });
    await copyKatex(join(OUT_DIR, "assets", "katex"));
    for (const [urlPath, content] of files) {
      const target = join(OUT_DIR, fileNameFor(urlPath));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
    }
    // 임베드 카드 그림 (설계 13-9): R2 → dist/site/embeds/
    await mkdir(EMBEDS_DIR, { recursive: true });
    for (const { name, bytes } of embeds.images) await writeFile(join(EMBEDS_DIR, name), bytes);
    await mkdir(IMAGES_DIR, { recursive: true });
    for (const { info, bytes } of images) await writeFile(join(IMAGES_DIR, info.name), bytes);

    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    const megabytes = (images.reduce((sum, image) => sum + image.bytes.byteLength, 0) / 1024 / 1024).toFixed(1);
    console.log(
      `${source.label} D1·R2: 공개 글 ${posts.length}개 (번역 ${translations.length}개, 이슈 ${issues.length}개) → 파일 ${files.size}개 + 이미지 ${images.length}개 (${megabytes}MB) (+ 정적 파일) → ${OUT_DIR}/ (${seconds}초)`,
    );
  } finally {
    await source.close();
  }
}

await main();
