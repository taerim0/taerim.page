// @ts-check
/**
 * 콜아웃 도움말 (설계 16-18): 편집 화면 상태 줄 오른쪽 끝 ? 버튼 → 팝업에 콜아웃 6종 (문법 | 모양)
 *
 * - 한글 편집(post.js)과 번역 편집(translate.js)이 같이 씀. 번역 화면은 기본 제목이 그 언어로
 * - 모양은 미리보기와 같은 렌더러·CSS로 그림 → 문법이 바뀌면 같이 바뀜 (손으로 그린 그림 아님)
 * - 보기 전용 (넣기 없음). ×·Esc·바깥 누르면 닫힘
 */
import { renderMarkdown } from "./lib.js";

/** 종류 (렌더러 CALLOUT_KINDS 순서) + 예시 내용 */
const KINDS = /** @type {const} */ (["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION", "FOLD"]);
/** @typedef {(typeof KINDS)[number]} Kind */
/** @type {Record<"ko" | "en", Record<Kind, string>>} */
const SAMPLES = {
  ko: {
    NOTE: "알아 두면 좋은 내용",
    TIP: "더 편한 방법",
    IMPORTANT: "꼭 알아야 할 내용",
    WARNING: "조심해야 할 내용",
    CAUTION: "위험한 결과가 있는 것",
    FOLD: "처음엔 접혀 있어요",
  },
  en: {
    NOTE: "Something worth knowing",
    TIP: "An easier way",
    IMPORTANT: "Something you must know",
    WARNING: "Something to be careful about",
    CAUTION: "Something with risky results",
    FOLD: "Starts collapsed",
  },
};

/**
 * ? 버튼과 팝업을 잇는다. 처음 열 때 한 번만 그림
 * @param {string} locale 기본 제목 언어 ("ko" | "en" …)
 */
export function bindCalloutHelp(locale = "ko") {
  const button = document.getElementById("callout-help-button");
  const dialog = /** @type {HTMLDialogElement | null} */ (document.getElementById("callout-help"));
  const found = document.getElementById("callout-help-rows");
  if (!button || !dialog || !found) return;
  const rows = found;
  const samples = SAMPLES[/** @type {"ko" | "en"} */ (locale)] ?? SAMPLES.ko;

  function draw() {
    if (rows.childElementCount) return;
    for (const kind of KINDS) {
      const source = `> [!${kind}]\n> ${samples[kind]}`;
      const row = document.createElement("div");
      row.className = "help-row";
      const code = document.createElement("pre");
      code.className = "help-code";
      code.textContent = source;
      const sample = document.createElement("div");
      sample.className = "preview help-sample";
      // 우리 렌더러가 만든 HTML만 넣음 (미리보기 칸과 같음)
      sample.innerHTML = renderMarkdown(source, { locale });
      row.append(code, sample);
      rows.append(row);
    }
  }

  button.addEventListener("click", () => {
    draw();
    dialog.showModal();
  });
  dialog.querySelector("[data-close]")?.addEventListener("click", () => dialog.close());
  // 바깥(뒤 어두운 곳) 누르면 닫기. Esc는 dialog 기본 동작
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => button.focus());
}
