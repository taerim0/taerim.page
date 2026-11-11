import type { MarkdownModule } from "./types.ts";

/**
 * 코드 블록 모듈 (설계 13-6): 색칠 + 제목 + diff + 줄 번호 + 줄 하이라이트 + 복사 버튼 + 접기
 *
 *   ```ts|src/app.ts            제목
 *   ```ts|src/app.ts|toggle     + 접힌 채로 (제목 줄을 눌러 펼침)
 *   ```ts|diff                  줄 맨 앞 +/- → 초록/빨강 줄 (diff는 줄 번호도)
 *   ```ts|ln                    줄 번호 (설계 16-2부터 줄 번호는 항상 → ln은 예전 글과의 호환으로만 받음)
 *   ```ts|{2,4-5}               2·4·5번째 줄 하이라이트
 *   ```ts|title=diff            제목이 정말 "diff"일 때
 *
 * - 언어 뒤 `|` 조각: diff·toggle·ln·{줄}·title=… 은 옵션, 그 밖은 제목 (여러 개면 | 로 다시 이어서 하나)
 * - 색칠: 준비된 색칠기(setCodeHighlighter)가 꽂혀 있으면 색, 아니면 글자 그대로.
 *   렌더러는 동기라서, 무거운 Shiki는 빌드·관리자 미리보기가 따로 준비해서 꽂는다 (highlight.ts)
 * - 언어가 diff(```diff)면 diff 옵션과 같게 (색 없는 글자 + 줄 색)
 * - 복사 버튼은 HTML에 넣어 두고, 누르는 동작은 공개 사이트·관리자 화면의 스크립트가 맡는다
 *   (복사할 글자 = 줄마다 .code-text, 지운 줄(.line-del)은 빼고)
 * - 방문자 JS 없이도 코드는 그대로 보인다 (색은 빌드 때 HTML에 들어감)
 */
export const codeModule: MarkdownModule = {
  name: "code",
  setup(md) {
    md.renderer.rules.fence = (tokens, idx, _opts, env) => {
      const token = tokens[idx]!;
      const locale = (env as { locale?: string } | undefined)?.locale;
      return renderCodeBlock(token.content, parseFenceInfo(token.info), locale, md.utils.escapeHtml);
    };
  },
};

// ── 색칠기 (빌드·미리보기가 꽂음) ───────────────────────

/**
 * 색칠한 글자 조각 하나. 라이트·다크 두 테마 색을 다 가진다 (설계 13-7)
 * → HTML에 `--sl`(라이트)·`--sd`(다크) 변수로 넣고, CSS가 지금 모드에 맞는 쪽으로 칠한다 (방문자 JS 없음)
 */
export interface HighlightToken {
  content: string;
  /** 라이트 테마 글자 색 (#rrggbb 등). 없으면 그 테마의 기본 글자색 */
  light?: string;
  /** 다크 테마 글자 색. 없으면 그 테마의 기본 글자색 */
  dark?: string;
  /** 1 기울임, 2 굵게, 4 밑줄 (비트) */
  fontStyle?: number;
}

/** 코드 → 줄마다 색칠한 조각들. 모르는 언어면 null (글자 그대로 보여 줌) */
export type CodeHighlighter = (code: string, lang: string) => HighlightToken[][] | null;

let highlighter: CodeHighlighter | null = null;

/** 색칠기를 꽂는다 (null이면 뺌). 이후의 렌더링부터 색이 들어간다 */
export function setCodeHighlighter(next: CodeHighlighter | null): void {
  highlighter = next;
}

// ── 옵션 읽기 ──────────────────────────────────────────

export interface FenceOptions {
  /** 언어 (소문자). 없으면 null */
  lang: string | null;
  title: string | null;
  diff: boolean;
  toggle: boolean;
  /** 줄 번호 */
  lineNumbers: boolean;
  /** 하이라이트할 줄 (1부터) */
  marked: ReadonlySet<number>;
}

const LINE_SPEC = /^\{\s*\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*\s*\}$/;
/** {…}에 쓸 수 있는 가장 큰 줄 번호 (너무 큰 범위로 느려지지 않게) */
const MAX_MARKED_LINE = 10_000;

/** ``` 뒤 글자 → 언어·옵션 */
export function parseFenceInfo(info: string): FenceOptions {
  const [rawLang = "", ...pieces] = info.trim().split("|");
  const options: FenceOptions = {
    lang: rawLang.trim().toLowerCase() || null,
    title: null,
    diff: false,
    toggle: false,
    lineNumbers: false,
    marked: new Set(),
  };
  const titleParts: string[] = [];
  let explicitTitle: string | null = null;
  const marked = new Set<number>();
  for (const raw of pieces) {
    const piece = raw.trim();
    const word = piece.toLowerCase();
    if (word === "diff") options.diff = true;
    else if (word === "toggle") options.toggle = true;
    else if (word === "ln") options.lineNumbers = true;
    else if (LINE_SPEC.test(piece)) for (const n of lineNumbersIn(piece)) marked.add(n);
    else if (word.startsWith("title=")) explicitTitle = piece.slice("title=".length).trim();
    else if (piece !== "") titleParts.push(piece);
  }
  if (options.lang === "diff") {
    options.diff = true;
    options.lang = null;
  }
  options.title = explicitTitle || titleParts.join("|") || null;
  options.marked = marked;
  return options;
}

/** "{2,4-5}" → 2, 4, 5 */
function lineNumbersIn(spec: string): number[] {
  const numbers: number[] = [];
  for (const part of spec.slice(1, -1).split(",")) {
    const [from, to = from] = part.split("-").map((n) => Number(n.trim()));
    for (let n = Math.max(1, from!); n <= Math.min(to!, MAX_MARKED_LINE); n++) numbers.push(n);
  }
  return numbers;
}

// ── 출력 ──────────────────────────────────────────────

/** diff 표시: 줄 맨 앞 글자 */
type DiffKind = "add" | "del" | null;

const LABELS: Record<string, { copy: string; code: string }> = {
  ko: { copy: "코드 복사", code: "코드" },
  en: { copy: "Copy code", code: "Code" },
};

/** 안전한 색 값만 (색칠기가 주는 값이지만 HTML 속성에 들어가므로 한 번 더) */
const SAFE_COLOR = /^#[0-9a-fA-F]{3,8}$/;

function renderCodeBlock(content: string, options: FenceOptions, locale: string | undefined, escape: (text: string) => string): string {
  const labels = LABELS[locale ?? "ko"] ?? LABELS.ko!;
  const rawLines = content.replace(/\n$/, "").split("\n");

  // diff: 줄 맨 앞 +/-/공백을 떼어 표시로, 나머지를 코드로
  const kinds: DiffKind[] = [];
  const codeLines = rawLines.map((line) => {
    if (!options.diff) {
      kinds.push(null);
      return line;
    }
    const first = line[0];
    kinds.push(first === "+" ? "add" : first === "-" ? "del" : null);
    return first === "+" || first === "-" || first === " " ? line.slice(1) : line;
  });

  const colored = options.lang && highlighter ? highlighter(codeLines.join("\n"), options.lang) : null;
  // 설계 16-2: 줄 번호는 항상 (diff가 아니어도)
  const showNumbers = true;

  const lines = codeLines.map((line, i) => {
    const kind = kinds[i];
    const classes = ["line", kind === "add" ? "line-add" : kind === "del" ? "line-del" : "", options.marked.has(i + 1) ? "line-mark" : ""]
      .filter(Boolean)
      .join(" ");
    const number = showNumbers ? `<span class="ln" aria-hidden="true">${i + 1}</span>` : "";
    const mark = options.diff ? `<span class="diff-mark" aria-hidden="true">${kind === "add" ? "+" : kind === "del" ? "-" : " "}</span>` : "";
    const tokens = colored?.[i];
    const text = tokens ? tokens.map((token) => renderToken(token, escape)).join("") : escape(line);
    return `<span class="${classes}">${number}${mark}<span class="code-text">${text}</span></span>`;
  });

  const blockClass = `code-block${showNumbers ? " has-ln" : ""}${options.diff ? " has-diff" : ""}`;
  const langClass = options.lang ? ` class="language-${escape(options.lang)}"` : "";
  const copy = `<button class="code-copy" type="button" aria-label="${labels.copy}" title="${labels.copy}"></button>`;
  // 머리 띠 (설계 16-2): 언어 표시 + 파일 이름(있으면) + 복사 버튼, 항상
  const langName = options.lang ?? (options.diff ? "diff" : null);
  const langChip = langName ? `<span class="code-lang">${escape(langName)}</span>` : "";
  const title = options.title ? `<span class="code-title">${escape(options.title)}</span>` : "";

  if (options.toggle) {
    // 접는 코드: 제목 줄(summary)을 누르면 접히므로 복사 버튼은 본문 안에 둔다
    const body = `<div class="code-body">${copy}<pre class="code"><code${langClass}>${lines.join("\n")}</code></pre></div>`;
    // 머리 줄에 아무것도 없으면 '코드' (언어 표시가 있으면 그것으로 충분)
    const head = title || (langChip ? "" : `<span class="code-title">${escape(labels.code)}</span>`);
    return `<details class="${blockClass}">\n<summary class="code-head">${langChip}${head}</summary>\n${body}\n</details>\n`;
  }
  const body = `<div class="code-body"><pre class="code"><code${langClass}>${lines.join("\n")}</code></pre></div>`;
  return `<figure class="${blockClass}">\n<figcaption class="code-head">${langChip}${title}${copy}</figcaption>\n${body}\n</figure>\n`;
}

function renderToken(token: HighlightToken, escape: (text: string) => string): string {
  const styles: string[] = [];
  if (token.light && SAFE_COLOR.test(token.light)) styles.push(`--sl:${token.light}`);
  if (token.dark && SAFE_COLOR.test(token.dark)) styles.push(`--sd:${token.dark}`);
  const fontStyle = token.fontStyle ?? 0;
  if (fontStyle > 0 && fontStyle & 1) styles.push("font-style:italic");
  if (fontStyle > 0 && fontStyle & 2) styles.push("font-weight:bold");
  if (fontStyle > 0 && fontStyle & 4) styles.push("text-decoration:underline");
  const text = escape(token.content);
  return styles.length ? `<span style="${styles.join(";")}">${text}</span>` : text;
}
