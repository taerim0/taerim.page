import type { ImageRepository } from "./repository.ts";
import type { ImageInfo } from "./types.ts";

/** 메모리 저장소 (테스트·개발용). 넣을 때·돌려줄 때 복사본을 쓴다 */
export class MemoryImageRepository implements ImageRepository {
  readonly #images = new Map<string, ImageInfo>();

  async add(info: ImageInfo): Promise<boolean> {
    if (this.#images.has(info.name)) return false;
    this.#images.set(info.name, { ...info });
    return true;
  }

  async get(name: string): Promise<ImageInfo | null> {
    const info = this.#images.get(name);
    return info ? { ...info } : null;
  }

  async getMany(names: readonly string[]): Promise<ImageInfo[]> {
    return [...new Set(names)].sort().flatMap((name) => {
      const info = this.#images.get(name);
      return info ? [{ ...info }] : [];
    });
  }

  async list(): Promise<ImageInfo[]> {
    return [...this.#images.values()]
      .map((info) => ({ ...info }))
      .sort((a, b) => (a.createdAt === b.createdAt ? (a.name < b.name ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1));
  }

  async delete(name: string): Promise<boolean> {
    return this.#images.delete(name);
  }
}
