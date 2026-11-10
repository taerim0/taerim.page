/**
 * KaTeX 수식 그리개 (설계 13-8). 렌더러 묶음(lib.js)에는 넣지 않고,
 * 빌드 스크립트와 관리자 미리보기용 따로 묶음(math.js)만 이 파일을 가져다 쓴다.
 *
 * - HTML + MathML(화면 읽기 프로그램용) 함께
 * - 틀린 수식은 오류 없이 빨간 원문 + 마우스를 올리면 이유 (빌드가 멈추지 않게)
 * - trust: false (기본) → \href{javascript:…} 같은 위험한 명령은 그리지 않음
 * - 화면에는 KaTeX CSS·글꼴이 필요하다 (공개 사이트: 수식 있는 글만, 관리자: 편집·번역 화면)
 */
import katex from "katex";
import type { MathRenderer } from "./math.ts";

export function createMathRenderer(): MathRenderer {
  return (tex, displayMode) =>
    katex.renderToString(tex, { displayMode, throwOnError: false, output: "htmlAndMathml", strict: "ignore", trust: false });
}
