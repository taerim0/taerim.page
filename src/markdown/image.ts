import type { Token } from "markdown-it";
import type { MarkdownModule } from "./types.ts";

/**
 * 이미지 모듈: `![설명](/images/a.webp)` → `<img>`
 *
 * - 화면 밖 이미지는 스크롤해서 가까워질 때 받는다 (loading="lazy")
 * - 이미지 해석이 글 표시를 막지 않게 한다 (decoding="async")
 * - 외부 주소(https://…)도 그대로 표시한다
 * - 위험한 주소(javascript: 등)는 markdown-it이 이미지로 만들기 전에 걸러낸다
 *   (data:는 image/png·jpeg·gif·webp만 허용 = markdown-it 기본)
 *
 * 설명 끝 옵션 (순서 상관없이, 각각 최대 하나):
 * - 크기 (Obsidian 방식): `|400` = 400px, `|50%` = 글 폭의 절반. px 1~4000, % 1~100
 * - 정렬: `|center` `|left` `|right`. 기본은 가운데
 * - 틀린 값은 옵션으로 보지 않고 설명에 그대로 남긴다 (미리보기에서 보이게)
 * - 검사를 통과한 값만 style·class에 들어간다 (글 안 HTML 금지 원칙 유지)
 *
 * 정렬은 **이미지만 있는 문단**에 적용한다 (`<p class="img-align-center">`).
 * 이미지 자체를 블록으로 만들면 `|50%` 두 장 나란히 놓기가 깨지기 때문.
 * 그 문단은 줄마다 `<span class="img-row">`로 묶어서, 한 줄에 이어 쓴 이미지 사이에
 * CSS가 같은 간격을 자동으로 넣는다 (간격 옵션은 두지 않음. |50%+|50%도 간격만큼 줄어 한 줄에 맞음)
 * 글자 사이에 낀 이미지는 글자 흐름 그대로 둔다.
 *
 * 원래 가로·세로: 빌드가 env.imageSizes로 넘기면 width·height 속성을 붙인다 (관리자 미리보기는 없음)
 */
export const imageModule: MarkdownModule = {
  name: "image",
  setup(md) {
    md.enable("image");

    // 1. 이미지마다 설명 끝 옵션을 떼어 token.meta에 둔다
    // 2. 이미지만 있는 문단에 정렬 클래스
    md.core.ruler.after("inline", "image_options", (state) => {
      const tokens = state.tokens;
      for (const token of tokens) {
        if (token.type !== "inline") continue;
        for (const child of token.children ?? []) {
          if (child.type === "image") readOptions(child);
        }
      }
      for (let i = 0; i + 1 < tokens.length; i++) {
        const open = tokens[i]!;
        const inline = tokens[i + 1]!;
        if (open.type !== "paragraph_open" || inline.type !== "inline") continue;
        const images = imagesOnly(inline.children ?? []);
        if (!images) continue;
        const align = images.map((image) => optionsOf(image).align).find(Boolean) ?? DEFAULT_ALIGN;
        open.attrJoin("class", `img-align-${align}`);
        // 줄마다 한 줄(row)로 묶는다 → CSS가 줄 안의 이미지 사이에 같은 간격을 넣는다
        if (!open.hidden) inline.children = intoRows(inline.children ?? [], (type, nesting) => new state.Token(type, "span", nesting));
      }
    });

    md.renderer.rules.image_row_open = () => '<span class="img-row">';
    md.renderer.rules.image_row_close = () => "</span>";

    const renderDefault = md.renderer.rules.image
      ?? ((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts));

    md.renderer.rules.image = (tokens, idx, opts, env, self) => {
      const token = tokens[idx]!;
      // 원래 크기를 알면(빌드) width·height → 이미지를 받기 전에도 자리를 미리 잡는다
      const known = (env as ImageEnv | undefined)?.imageSizes?.get(String(token.attrGet("src") ?? ""));
      if (known) {
        token.attrSet("width", String(known.width));
        token.attrSet("height", String(known.height));
      }
      const { width } = optionsOf(token);
      if (width) token.attrSet("style", `width:${width}`);
      token.attrSet("loading", "lazy");
      token.attrSet("decoding", "async");
      return renderDefault(tokens, idx, opts, env, self);
    };
  },
};

/**
 * 렌더링할 때 넘기는 이미지 정보 (markdown-it env). 빌드만 넘긴다.
 * interface가 아니라 type: markdown-it의 Env(아무 칸이나 받는 모양)에 넣을 수 있게 (HeadingEnv와 같은 이유)
 */
export type ImageEnv = {
  /** 이미지 주소(src) → 원래 가로·세로 */
  imageSizes?: ReadonlyMap<string, { width: number; height: number }>;
};

export type ImageAlign = "center" | "left" | "right";
const ALIGNS = new Set<string>(["center", "left", "right"]);
const DEFAULT_ALIGN: ImageAlign = "center";

/** 설명 끝 옵션 */
export interface ImageOptions {
  /** 설명에서 옵션을 뺀 나머지 (끝 공백 제거) */
  rest: string;
  /** CSS 폭 ("400px" / "50%"). 없으면 undefined */
  width?: string;
  align?: ImageAlign;
}

const LAST_PART = /\|([^|]*)$/;
const SIZE = /^(\d{1,4})\s*(%?)$/;
const MAX_PX = 4000;
const MAX_PERCENT = 100;

/**
 * 설명 끝의 `|크기`·`|정렬` 읽기 (끝에서부터, 각각 최대 하나).
 * 옵션이 아닌 조각을 만나면 거기서 멈추고 그 앞은 모두 설명으로 둔다
 */
export function parseImageOptions(alt: string): ImageOptions {
  const options: ImageOptions = { rest: alt };
  for (;;) {
    const match = LAST_PART.exec(options.rest);
    if (!match) break;
    const part = match[1]!.trim();
    const width = options.width === undefined ? parseSize(part) : null;
    const align = options.align === undefined && ALIGNS.has(part.toLowerCase()) ? (part.toLowerCase() as ImageAlign) : null;
    if (width) options.width = width;
    else if (align) options.align = align;
    else break;
    options.rest = options.rest.slice(0, match.index).trimEnd();
  }
  return options;
}

/** "400" → "400px", "50%" → "50%". 범위 밖이거나 모양이 틀리면 null */
function parseSize(part: string): string | null {
  const match = SIZE.exec(part);
  if (!match) return null;
  const value = Number(match[1]);
  const percent = match[2] === "%";
  if (value < 1 || value > (percent ? MAX_PERCENT : MAX_PX)) return null;
  return `${value}${percent ? "%" : "px"}`;
}

/** 이미지 토큰의 설명(마지막 글자 조각)에서 옵션을 떼어 meta에 둔다. 기본 렌더러는 children으로 alt를 만든다 */
function readOptions(image: Token): void {
  const children = image.children ?? [];
  const last = children[children.length - 1];
  const options = last?.type === "text" ? parseImageOptions(last.content) : { rest: "" };
  if (last?.type === "text") last.content = options.rest;
  image.meta = { ...(image.meta as object | null), width: options.width, align: options.align };
}

function optionsOf(image: Token): { width?: string; align?: ImageAlign } {
  return (image.meta ?? {}) as { width?: string; align?: ImageAlign };
}

/**
 * 이미지만 있는 문단의 내용을 줄바꿈 기준으로 나눠 줄마다 image_row_open … image_row_close로 감싼다.
 * 줄바꿈·공백 조각은 버린다 (줄은 CSS가 나눔)
 */
function intoRows(children: Token[], makeToken: (type: string, nesting: 1 | -1) => Token): Token[] {
  const rows: Token[][] = [[]];
  for (const child of children) {
    if (child.type === "softbreak" || child.type === "hardbreak") rows.push([]);
    else if (child.type === "image") rows[rows.length - 1]!.push(child);
  }
  return rows
    .filter((row) => row.length > 0)
    .flatMap((row) => [makeToken("image_row_open", 1), ...row, makeToken("image_row_close", -1)]);
}

/** 문단 내용이 이미지와 줄바꿈·공백뿐이면 그 이미지들, 아니면 null */
function imagesOnly(children: Token[]): Token[] | null {
  const images: Token[] = [];
  for (const child of children) {
    if (child.type === "image") images.push(child);
    else if (child.type === "softbreak" || child.type === "hardbreak") continue;
    else if (child.type === "text" && child.content.trim() === "") continue;
    else return null;
  }
  return images.length > 0 ? images : null;
}
