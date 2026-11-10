/**
 * 관리자 미리보기용 코드 색칠 묶음 (`npm run build:admin` → admin-ui/assets/highlight.js, 설계 13-6)
 *
 * Shiki가 무거워서 렌더러 묶음(lib.js)과 나눴다. 편집 화면은 처음엔 색 없이 그리고,
 * 본문에 코드 블록이 있으면 이 파일을 불러와 lib.js의 setCodeHighlighter로 꽂은 뒤 다시 그린다.
 */
export { createCodeHighlighter } from "./markdown/highlight.ts";
