import type { SiteConfig } from "./templates.ts";

/** 공개 사이트 설정. 빌드가 쓴다 */
export const SITE_CONFIG: SiteConfig = {
  name: "taerim.page",
  url: "https://taerim.page",
  description: "taerim의 블로그",
  descriptions: { en: "taerim's blog" },
  // 임시 그림 (site-static/assets). 사용자가 기본 이미지를 주면 이 파일을 바꾼다
  defaultThumbnail: "/assets/default-thumbnail.svg",
  // 반응·댓글 (설계 2-1): GitHub Discussions "Comments" 분류. 공개 값 (gh api graphql로 읽음, 2026-11-11)
  giscus: {
    repo: "taerim0/taerim.page",
    repoId: "R_kgDOVl_Y0Q",
    category: "Comments",
    categoryId: "DIC_kwDOVl_Y0c4DK07J",
  },
};
