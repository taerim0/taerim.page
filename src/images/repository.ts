import type { ImageInfo } from "./types.ts";

/**
 * 이미지 정보 저장소 (D1 images 테이블). 파일 내용은 ImageStore(R2)가 따로 맡는다.
 *
 * - 이름은 내용 해시라서 같은 이름 = 같은 이미지. 이미 있으면 처음 정보를 그대로 둔다
 * - 값이 올바른지(이름 형식, 크기 등)는 부르는 쪽(서비스)이 확인한다
 */
export interface ImageRepository {
  /** 추가. 새로 넣었으면 true, 같은 이름이 이미 있어서 아무것도 안 했으면 false */
  add(info: ImageInfo): Promise<boolean>;
  /** 없으면 null */
  get(name: string): Promise<ImageInfo | null>;
  /**
   * 여러 개를 한 번에 (빌드: 글이 쓰는 이미지들의 크기 정보).
   * 없는 이름은 빠진다. 순서는 이름순. 같은 이름을 여러 번 넣어도 한 번만
   */
  getMany(names: readonly string[]): Promise<ImageInfo[]>;
  /** 모든 이미지 (정리 화면, 설계 11-16). 오래된 순, 같으면 이름순 */
  list(): Promise<ImageInfo[]>;
  /** 지우기. 지웠으면 true */
  delete(name: string): Promise<boolean>;
}
