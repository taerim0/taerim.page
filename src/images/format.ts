/**
 * 이미지 파일 앞부분(매직 바이트)으로 형식을 판단하고, 파일 머리에서 가로·세로를 읽는다.
 * 브라우저가 보낸 Content-Type이나 파일 이름은 믿지 않는다.
 *
 * 받는 형식: WebP(브라우저에서 변환한 것), GIF(원본 그대로)
 */
import type { ImageContentType } from "./types.ts";

/** 형식과 크기 */
export interface ImageFormat {
  contentType: ImageContentType;
  /** 파일 확장자 (점 없이) */
  extension: "webp" | "gif";
  width: number;
  height: number;
}

/** 가로·세로 최대 (WebP 형식의 한계값과 같음) */
export const MAX_IMAGE_DIMENSION = 16383;

/**
 * 형식·크기를 읽는다. WebP·GIF가 아니거나, 머리가 깨졌거나, 크기가 1~16383px가 아니면 null
 */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  const found = readGif(bytes) ?? readWebp(bytes);
  if (!found) return null;
  const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX_IMAGE_DIMENSION;
  return ok(found.width) && ok(found.height) ? found : null;
}

/** 글자(ASCII)가 그 자리에 있는지 */
function hasText(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/** 리틀 엔디언(낮은 바이트 먼저) 정수. 바이트가 모자라면 NaN */
function uint(bytes: Uint8Array, offset: number, length: number): number {
  if (bytes.length < offset + length) return Number.NaN;
  let value = 0;
  for (let i = length - 1; i >= 0; i--) value = value * 256 + bytes[offset + i]!;
  return value;
}

/** GIF: "GIF87a" 또는 "GIF89a", 6~7바이트 가로, 8~9바이트 세로 */
function readGif(bytes: Uint8Array): ImageFormat | null {
  if (!hasText(bytes, 0, "GIF87a") && !hasText(bytes, 0, "GIF89a")) return null;
  return { contentType: "image/gif", extension: "gif", width: uint(bytes, 6, 2), height: uint(bytes, 8, 2) };
}

/**
 * WebP: "RIFF" ????(크기) "WEBP" + 첫 덩어리 종류(12~15바이트)에 따라 크기 위치가 다르다
 * - "VP8 " (손실 압축): 23~25바이트 시작 표시 9D 01 2A, 26바이트 가로·28바이트 세로 (각 아래 14비트)
 * - "VP8L" (무손실): 20바이트 표시 2F, 21바이트부터 (가로-1) 14비트 + (세로-1) 14비트
 * - "VP8X" (확장: 투명도·애니메이션 등): 24바이트 (가로-1) 24비트, 27바이트 (세로-1) 24비트
 */
function readWebp(bytes: Uint8Array): ImageFormat | null {
  if (!hasText(bytes, 0, "RIFF") || !hasText(bytes, 8, "WEBP")) return null;
  const size = (width: number, height: number): ImageFormat => ({ contentType: "image/webp", extension: "webp", width, height });

  if (hasText(bytes, 12, "VP8 ")) {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    return size(uint(bytes, 26, 2) & 0x3fff, uint(bytes, 28, 2) & 0x3fff);
  }
  if (hasText(bytes, 12, "VP8L")) {
    if (bytes[20] !== 0x2f) return null;
    const bits = uint(bytes, 21, 4);
    return size((bits & 0x3fff) + 1, (Math.floor(bits / 0x4000) & 0x3fff) + 1);
  }
  if (hasText(bytes, 12, "VP8X")) {
    return size(uint(bytes, 24, 3) + 1, uint(bytes, 27, 3) + 1);
  }
  return null;
}
