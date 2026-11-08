import type { SiteConfig } from "./templates.ts";

/** 공개 사이트 설정. 빌드가 쓴다 */
export const SITE_CONFIG: SiteConfig = {
  name: "taerim.page",
  url: "https://taerim.page",
  description: "taerim의 블로그",
  // 임시 그림 (site-static/images). 사용자가 기본 이미지를 주면 이 파일을 바꾼다
  defaultThumbnail: "/images/default-thumbnail.svg",
};
