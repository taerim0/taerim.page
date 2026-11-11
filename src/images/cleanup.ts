/**
 * 안 쓰이는 이미지 정리 (설계 11-16 + 보충, docs/16).
 *
 * "쓰인다" = 아래 글자 어디에든 /images/이름 이 있으면 (빌드와 같은 찾기 규칙, 코드 블록 안도 쓰임으로 → 지우는 쪽으로 실수 안 함)
 *   글(초안·공개·휴지통)의 본문·대표 이미지 / 작업본 / 번역 공개본·초안 / 활동 내용(한·영) / 사이트 설정 프로필 사진
 * 최근 24시간 안에 올린 이미지는 지울 수 없음 (편집 화면에 붙여 넣고 아직 저장 안 했을 수 있어서)
 * 임베드 카드 그림(embed-…)은 범위 밖 (이름 규칙이 달라 여기 목록에 안 나옴)
 */
import type { D1Database } from "../posts/d1.ts";
import type { ImageRepository } from "./repository.ts";
import type { ImageStore } from "./store.ts";
import type { ImageInfo } from "./types.ts";

/** 이미지를 쓰는 곳 하나 */
export type ImageOwner =
  | { kind: "post"; id: number; title: string }
  | { kind: "activity"; id: number; title: string }
  | { kind: "settings" };

/** 이미지를 쓸 수 있는 글자 하나 (본문·대표 이미지 등) + 그 주인 */
export interface ImageUseText {
  owner: ImageOwner;
  text: string;
}

/** 이미지를 쓸 수 있는 모든 글자를 주는 곳 */
export interface ImageUseSource {
  texts(): Promise<ImageUseText[]>;
}

/** 빌드(src/site/images.ts)와 같은 규칙 */
const IMAGE_PATH = /\/images\/([0-9a-f]{12}\.(?:webp|gif))/g;

/** 이름 → 쓰는 곳들 (같은 주인은 한 번만) */
export function findUses(texts: readonly ImageUseText[]): Map<string, ImageOwner[]> {
  const uses = new Map<string, Map<string, ImageOwner>>();
  for (const { owner, text } of texts) {
    for (const match of text.matchAll(IMAGE_PATH)) {
      const name = match[1]!;
      let owners = uses.get(name);
      if (!owners) uses.set(name, (owners = new Map()));
      owners.set(ownerKey(owner), owner);
    }
  }
  return new Map([...uses].map(([name, owners]) => [name, [...owners.values()]]));
}

function ownerKey(owner: ImageOwner): string {
  return owner.kind === "settings" ? "settings" : `${owner.kind}-${owner.id}`;
}

/** 지울 수 없는 기간 (올린 뒤) */
export const RECENT_UPLOAD_MS = 24 * 60 * 60 * 1000;

/** 정리 화면의 이미지 한 장 */
export interface CleanupImage extends ImageInfo {
  usedBy: ImageOwner[];
  /** 최근 24시간 안에 올림 */
  recent: boolean;
  /** 안 쓰이고 최근 것도 아님 */
  deletable: boolean;
}

export interface DeleteResult {
  deleted: string[];
  /** 쓰임·최근·없는 이름 */
  kept: string[];
}

export class ImageCleanupService {
  readonly #images: ImageRepository;
  readonly #store: ImageStore;
  readonly #uses: ImageUseSource;
  readonly #now: () => Date;

  constructor(images: ImageRepository, store: ImageStore, uses: ImageUseSource, options: { now?: () => Date } = {}) {
    this.#images = images;
    this.#store = store;
    this.#uses = uses;
    this.#now = options.now ?? (() => new Date());
  }

  /** 모든 이미지 (오래된 순) + 쓰는 곳 + 지울 수 있는지 */
  async list(): Promise<CleanupImage[]> {
    const [images, uses] = await Promise.all([this.#images.list(), this.#uses.texts().then(findUses)]);
    const now = this.#now().getTime();
    return images.map((image) => {
      const usedBy = uses.get(image.name) ?? [];
      const recent = now - Date.parse(image.createdAt) < RECENT_UPLOAD_MS;
      return { ...image, usedBy, recent, deletable: usedBy.length === 0 && !recent };
    });
  }

  /**
   * 고른 이미지 지우기. 지우는 순간 쓰임을 다시 계산한다 (그새 글에 넣었을 수도 있으므로).
   * R2 파일 먼저 → D1 행 (파일만 지워지고 행이 남으면 다음 정리 때 다시 지울 수 있게)
   */
  async delete(names: readonly string[]): Promise<DeleteResult> {
    const byName = new Map((await this.list()).map((image) => [image.name, image]));
    const result: DeleteResult = { deleted: [], kept: [] };
    for (const name of new Set(names)) {
      if (!byName.get(name)?.deletable) {
        result.kept.push(name);
        continue;
      }
      await this.#store.delete(name);
      await this.#images.delete(name);
      result.deleted.push(name);
    }
    return result;
  }
}

// ── D1에서 글자 모으기 ─────────────────────────────────

/** D1의 모든 표에서 이미지를 쓸 수 있는 글자를 읽는다 (휴지통 글 포함) */
export class D1ImageUseSource implements ImageUseSource {
  readonly #db: D1Database;

  constructor(db: D1Database) {
    this.#db = db;
  }

  async texts(): Promise<ImageUseText[]> {
    const all = async <Row>(sql: string) => (await this.#db.prepare(sql).all<Row>()).results;
    type PostText = { id: number; title: string; body: string; thumbnail: string | null };
    const [posts, drafts, translations, translationDrafts, activities, settings] = await Promise.all([
      all<PostText>("SELECT id, title, body, thumbnail FROM posts"),
      all<PostText>("SELECT p.id, p.title, d.body, d.thumbnail FROM post_drafts d JOIN posts p ON p.id = d.post_id"),
      all<PostText>("SELECT p.id, p.title, t.body, NULL AS thumbnail FROM post_translations t JOIN posts p ON p.id = t.post_id"),
      all<PostText>("SELECT p.id, p.title, t.body, NULL AS thumbnail FROM post_translation_drafts t JOIN posts p ON p.id = t.post_id"),
      all<{ id: number; title: string; body: string; body_en: string | null }>("SELECT id, title, body, body_en FROM activities"),
      all<{ data: string }>("SELECT data FROM site_settings"),
    ]);
    const texts: ImageUseText[] = [];
    for (const row of [...posts, ...drafts, ...translations, ...translationDrafts]) {
      texts.push({ owner: { kind: "post", id: row.id, title: row.title }, text: `${row.body}\n${row.thumbnail ?? ""}` });
    }
    for (const row of activities) {
      texts.push({ owner: { kind: "activity", id: row.id, title: row.title }, text: `${row.body}\n${row.body_en ?? ""}` });
    }
    // 설정은 JSON 통째로 (사진 칸 말고 다른 칸에 적힌 주소도 쓰임으로 → 안전한 쪽)
    for (const row of settings) texts.push({ owner: { kind: "settings" }, text: row.data });
    return texts;
  }
}
