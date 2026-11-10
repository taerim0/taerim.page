import type { StateBlock } from "markdown-it";
import { embedTarget } from "../embeds/types.ts";
import type { EmbedInfo } from "../embeds/types.ts";
import type { MarkdownModule } from "./types.ts";

/**
 * 임베드 모듈 (설계 13-9): 한 줄에 혼자 있는 `!embed[제목?](주소)` → 카드
 *
 * - GitHub 저장소 주소면 저장소 카드(이름·설명·★·언어), 그 밖은 링크 카드(제목·설명·사이트·대표 그림)
 * - 카드 정보는 렌더러가 직접 받지 않는다(동기라서). 빌드·관리자 미리보기가 받아 둔 정보를
 *   setEmbedResolver로 꽂는다 — 코드 색칠·수식과 같은 구조. 정보가 없으면 주소·도메인만 있는 단순 카드
 * - 카드 전체가 링크(새 탭), 방문자 JS 없음
 * - http(s)가 아닌 주소, 문장 안의 !embed 는 카드가 아님 (글자 그대로)
 */
export const embedModule: MarkdownModule = {
  name: "embed",
  setup(md) {
    md.block.ruler.before("paragraph", "embed", embedBlock);
    md.renderer.rules.embed = (tokens, idx) => {
      const { url, title } = tokens[idx]!.meta as { url: string; title: string | null };
      return renderCard(url, title, resolver?.(url) ?? null, md.utils.escapeHtml);
    };
  },
};

/** 카드에 보여 줄 정보: 저장된 정보 + 그림의 실제 주소 (공개 사이트 /embeds/…, 미리보기 /embed-images/…) */
export type EmbedView = EmbedInfo & { imageSrc: string | null };

export type EmbedResolver = (url: string) => EmbedView | null | undefined;

let resolver: EmbedResolver | null = null;

/** 카드 정보 찾는 곳을 꽂는다 (null이면 뺌) */
export function setEmbedResolver(next: EmbedResolver | null): void {
  resolver = next;
}

/** 한 줄 임베드: !embed[제목](주소) */
const EMBED_LINE = /^!embed\[([^\]\n]*)\]\(([^)\s]+)\)\s*$/;

/** 글에 쓰인 임베드 주소들 (나온 순서대로). 빌드·미리보기·번역 검사가 씀. 코드 블록 안은 부르는 쪽에서 빼 둠 */
export function embedUrls(markdown: string): string[] {
  const urls: string[] = [];
  for (const line of markdown.split("\n")) {
    const match = EMBED_LINE.exec(line.replace(/^(?:\s*>)*\s{0,3}/, ""));
    if (match && embedTarget(match[2]!)) urls.push(match[2]!);
  }
  return urls;
}

function embedBlock(state: StateBlock, startLine: number, _endLine: number, silent: boolean): boolean {
  if (state.sCount[startLine]! - state.blkIndent >= 4) return false;
  const line = state.src.slice(state.bMarks[startLine]! + state.tShift[startLine]!, state.eMarks[startLine]!);
  const match = EMBED_LINE.exec(line);
  if (!match || !embedTarget(match[2]!)) return false;
  if (silent) return true;
  const token = state.push("embed", "a", 0);
  token.block = true;
  token.meta = { url: match[2]!, title: match[1]!.trim() || null };
  token.map = [startLine, startLine + 1];
  state.line = startLine + 1;
  return true;
}

function renderCard(url: string, customTitle: string | null, info: EmbedView | null, escape: (text: string) => string): string {
  const target = embedTarget(url);
  const kind = target?.kind ?? "link";
  const host = hostOf(url);
  const ok = info?.ok === true;
  const title = customTitle ?? (ok ? info!.title : null) ?? (target?.kind === "repo" ? `${target.owner}/${target.repo}` : url);
  const description = ok ? info!.description : null;
  const meta: string[] = [];
  if (kind === "repo") {
    meta.push("GitHub");
    if (ok && info!.stars !== null) meta.push(`★ ${info!.stars.toLocaleString("en-US")}`);
    if (ok && info!.language) meta.push(info!.language);
  } else {
    meta.push((ok ? info!.siteName : null) ?? host);
  }
  const image = kind === "link" && info?.imageSrc ? `<img class="embed-image" src="${escape(info.imageSrc)}" alt="" loading="lazy" decoding="async">` : "";
  return (
    `<div class="embed"><a class="embed-card embed-${kind}${image ? " has-image" : ""}" href="${escape(url)}" target="_blank" rel="noopener noreferrer">` +
    `<span class="embed-text"><span class="embed-title">${escape(title)}</span>` +
    (description ? `<span class="embed-desc">${escape(description)}</span>` : "") +
    `<span class="embed-meta">${meta.map(escape).join(" · ")}</span></span>${image}</a></div>\n`
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
