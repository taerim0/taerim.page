/**
 * 반응·댓글 방문자 스크립트 (설계 2-1): 글 페이지에만 붙음 → 빌드가 assets/comments.js로 묶는다.
 * - <div class="giscus" data-*>에 giscus iframe을 넣음 (loading=lazy → 칸이 화면 가까이 와야 giscus에 접속)
 * - giscus 로그인 후 돌아오면 주소의 ?giscus=를 떼어 localStorage에 기억 (giscus client.js와 같게)
 * - iframe이 알려 주는 높이로 맞춤, 세션이 망가졌다고 하면 지움
 * - 머리글 다크 모드 버튼(<html data-theme>)·기기 설정이 바뀌면 iframe에 테마를 보냄
 * - 테마는 우리 색 CSS(/assets/giscus-light.css · giscus-dark.css, 시안 C-2) 주소로
 */
import { discussionTerm, GISCUS_ORIGIN, GISCUS_SESSION_KEY, giscusThemeUrl, giscusWidgetUrl, splitSession } from "./comments.ts";
import type { GiscusTheme } from "./comments.ts";

const root = document.documentElement;
const media = matchMedia("(prefers-color-scheme: dark)");

/** 사이트 스크립트(SITE_SCRIPT)와 같은 규칙: data-theme이 있으면 그것, 없으면 기기 설정 */
function theme(): GiscusTheme {
  const chosen = root.getAttribute("data-theme");
  return chosen === "dark" || (chosen !== "light" && media.matches) ? "dark" : "light";
}

function readSession(fresh: string | null): string {
  try {
    if (fresh) {
      localStorage.setItem(GISCUS_SESSION_KEY, JSON.stringify(fresh));
      return fresh;
    }
    const saved = localStorage.getItem(GISCUS_SESSION_KEY);
    return saved ? String(JSON.parse(saved)) : "";
  } catch {
    return fresh ?? "";
  }
}

function start(box: HTMLElement): void {
  const { repo, repoId, category, categoryId, postId, lang } = box.dataset;
  if (!repo || !repoId || !category || !categoryId || !postId || !lang) return;

  const { cleaned, session: fresh } = splitSession(location.href);
  if (fresh !== null) history.replaceState(history.state, "", cleaned + location.hash);
  const canonical = document.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href ?? cleaned;
  const description = document.querySelector<HTMLMetaElement>("meta[property='og:description']")?.content ?? "";

  const frame = document.createElement("iframe");
  frame.className = "giscus-frame";
  frame.title = box.dataset.title ?? "Comments";
  frame.loading = "lazy";
  frame.setAttribute("scrolling", "no");
  frame.allow = "clipboard-write";
  frame.src = giscusWidgetUrl({
    repo, repoId, category, categoryId,
    term: discussionTerm(Number(postId)),
    lang,
    theme: giscusThemeUrl(canonical, theme()),
    origin: cleaned,
    session: readSession(fresh),
    description,
    backLink: canonical,
  });
  box.replaceChildren(frame);

  let sent = theme();
  const sendTheme = () => {
    const next = theme();
    if (next === sent) return;
    sent = next;
    frame.contentWindow?.postMessage({ giscus: { setConfig: { theme: giscusThemeUrl(canonical, next) } } }, GISCUS_ORIGIN);
  };
  new MutationObserver(sendTheme).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  media.addEventListener("change", sendTheme);

  addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== GISCUS_ORIGIN || event.source !== frame.contentWindow) return;
    const data = (event.data as { giscus?: { resizeHeight?: unknown; error?: unknown } } | null)?.giscus;
    if (!data) return;
    if (typeof data.resizeHeight === "number") frame.style.height = `${data.resizeHeight}px`;
    if (typeof data.error === "string" && /Bad credentials|Invalid state value|State has expired/.test(data.error)) {
      try {
        localStorage.removeItem(GISCUS_SESSION_KEY);
      } catch {
        /* 저장소를 못 쓰면 그냥 둠 */
      }
    }
  });
}

const box = document.querySelector<HTMLElement>(".giscus[data-repo]");
if (box) start(box);
