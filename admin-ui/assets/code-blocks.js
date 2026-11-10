// @ts-check
/**
 * 관리자 미리보기의 무거운 그리기 묶음과 코드 블록 (설계 13-6·13-8): 코드 색칠·수식 묶음 불러오기 + 복사 버튼
 *
 * - 색칠: Shiki(highlight.js, 약 2MB)는 무거워서 본문에 코드 블록이 처음 보일 때 한 번만 불러온다.
 *   불러오면 lib.js 렌더러에 꽂고 onReady로 미리보기를 다시 그리게 한다 (그 전까지는 색 없이)
 * - 복사: 공개 사이트 스크립트(i18n.ts SITE_SCRIPT)와 같은 규칙 — 줄마다 .code-text, 지운 줄(.line-del) 빼고
 */
import { setCodeHighlighter, setMathRenderer } from "./lib.js";

/** 코드 블록 여는 줄 (``` 또는 ~~~) */
const FENCE = /(^|\n) {0,3}(`{3,}|~{3,})/;

/** @type {"none" | "loading" | "ready"} */
let state = "none";

/**
 * 본문에 코드 블록이 있으면 색칠기를 (한 번만) 불러온다. 다 불러오면 onReady()
 * @param {string} markdown
 * @param {() => void} onReady
 */
export function loadHighlighterFor(markdown, onReady) {
  if (state !== "none" || !FENCE.test(markdown)) return;
  state = "loading";
  import("./highlight.js")
    .then((/** @type {{ createCodeHighlighter: () => import("../../src/markdown/code.ts").CodeHighlighter }} */ module) => {
      setCodeHighlighter(module.createCodeHighlighter());
      state = "ready";
      onReady();
    })
    .catch(() => {
      state = "none"; // 다음에 다시 시도 (색이 없을 뿐 미리보기는 그대로)
    });
}

/** @type {"none" | "loading" | "ready"} */
let mathState = "none";

/**
 * 본문에 $가 있으면 수식 그리개(math.js, KaTeX 약 260KB)를 (한 번만) 불러온다. 다 불러오면 onReady() (설계 13-8)
 * 그 전까지 수식은 원문이 회색 코드 모양으로 보임
 * @param {string} markdown
 * @param {() => void} onReady
 */
export function loadMathFor(markdown, onReady) {
  if (mathState !== "none" || !markdown.includes("$")) return;
  mathState = "loading";
  import("./math.js")
    .then((/** @type {{ createMathRenderer: () => import("../../src/markdown/math.ts").MathRenderer }} */ module) => {
      setMathRenderer(module.createMathRenderer());
      mathState = "ready";
      onReady();
    })
    .catch(() => {
      mathState = "none";
    });
}

/**
 * 코드 블록의 복사할 글자: 줄마다 코드만(줄 번호·diff 표시 빼고), 지운 줄은 빼고
 * @param {Element} block
 */
export function codeText(block) {
  return [...block.querySelectorAll(".line")]
    .filter((line) => !line.classList.contains("line-del"))
    .map((line) => line.querySelector(".code-text")?.textContent ?? "")
    .join("\n");
}

/**
 * root 안의 복사 버튼 연결 (미리보기는 내용이 계속 바뀌므로 root에 한 번만 걸어 둔다)
 * @param {HTMLElement} root
 */
export function bindCodeCopy(root) {
  root.addEventListener("click", (event) => {
    const button = /** @type {HTMLElement | null} */ (event.target instanceof Element ? event.target.closest(".code-copy") : null);
    const block = button?.closest(".code-block");
    if (!button || !block) return;
    event.preventDefault(); // 접힌 코드(summary 안이 아님)지만 혹시 모를 기본 동작 막기
    void navigator.clipboard.writeText(codeText(block)).then(() => {
      button.dataset.copied = "true";
      window.setTimeout(() => delete button.dataset.copied, 1500);
    });
  });
}
