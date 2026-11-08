/** 받는 이미지 형식. WebP = 브라우저에서 변환한 것, GIF = 움직임을 살리려고 원본 그대로 */
export const IMAGE_CONTENT_TYPES = ["image/webp", "image/gif"] as const;
export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number];

/** 이미지 정보 (D1 images 테이블 한 행) */
export interface ImageInfo {
  /** 내용 해시 12자 + 확장자. 예) "3f9a1c2b7d4e.webp" = R2 키 = 주소 /images/{name} */
  name: string;
  /** 올릴 때 파일 이름 */
  originalName: string;
  contentType: ImageContentType;
  /** 픽셀 */
  width: number;
  height: number;
  /** 바이트 */
  size: number;
  /** 처음 올린 시각 (ISO 8601 UTC) */
  createdAt: string;
}
