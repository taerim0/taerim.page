/**
 * 관리자 라이트/다크 (설계 16-11). <head>에서 그대로(모듈 아님) 불러 그리기 전에 실행 → 깜빡임 없음
 * - 기본은 기기 설정 (CSS의 prefers-color-scheme). 머리글 버튼(data-theme-toggle)을 누르면 반대 모드로 바꾸고 기억
 * - 기억한 모드는 <html data-theme="light|dark">. 편집·번역 미리보기 칸도 이 모드를 따름 (admin.css)
 * - 저장 이름은 공개 사이트("theme")와 따로 — 관리자는 주소가 달라 저장소도 따로지만 헷갈리지 않게
 * - 저장이 막힌 브라우저에서는 이번 화면에서만 바뀜
 */
(function () {
  var KEY = "admin-theme";
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem(KEY);
    if (saved === "dark" || saved === "light") root.setAttribute("data-theme", saved);
  } catch (e) {}

  function isDark() {
    var mode = root.getAttribute("data-theme");
    return mode === "dark" || (mode !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  }
  function sync() {
    var button = document.querySelector("[data-theme-toggle]");
    if (button) button.setAttribute("aria-pressed", String(isDark()));
  }
  document.addEventListener("DOMContentLoaded", sync);
  document.addEventListener("click", function (event) {
    var node = /** @type {Element | null} */ (event.target);
    var target = node && node.closest ? node.closest("[data-theme-toggle]") : null;
    if (!target) return;
    var next = isDark() ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem(KEY, next);
    } catch (e) {}
    sync();
  });
})();
