/**
 * 검색 페이지의 스크립트 (설계 15-7). 빌드가 esbuild로 묶어 dist/site/assets/search.js로 (검색 페이지에만 붙음)
 *
 * - 페이지를 열면 search-index.json(제목·태그·요약)을 받아 바로 찾을 준비
 * - 처음 입력하거나 주소에 ?q=가 있으면 search-body.json(본문)도 받음 → 오면 다시 찾음
 * - 입력하는 대로(잠깐 멈추면) 결과를 바꾸고 주소의 ?q=도 바꿈 (공유·뒤로 가기)
 * - 결과는 textContent로만 넣는다 (검색 파일의 글자가 HTML로 해석되지 않게)
 * - 화면 글자·파일 주소는 <form data-*>에서 (이 스크립트는 언어를 모름)
 */
import { search } from "./search.ts";
import type { SearchBodies, SearchIndex, SearchResult } from "./search.ts";

const form = document.querySelector<HTMLFormElement>(".search-form");
const input = form?.querySelector<HTMLInputElement>(".search-input");
const status = document.querySelector<HTMLElement>(".search-status");
const list = document.querySelector<HTMLUListElement>(".search-results");

if (form && input && status && list) start(form, input, status, list);

function start(form: HTMLFormElement, input: HTMLInputElement, status: HTMLElement, list: HTMLUListElement): void {
  const data = form.dataset;
  const msg = (name: string, n?: number) => (data[name] ?? "").replace("{n}", String(n ?? ""));
  let index: SearchIndex | null = null;
  let bodies: SearchBodies | null = null;
  let bodyRequested = false;
  let failed = false;
  let timer = 0;

  async function fetchJson<T>(url: string | undefined): Promise<T> {
    const response = await fetch(url ?? "");
    if (!response.ok) throw new Error(String(response.status));
    return (await response.json()) as T;
  }

  /** 본문 파일은 처음 찾을 때 한 번만 */
  function requestBodies(): void {
    if (bodyRequested) return;
    bodyRequested = true;
    fetchJson<SearchBodies>(data.body)
      .then((loaded) => {
        bodies = loaded;
        render();
      })
      .catch(() => {
        // 본문을 못 받아도 제목·태그·요약으로는 계속 찾음
        bodies = { b: [] };
        render();
      });
  }

  function render(): void {
    const query = input.value.trim();
    if (failed) {
      status.textContent = msg("msgFailed");
      list.replaceChildren();
      return;
    }
    if (query === "" || !index) {
      status.textContent = "";
      list.replaceChildren();
      return;
    }
    requestBodies();
    const { total, results } = search(query, index, bodies);
    const loading = bodies === null ? ` ${msg("msgLoading")}` : "";
    status.textContent = (total === 0 ? msg("msgNone") : total > results.length ? msg("msgMore", total) : msg("msgCount", total)) + loading;
    list.replaceChildren(...results.map(resultItem));
  }

  function resultItem({ item, excerpt }: SearchResult): HTMLLIElement {
    const li = document.createElement("li");
    li.className = "search-result";
    const link = document.createElement("a");
    link.className = "search-result-title";
    link.href = item.u;
    link.textContent = item.t;
    if (item.l) link.lang = item.l;
    const head = document.createElement("p");
    head.className = "search-result-head";
    if (item.k === "activity") head.append(badge("activity-badge", item.b ?? msg("badgeActivity")), " ");
    if (item.k === "note") head.append(badge("note-badge", msg("badgeNote")), " ");
    head.append(link);
    if (item.kr) head.append(" ", badge("lang-badge", msg("badgeKr"), msg("badgeKrTitle")));
    const meta = document.createElement("p");
    meta.className = "post-meta";
    const time = document.createElement("time");
    time.dateTime = item.d;
    time.textContent = item.dt;
    meta.append(time, ...item.g.map((tag) => ` #${tag}`));
    li.append(head, meta);
    if (excerpt.length > 0) {
      const p = document.createElement("p");
      p.className = "search-excerpt";
      if (item.l) p.lang = item.l;
      for (const segment of excerpt) {
        if (segment.mark) {
          const mark = document.createElement("mark");
          mark.textContent = segment.text;
          p.append(mark);
        } else p.append(segment.text);
      }
      li.append(p);
    }
    return li;
  }

  function badge(className: string, text: string, title?: string): HTMLSpanElement {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    if (title) span.title = title;
    return span;
  }

  /** 주소의 ?q=를 지금 찾는 말로 (기록은 쌓지 않음) */
  function syncUrl(): void {
    const url = new URL(location.href);
    const query = input.value.trim();
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    history.replaceState(null, "", url);
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      syncUrl();
      render();
    }, 120);
  });
  // 엔터: 페이지를 다시 불러오지 않고 바로 찾기
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    syncUrl();
    render();
  });

  input.value = new URLSearchParams(location.search).get("q") ?? "";
  if (input.value.trim()) requestBodies();
  fetchJson<SearchIndex>(data.index)
    .then((loaded) => {
      index = loaded;
      render();
    })
    .catch(() => {
      failed = true;
      render();
    });
}
