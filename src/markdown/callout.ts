import type { Token } from "markdown-it";
import type { MarkdownModule } from "./types.ts";

/**
 * 콜아웃 모듈: 인용의 첫 줄이 `[!종류]`면 색 있는 안내 상자 (설계 13-3, GitHub·Obsidian과 같은 문법)
 *
 *   > [!NOTE]              → 기본 제목 "참고"
 *   > [!WARNING] 배포 전에  → 제목 "배포 전에"
 *   > 내용 …
 *
 * - 종류는 대소문자 상관없음. 모르는 종류는 그냥 인용으로 둔다 (글자 그대로 보임 → 미리보기에서 바로 알아챔)
 * - 출력: <div class="callout callout-note" role="note"><p class="callout-title">참고</p> … </div> (JS 없음)
 * - 접기 (설계 13-5, Obsidian 방식): `[!NOTE]-` 접힌 채로, `[!NOTE]+` 펼친 채로 시작
 *   → <details class="callout callout-note"[ open]><summary class="callout-title">…</summary> … </details>
 *   FOLD 종류(회색)는 기호가 없어도 접힌 채로
 * - 제목은 글자 그대로(이스케이프), 꾸밈 문법은 읽지 않음
 * - 기본 제목의 언어는 env.locale (없으면 한국어)
 * - 인용 모듈(quote)이 켜져 있어야 동작한다
 */
export const calloutModule: MarkdownModule = {
  name: "callout",
  setup(md) {
    // 블록을 나눈 직후(인라인을 읽기 전): 첫 문단의 첫 줄이 아직 글자 그대로라 [!종류]를 읽고 떼어 낼 수 있다
    md.core.ruler.after("block", "callout", (state) => {
      const tokens = state.tokens;
      for (let i = 0; i < tokens.length; i++) {
        const open = tokens[i]!;
        if (open.type !== "blockquote_open") continue;
        const paragraph = tokens[i + 1];
        const inline = tokens[i + 2];
        if (paragraph?.type !== "paragraph_open" || inline?.type !== "inline") continue;

        const [firstLine = "", ...rest] = inline.content.split("\n");
        const marker = CALLOUT_LINE.exec(firstLine.trim());
        const kind = marker ? marker[1]!.toLowerCase() : "";
        if (!isCalloutKind(kind)) continue;

        const close = findClose(tokens, i);
        if (close === -1) continue;
        const sign = marker![2];
        // 접기: - 접힘, + 펼침, 기호 없으면 접지 않음 (FOLD는 기호 없어도 접힘)
        const fold: CalloutMeta["fold"] = sign === "-" ? "closed" : sign === "+" ? "open" : kind === "fold" ? "closed" : null;
        open.type = "callout_open";
        open.tag = fold ? "details" : "div";
        open.meta = { kind, title: marker![3]?.trim() || null, fold } satisfies CalloutMeta;
        tokens[close]!.type = "callout_close";
        tokens[close]!.tag = open.tag;

        // 첫 줄([!종류] …)을 본문에서 뺀다. 남는 게 없으면 그 문단을 통째로 지운다
        const remaining = rest.join("\n");
        if (remaining.trim() === "") tokens.splice(i + 1, 3);
        else inline.content = remaining;
      }
    });

    md.renderer.rules.callout_open = (tokens, idx, _opts, env) => {
      const { kind, title, fold } = tokens[idx]!.meta as unknown as CalloutMeta;
      const locale = (env as CalloutEnv | undefined)?.locale ?? "ko";
      const label = md.utils.escapeHtml(title ?? (DEFAULT_TITLES[locale] ?? KOREAN_TITLES)[kind]);
      if (fold) {
        return `<details class="callout callout-${kind}"${fold === "open" ? " open" : ""}>\n<summary class="callout-title">${label}</summary>\n`;
      }
      return `<div class="callout callout-${kind}" role="note">\n<p class="callout-title">${label}</p>\n`;
    };
    md.renderer.rules.callout_close = (tokens, idx) => `</${tokens[idx]!.tag}>\n`;
  },
};

/** 콜아웃 종류 (GitHub 다섯 가지 + 색 없는 접기 fold) */
export const CALLOUT_KINDS = ["note", "tip", "important", "warning", "caution", "fold"] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];

/** 렌더링할 때 넘기는 언어 (기본 제목용). type 별칭: markdown-it Env에 넣을 수 있게 */
export type CalloutEnv = {
  /** "ko" | "en" … 없거나 모르는 언어면 한국어 */
  locale?: string;
};

/** 첫 줄: [!종류] + 접기 기호(-·+) + (띄어쓰고) 제목 */
const CALLOUT_LINE = /^\[!([A-Za-z]+)\]([+-])?(?:[ \t]+(.*))?$/;

/** 기본 제목 */
const KOREAN_TITLES: Record<CalloutKind, string> = {
  note: "참고",
  tip: "팁",
  important: "중요",
  warning: "주의",
  caution: "경고",
  fold: "펼쳐 보기",
};
const DEFAULT_TITLES: Partial<Record<string, Record<CalloutKind, string>>> = {
  ko: KOREAN_TITLES,
  en: { note: "Note", tip: "Tip", important: "Important", warning: "Warning", caution: "Caution", fold: "Details" },
};

interface CalloutMeta {
  kind: CalloutKind;
  /** 직접 쓴 제목. 없으면 null (기본 제목) */
  title: string | null;
  /** 접기: 접힌 채로 / 펼친 채로 / 접지 않음 */
  fold: "closed" | "open" | null;
}

function isCalloutKind(kind: string): kind is CalloutKind {
  return (CALLOUT_KINDS as readonly string[]).includes(kind);
}

/** blockquote_open(i)와 짝인 blockquote_close의 위치 (중첩 인용을 건너뜀). 없으면 -1 */
function findClose(tokens: Token[], i: number): number {
  let depth = 0;
  for (let j = i; j < tokens.length; j++) {
    const type = tokens[j]!.type;
    if (type === "blockquote_open" || type === "callout_open") depth++;
    else if (type === "blockquote_close" || type === "callout_close") {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

/**
 * Markdown 글에 쓰인 콜아웃 종류들 (나온 순서대로, 대문자 + 접기 기호, 예: "NOTE", "TIP-"). 번역 결과 검사용.
 * 코드 블록은 부르는 쪽에서 미리 빼 둔다(번역은 자리표로 바꾼 상태). 모르는 종류도 그대로 센다
 */
export function calloutMarkers(markdown: string): string[] {
  return [...markdown.matchAll(/^[ \t]*(?:>[ \t]?)+\[!([A-Za-z]+)\]([+-]?)/gm)].map(
    (match) => match[1]!.toUpperCase() + match[2]!,
  );
}
