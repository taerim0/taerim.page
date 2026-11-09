/**
 * 공개 사이트 빌드에서 쓰는 이미지 도우미 (순수 함수).
 */
import type { ImageInfo } from "../images/types.ts";
import type { Post } from "../posts/types.ts";

/** 블로그 이미지 주소 앞부분. R2 키 = 이름, 공개 주소 = /images/{이름} */
export const SITE_IMAGE_PREFIX = "/images/";

/** 본문·대표 이미지 안의 블로그 이미지 주소: /images/ + 내용 해시 12자 + .webp|.gif */
const IMAGE_PATH = /\/images\/([0-9a-f]{12}\.(?:webp|gif))/g;

/**
 * 글들이 쓰는 블로그 이미지 이름 (본문 + 대표 이미지). 이름순, 중복 없음.
 * 글자 그대로 찾으므로 코드 블록 안에 적은 주소도 잡힐 수 있다 → 파일 하나 더 복사될 뿐이라 단순한 쪽으로.
 * 외부 이미지(https://…)는 손대지 않는다
 */
export function collectImageNames(posts: readonly Pick<Post, "body" | "thumbnail">[]): string[] {
  const names = new Set<string>();
  for (const post of posts) {
    for (const text of [post.body, post.thumbnail ?? ""]) {
      for (const match of text.matchAll(IMAGE_PATH)) names.add(match[1]!);
    }
  }
  return [...names].sort();
}

/** 원래 크기 */
export interface ImageSize {
  width: number;
  height: number;
}

/** 이미지 정보 → { "/images/이름": 크기 } (렌더러·목록이 <img width height>에 쓴다) */
export function imageSizeMap(images: readonly ImageInfo[]): Map<string, ImageSize> {
  return new Map(images.map((image) => [`${SITE_IMAGE_PREFIX}${image.name}`, { width: image.width, height: image.height }]));
}
