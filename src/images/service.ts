/**
 * 이미지 기능: 올리기(확인 → 이름 정하기 → 저장)와 꺼내기.
 * 파일 내용은 ImageStore(R2), 정보는 ImageRepository(D1)에 둔다.
 */
import { ImageError } from "./errors.ts";
import { detectImageFormat } from "./format.ts";
import type { ImageRepository } from "./repository.ts";
import type { ImageStore, StoredImage } from "./store.ts";
import type { ImageInfo } from "./types.ts";

/** 이미지 하나 최대 크기: 5MB */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** 원래 파일 이름 최대 길이 (글자 수) */
export const MAX_ORIGINAL_NAME = 200;

/** 이미지 이름 모양: 내용 해시 12자 + 확장자 */
export const IMAGE_NAME = /^[0-9a-f]{12}\.(webp|gif)$/;

/** 원래 파일 이름이 없거나 비었을 때 */
const DEFAULT_ORIGINAL_NAME = "image";

export interface ImageServiceOptions {
  /** 지금 시각. 테스트에서 바꿔 끼운다 */
  now?: () => Date;
}

/** 올리기 결과 */
export interface UploadResult {
  image: ImageInfo;
  /** 새로 저장했으면 true, 같은 이미지가 이미 있었으면 false */
  created: boolean;
}

export class ImageService {
  readonly #store: ImageStore;
  readonly #repository: ImageRepository;
  readonly #now: () => Date;

  constructor(store: ImageStore, repository: ImageRepository, options: ImageServiceOptions = {}) {
    this.#store = store;
    this.#repository = repository;
    this.#now = options.now ?? (() => new Date());
  }

  /**
   * 올리기. 형식·크기·이름은 서버가 파일 내용으로 직접 정한다.
   * 저장 순서: R2 먼저 → D1. 중간에 실패하면 R2에 목록에 없는 파일만 남는다(글에 들어가지 않으므로 안전)
   */
  async upload(bytes: Uint8Array, originalName: string | null): Promise<UploadResult> {
    if (bytes.byteLength === 0) throw new ImageError("empty", "빈 파일이에요");
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new ImageError("too_large", "이미지는 5MB까지 올릴 수 있어요");

    const format = detectImageFormat(bytes);
    if (!format) throw new ImageError("unsupported", "WebP나 GIF만 올릴 수 있어요 (파일이 깨졌을 수도 있어요)");

    const name = `${await contentHash(bytes)}.${format.extension}`;
    const existing = await this.#repository.get(name);
    if (existing) return { image: existing, created: false };

    const image: ImageInfo = {
      name,
      originalName: cleanOriginalName(originalName),
      contentType: format.contentType,
      width: format.width,
      height: format.height,
      size: bytes.byteLength,
      createdAt: this.#now().toISOString(),
    };
    await this.#store.put(name, bytes, format.contentType);
    // 동시에 같은 이미지를 올린 경우 다른 쪽이 먼저 기록했을 수 있다 → 그쪽 정보를 돌려준다
    const created = await this.#repository.add(image);
    return created ? { image, created } : { image: (await this.#repository.get(name)) ?? image, created };
  }

  /** 꺼내기. 이름 모양이 틀리거나 없으면 null */
  async open(name: string): Promise<StoredImage | null> {
    if (!IMAGE_NAME.test(name)) return null;
    return this.#store.get(name);
  }
}

/** SHA-256(내용)의 앞 12자 (16진수) */
async function contentHash(bytes: Uint8Array): Promise<string> {
  // subtle.digest는 ArrayBuffer 기반 배열만 받는다 → 복사본으로
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

/** 원래 파일 이름 정리: 제어 문자 제거, 앞뒤 공백 제거, 최대 200자, 비면 "image" */
export function cleanOriginalName(name: string | null): string {
  // \p{Cc} = 제어 문자(줄바꿈·탭 등)
  const cleaned = (name ?? "").replace(/\p{Cc}/gu, "").trim();
  return [...cleaned].slice(0, MAX_ORIGINAL_NAME).join("").trim() || DEFAULT_ORIGINAL_NAME;
}
