import type { R2Bucket } from "../images/r2.ts";
import { readPageMeta } from "./html-meta.ts";
import { EMBED_IMAGE_TYPES, embedTarget, MAX_EMBED_IMAGE_BYTES } from "./types.ts";
import type { EmbedInfo } from "./types.ts";

/**
 * 카드 정보 받기 (설계 13-9, 관리자 Worker에서). 실패해도 던지지 않고 ok: false 카드를 돌려준다.
 * - 저장소: GitHub API /repos/주인/저장소 (이름·설명·별·언어, 그림 없음)
 * - 링크: 페이지 HTML의 og 태그(5초, 1MB까지) + 대표 그림을 R2에 저장(5초, 500KB, JPEG·PNG·WebP·GIF)
 */
export interface EmbedFetchDeps {
  fetch?: typeof globalThis.fetch;
  /** 대표 그림 저장소. 없으면 그림 없이 */
  bucket?: R2Bucket;
  /** GitHub API 토큰 (있으면 요청 한도가 넉넉해짐, 없어도 됨) */
  githubToken?: string;
  now?: () => Date;
}

const TIMEOUT_MS = 5000;
const MAX_HTML_BYTES = 1024 * 1024;
const USER_AGENT = "taerim.page link preview (+https://taerim.page)";

export async function fetchEmbed(url: string, deps: EmbedFetchDeps = {}): Promise<EmbedInfo> {
  const fetchFn = deps.fetch ?? globalThis.fetch;
  const fetchedAt = (deps.now ?? (() => new Date()))().toISOString();
  const target = embedTarget(url);
  const empty: EmbedInfo = {
    url,
    kind: target?.kind ?? "link",
    ok: false,
    title: null,
    description: null,
    siteName: null,
    image: null,
    stars: null,
    language: null,
    fetchedAt,
  };
  if (!target) return empty;

  try {
    if (target.kind === "repo") {
      const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": USER_AGENT };
      if (deps.githubToken) headers.Authorization = `Bearer ${deps.githubToken}`;
      const response = await withTimeout(fetchFn, `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`, { headers });
      if (!response.ok) return empty;
      const repo = (await response.json()) as { full_name?: string; description?: string | null; stargazers_count?: number; language?: string | null };
      return {
        ...empty,
        ok: true,
        title: repo.full_name ?? `${target.owner}/${target.repo}`,
        description: repo.description ?? null,
        siteName: "GitHub",
        stars: typeof repo.stargazers_count === "number" ? repo.stargazers_count : null,
        language: repo.language ?? null,
      };
    }

    const response = await withTimeout(fetchFn, url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" } });
    const type = response.headers.get("Content-Type") ?? "";
    if (!response.ok || !/html/i.test(type)) return empty;
    const html = new TextDecoder().decode(await readLimited(response, MAX_HTML_BYTES));
    const meta = readPageMeta(html, response.url || url);
    const image = meta.image && deps.bucket ? await saveImage(meta.image, fetchFn, deps.bucket) : null;
    return {
      ...empty,
      ok: meta.title !== null || meta.description !== null,
      title: meta.title,
      description: meta.description,
      siteName: meta.siteName,
      image,
    };
  } catch {
    return empty; // 시간 초과·연결 실패 등 → 단순 카드
  }
}

/** 대표 그림을 받아 R2에 저장하고 이름을 돌려줌. 조건에 안 맞으면 null */
async function saveImage(url: string, fetchFn: typeof globalThis.fetch, bucket: R2Bucket): Promise<string | null> {
  try {
    const response = await withTimeout(fetchFn, url, { headers: { "User-Agent": USER_AGENT, Accept: "image/*" } });
    if (!response.ok) return null;
    const declared = Number(response.headers.get("Content-Length"));
    if (Number.isFinite(declared) && declared > MAX_EMBED_IMAGE_BYTES) return null;
    const bytes = await readLimited(response, MAX_EMBED_IMAGE_BYTES + 1);
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_EMBED_IMAGE_BYTES) return null;
    const contentType = sniffImage(bytes); // 서버가 말한 형식보다 내용으로 판단
    if (!contentType) return null;
    const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
    const name = `embed-${hash}.${EMBED_IMAGE_TYPES[contentType]}`;
    await bucket.put(name, bytes, { httpMetadata: { contentType } });
    return name;
  } catch {
    return null;
  }
}

/** 파일 앞부분으로 형식 판단: JPEG·PNG·WebP·GIF만 */
export function sniffImage(bytes: Uint8Array): string | null {
  const at = (i: number) => bytes[i] ?? -1;
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image/png";
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38) return "image/gif";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

async function withTimeout(fetchFn: typeof globalThis.fetch, url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchFn(url, { ...init, redirect: "follow", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 응답 본문을 limit 바이트까지만 읽음 (그 뒤는 버림) */
async function readLimited(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
    if (total >= limit) {
      await reader.cancel();
      break;
    }
  }
  const out = new Uint8Array(Math.min(total, limit));
  let offset = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, Math.min(chunk.byteLength, out.byteLength - offset));
    out.set(part, offset);
    offset += part.byteLength;
    if (offset >= out.byteLength) break;
  }
  return out;
}
