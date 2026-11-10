/**
 * 관리자 미리보기용 수식 묶음 (`npm run build:admin` → admin-ui/assets/math.js, 설계 13-8)
 *
 * KaTeX가 무거워서 렌더러 묶음(lib.js)과 나눴다. 편집 화면은 처음엔 수식 원문을 회색 코드 모양으로 그리고,
 * 본문에 $가 있으면 이 파일을 불러와 lib.js의 setMathRenderer로 꽂은 뒤 다시 그린다.
 */
export { createMathRenderer } from "./markdown/katex.ts";
