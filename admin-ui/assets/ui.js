// @ts-check
/**
 * 관리자 화면들이 같이 쓰는 작은 도우미.
 *
 * 화면에 데이터를 넣을 때는 innerHTML을 쓰지 않고 이 파일의 el()로 요소를 만든다.
 * → 글 제목에 <script> 같은 글자가 있어도 글자로만 보인다. (미리보기 HTML은 렌더러가 이미 안전하게 만든 것만 넣는다)
 */

/**
 * 요소 만들기. 속성의 on… 은 이벤트로, 나머지는 속성으로 넣는다. 자식의 글자는 글자로만 들어간다.
 * 예) el("a", { href: "/tags", class: "chip" }, "#블로그")
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string, string | boolean | number | ((event: any) => void) | null | undefined>} [attrs]
 * @param {...(Node | string | number | null | undefined | false)} children
 * @returns {HTMLElementTagNameMap[K]}
 */
export function el(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (typeof value === "function") element.addEventListener(name.slice(2).toLowerCase(), value);
    else element.setAttribute(name, value === true ? "" : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(typeof child === "string" || typeof child === "number" ? String(child) : child);
  }
  return element;
}

/**
 * ISO 시각 → 내 컴퓨터 시간대로 "11-07 21:20" (올해가 아니면 "2025-11-07 21:20")
 * @param {string | null} iso
 */
export function formatDateTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
  const day = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return date.getFullYear() === new Date().getFullYear() ? `${day} ${time}` : `${date.getFullYear()}-${day} ${time}`;
}

/**
 * 화면 위쪽 알림 줄에 메시지 보여주기. 같은 줄을 다시 쓰면 내용이 바뀐다.
 * @param {string} message
 * @param {"error" | "info"} [kind]
 */
export function notify(message, kind = "error") {
  let bar = document.getElementById("notice");
  if (!bar) {
    bar = el("div", { id: "notice", role: "status" });
    document.body.prepend(bar);
  }
  bar.className = `notice notice-${kind}`;
  bar.textContent = message;
  bar.hidden = false;
}

/** 알림 줄 숨기기 */
export function clearNotice() {
  const bar = document.getElementById("notice");
  if (bar) bar.hidden = true;
}

/**
 * 주소의 ?… 를 바꾼다 (새로고침 없이, 뒤로 가기로 돌아올 수 있게)
 * @param {URLSearchParams} params
 */
export function setQuery(params) {
  const search = params.toString();
  history.pushState(null, "", search ? `?${search}` : location.pathname);
}

const FLASH_KEY = "admin-flash";

/**
 * 다음 화면에서 한 번 보여줄 알림을 남긴다 (예: 휴지통으로 보낸 뒤 목록에서 "휴지통으로 옮겼어요")
 * 저장이 막힌 브라우저(사생활 보호 모드 등)에서는 조용히 넘어간다.
 * @param {string} message
 */
export function flash(message) {
  try {
    sessionStorage.setItem(FLASH_KEY, message);
  } catch {
    // 알림 하나 못 보여주는 것뿐이라 무시
  }
}

/** 남겨 둔 알림이 있으면 보여주고 지운다 */
export function showFlash() {
  try {
    const message = sessionStorage.getItem(FLASH_KEY);
    if (message === null) return;
    sessionStorage.removeItem(FLASH_KEY);
    notify(message, "info");
  } catch {
    // 무시
  }
}

/**
 * 태그 입력 칸 연결 (글 목록의 거르기 칸, 편집 화면의 태그 칸 공통)
 * - 띄어쓰기·엔터를 치면 태그 하나 완성 → onAdd(친 글자). 정리(normalizeTag)·중복 확인은 부르는 쪽에서
 * - 빈 칸에서 백스페이스 → onRemoveLast()
 *
 * 한글 입력 중(조합 중)에는 글자가 아직 확정되지 않아서 keydown에서 바로 읽으면 마지막 글자가 빠지거나 남는다.
 * → 띄어쓰기는 입력된 결과(input 이벤트)에서 공백을 찾아 나누고,
 *   조합 중에 친 엔터는 조합이 끝난 뒤(compositionend) 처리한다.
 * @param {HTMLInputElement} input
 * @param {{ onAdd: (text: string) => void, onRemoveLast: () => void }} handlers
 */
export function bindTagInput(input, { onAdd, onRemoveLast }) {
  let enterWhileComposing = false;

  const commit = () => {
    const text = input.value;
    input.value = "";
    if (text.trim() !== "") onAdd(text);
  };

  input.addEventListener("input", () => {
    const parts = input.value.split(/\s+/);
    if (parts.length < 2) return;
    input.value = parts.pop() ?? ""; // 마지막 공백 뒤는 아직 치는 중
    for (const part of parts) if (part !== "") onAdd(part);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.isComposing) enterWhileComposing = true;
      else commit();
    } else if (event.key === "Backspace" && input.value === "" && !event.isComposing) {
      onRemoveLast();
    }
  });

  input.addEventListener("compositionend", () => {
    if (!enterWhileComposing) return;
    enterWhileComposing = false;
    commit();
  });
}
