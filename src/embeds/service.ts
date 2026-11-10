import type { R2Bucket } from "../images/r2.ts";
import { fetchEmbed } from "./fetcher.ts";
import type { EmbedFetchDeps } from "./fetcher.ts";
import type { EmbedRepository } from "./repository.ts";
import { EMBED_IMAGE_NAME, embedTarget } from "./types.ts";
import type { EmbedInfo } from "./types.ts";

/** 받은 정보를 다시 받기까지 (별 개수 등이 바뀌므로) */
export const EMBED_FRESH_MS = 7 * 24 * 60 * 60 * 1000;
/** 못 받았을 때 다시 시도하기까지 */
export const EMBED_RETRY_MS = 24 * 60 * 60 * 1000;

/**
 * 임베드 카드 정보 (설계 13-9, 관리자 미리보기가 부름).
 * 저장된 게 새것이면 그대로, 아니면 받아서 저장. 주소가 임베드 대상이 아니면 null
 */
export class EmbedService {
  readonly #repo: EmbedRepository;
  readonly #deps: EmbedFetchDeps;
  readonly #now: () => Date;

  constructor(repo: EmbedRepository, deps: EmbedFetchDeps = {}) {
    this.#repo = repo;
    this.#deps = deps;
    this.#now = deps.now ?? (() => new Date());
  }

  async get(url: string): Promise<EmbedInfo | null> {
    if (!embedTarget(url)) return null;
    const saved = await this.#repo.get(url);
    if (saved) {
      const age = this.#now().getTime() - new Date(saved.fetchedAt).getTime();
      if (age < (saved.ok ? EMBED_FRESH_MS : EMBED_RETRY_MS)) return saved;
    }
    const fresh = await fetchEmbed(url, { ...this.#deps, now: this.#now });
    // 다시 받다가 실패하면 예전에 받은 정보를 버리지 않는다 (시각만 갱신 → 하루 뒤 다시 시도)
    const toSave = !fresh.ok && saved?.ok ? { ...saved, fetchedAt: fresh.fetchedAt } : fresh;
    await this.#repo.save(toSave);
    return toSave;
  }

  /** 카드 그림 꺼내기 (관리자 미리보기용). 이름 모양이 틀리거나 없으면 null */
  async openImage(name: string): Promise<{ body: ReadableStream<Uint8Array>; contentType: string; size: number } | null> {
    if (!EMBED_IMAGE_NAME.test(name) || !this.#deps.bucket) return null;
    const object = await (this.#deps.bucket as R2Bucket).get(name);
    if (!object) return null;
    return { body: object.body, contentType: object.httpMetadata?.contentType ?? "application/octet-stream", size: object.size };
  }
}
