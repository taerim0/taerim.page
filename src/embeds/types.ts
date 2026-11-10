/**
 * 임베드 카드 (설계 13-9): `!embed[제목?](주소)` → GitHub 저장소 카드 / 일반 링크 카드
 */

export type EmbedKind = "repo" | "link";

/** 저장된 카드 정보 (D1 embeds 한 행) */
export interface EmbedInfo {
  url: string;
  kind: EmbedKind;
  /** 정보를 받았는지. false면 주소만 있는 단순 카드 */
  ok: boolean;
  title: string | null;
  description: string | null;
  siteName: string | null;
  /** 대표 그림의 R2 이름 (예: embed-3f9a1c2b7d4e.png). 없으면 null */
  image: string | null;
  /** 저장소 별 개수 */
  stars: number | null;
  /** 저장소 주 언어 */
  language: string | null;
  fetchedAt: string;
}

/** 카드 그림에 받는 형식 → 확장자 */
export const EMBED_IMAGE_TYPES: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** 카드 그림 최대 크기 */
export const MAX_EMBED_IMAGE_BYTES = 500 * 1024;

/** R2·공개 사이트의 카드 그림 이름: embed-해시12.확장자 */
export const EMBED_IMAGE_NAME = /^embed-[0-9a-f]{12}\.(jpg|png|webp|gif)$/;

/** 주소 최대 길이 (그 이상은 임베드로 보지 않음) */
export const MAX_EMBED_URL_LENGTH = 2000;

/**
 * 주소 → 카드 종류. GitHub 저장소 주소(github.com/주인/저장소, 뒤 / 나 .git 허용)면 repo, 그 밖 http(s)는 link,
 * 주소가 아니거나 http(s)가 아니면 null
 */
export function embedTarget(url: string): { kind: "repo"; owner: string; repo: string } | { kind: "link" } | null {
  if (url.length > MAX_EMBED_URL_LENGTH) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (parsed.hostname === "github.com" || parsed.hostname === "www.github.com") {
    const parts = parsed.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (parts.length === 2 && !parsed.search) {
      const [owner, repo] = parts as [string, string];
      return { kind: "repo", owner, repo: repo.replace(/\.git$/, "") };
    }
  }
  return { kind: "link" };
}
