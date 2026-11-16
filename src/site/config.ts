import type { SiteConfig } from "./templates.ts";

/** 공개 사이트 설정. 빌드가 쓴다 */
export const SITE_CONFIG: SiteConfig = {
  // 내 블로그 이름·주소로 바꾼다 (주소는 끝에 / 없이). 조회수 모으기도 이 주소의 호스트로 Web Analytics를 읽는다
  name: "example.com",
  url: "https://example.com",
  description: "내 블로그",
  descriptions: { en: "My blog" },
  // 임시 그림 (site-static/assets). 사용자가 기본 이미지를 주면 이 파일을 바꾼다
  defaultThumbnail: "/assets/default-thumbnail.svg",
  // 반응·댓글 (giscus): 꺼 둠. 쓰려면 이 저장소의 Discussions를 켜고 https://giscus.app 에서 값을 받아 아래 주석을 풀어 채운다
  // giscus: {
  //   repo: "worud8457/portfolio",
  //   repoId: "R_...",
  //   category: "Comments",
  //   categoryId: "DIC_...",
  // },
};
