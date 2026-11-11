/**
 * 이미지 파일 내용 저장소 (R2). 이미지 정보(크기·목록)는 ImageRepository(D1)가 따로 맡는다.
 *
 * - 이름은 내용 해시라서 같은 이름 = 같은 내용 → 같은 이름으로 다시 넣으면 그냥 덮어쓴다
 * - 이름·형식이 올바른지는 부르는 쪽(서비스)이 확인한다. 저장소는 저장만 한다
 */
import type { R2Bucket } from "./r2.ts";

/** 꺼낸 이미지 파일 */
export interface StoredImage {
  /** 파일 내용 (한 번만 읽을 수 있음) */
  body: ReadableStream<Uint8Array>;
  contentType: string;
  /** 바이트 */
  size: number;
}

export interface ImageStore {
  put(name: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** 없으면 null */
  get(name: string): Promise<StoredImage | null>;
  /** 지우기 (없어도 오류 아님) */
  delete(name: string): Promise<void>;
}

/** 형식 정보가 없을 때 (정상이라면 생기지 않음) */
const UNKNOWN_TYPE = "application/octet-stream";

/** 실제 블로그: R2 버킷 */
export class R2ImageStore implements ImageStore {
  readonly #bucket: R2Bucket;

  constructor(bucket: R2Bucket) {
    this.#bucket = bucket;
  }

  async put(name: string, bytes: Uint8Array, contentType: string): Promise<void> {
    await this.#bucket.put(name, bytes, { httpMetadata: { contentType } });
  }

  async get(name: string): Promise<StoredImage | null> {
    const object = await this.#bucket.get(name);
    if (!object) return null;
    return { body: object.body, contentType: object.httpMetadata?.contentType ?? UNKNOWN_TYPE, size: object.size };
  }

  async delete(name: string): Promise<void> {
    await this.#bucket.delete(name);
  }
}

/** 테스트·개발용: 메모리. 넣을 때 복사해 두므로 밖에서 원래 배열을 고쳐도 영향 없음 */
export class MemoryImageStore implements ImageStore {
  readonly #files = new Map<string, { bytes: Uint8Array; contentType: string }>();

  async put(name: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.#files.set(name, { bytes: bytes.slice(), contentType });
  }

  async get(name: string): Promise<StoredImage | null> {
    const file = this.#files.get(name);
    if (!file) return null;
    const bytes = file.bytes.slice();
    return { body: new Blob([bytes]).stream(), contentType: file.contentType, size: bytes.byteLength };
  }

  async delete(name: string): Promise<void> {
    this.#files.delete(name);
  }
}
