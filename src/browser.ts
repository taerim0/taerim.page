/**
 * 관리자 화면(브라우저)용 번들의 입구. `npm run build:admin` → admin-ui/assets/lib.js
 *
 * 화면이 서버와 **같은 규칙**을 쓰도록, 규칙을 다시 적지 않고 서버 코드를 그대로 묶어서 보낸다.
 * - 렌더러: 미리보기 = 빌드 결과 (입력 중에는 바뀐 블록만, 멈추면 전체)
 * - 태그 정리·글자 수 세기: 화면 표시 = 서버 검사
 */
export {
  altFromFileName,
  fitWithin,
  imageMarkdown,
  MAX_IMAGE_SIDE,
  planUpload,
  replacePlaceholder,
  uploadingPlaceholder,
  WEBP_QUALITY,
} from "./images/client.ts";
export { blockIndexAt, createBlockPreview } from "./markdown/blocks.ts";
export { renderMarkdown, setCodeHighlighter } from "./markdown/index.ts";
export { charCount, isAllowedTag, normalizeTag, normalizeTags, TAG_CHARS_MESSAGE } from "./posts/validation.ts";
