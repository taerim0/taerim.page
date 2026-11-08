/** 이미지를 받을 수 없는 이유 */
export type ImageErrorKind =
  /** 빈 파일 */
  | "empty"
  /** 5MB 초과 */
  | "too_large"
  /** WebP·GIF가 아니거나 파일이 깨짐 */
  | "unsupported";

/** 이미지 올리기 실패 (관리자 API가 too_large → 413, 나머지 → 400으로 바꾼다) */
export class ImageError extends Error {
  readonly kind: ImageErrorKind;

  constructor(kind: ImageErrorKind, message: string) {
    super(message);
    this.name = "ImageError";
    this.kind = kind;
  }
}
