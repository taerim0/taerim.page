/**
 * 편집 화면(브라우저)에서 이미지를 올릴 때 쓰는 순수 함수들. lib.js로 묶여 나간다.
 * 화면 연결·canvas 변환은 admin-ui/assets/image-upload.js가 한다.
 */
import { MAX_IMAGE_BYTES } from "./service.ts";

/** 변환 후 긴 변 최대 (픽셀) */
export const MAX_IMAGE_SIDE = 1600;

/** WebP 변환 품질 (0~1) */
export const WEBP_QUALITY = 0.85;

/** 브라우저에서 WebP로 바꿔서 올리는 형식 */
const CONVERTIBLE = new Set(["image/png", "image/jpeg", "image/webp"]);

/** 받은 파일을 어떻게 할지 */
export type UploadPlan =
  | { kind: "convert" }
  | { kind: "as-is" }
  | { kind: "reject"; message: string };

/**
 * 파일 형식·크기로 처리 방법 정하기 (서버가 다시 확인하므로 빠른 안내용)
 * - PNG·JPEG·WebP → WebP로 변환
 * - GIF → 그대로 (움직임 유지), 5MB 넘으면 거절
 */
export function planUpload(type: string, size: number): UploadPlan {
  if (CONVERTIBLE.has(type)) return { kind: "convert" };
  if (type === "image/gif") {
    return size <= MAX_IMAGE_BYTES ? { kind: "as-is" } : { kind: "reject", message: "GIF는 5MB까지 올릴 수 있어요" };
  }
  return { kind: "reject", message: "PNG·JPEG·WebP·GIF만 올릴 수 있어요" };
}

/** 긴 변이 max를 넘으면 비율대로 줄인 크기. 작은 이미지는 키우지 않는다 */
export function fitWithin(width: number, height: number, max = MAX_IMAGE_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Markdown 링크 문법을 깨는 글자([ ] \)와 줄바꿈을 뺀다 */
function cleanText(text: string): string {
  return text.replace(/[[\]\\\r\n]/g, "").trim();
}

/** 클립보드에서 붙여넣은 이미지의 파일 이름 (브라우저가 붙이는 이름) */
const CLIPBOARD_NAMES = new Set(["image", "blob", ""]);

/** 이미지 설명(alt): 파일 이름에서 확장자를 뺀 것. 클립보드 이미지·빈 이름은 "이미지" */
export function altFromFileName(fileName: string): string {
  const base = cleanText(fileName.replace(/\.[^./\\]+$/, ""));
  return CLIPBOARD_NAMES.has(base.toLowerCase()) ? "이미지" : base;
}

/** 올리는 동안 본문에 넣는 자리 표시. id로 서로 구분한다 */
export function uploadingPlaceholder(id: number, fileName: string): string {
  return `![업로드 중: ${cleanText(fileName) || "이미지"}](#uploading-${id})`;
}

/** 올린 이미지의 Markdown */
export function imageMarkdown(alt: string, name: string): string {
  return `![${cleanText(alt)}](/images/${name})`;
}

/**
 * 본문에서 자리 표시를 찾아 바꾼다. 그동안 지웠거나 고쳤으면 null
 * @returns 바뀐 본문, 바꾼 자리의 시작 위치
 */
export function replacePlaceholder(
  text: string,
  placeholder: string,
  replacement: string,
): { text: string; index: number } | null {
  const index = text.indexOf(placeholder);
  if (index === -1) return null;
  return { text: text.slice(0, index) + replacement + text.slice(index + placeholder.length), index };
}
