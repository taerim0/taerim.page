import { Hono } from "hono";
import type { ImageService } from "../images/service.ts";
import type { AdminEnv } from "./auth.ts";
import { HttpError } from "./http-errors.ts";

/** 이미지 주소 앞부분. 공개 사이트와 같다 → 본문의 ![a](/images/x.webp)가 미리보기에서도 그대로 보인다 */
export const IMAGE_PATH_PREFIX = "/images/";

/**
 * 이름이 내용 해시라 같은 주소 = 영원히 같은 내용 → 내 브라우저에만(private) 1년 저장.
 * 미리보기는 글자를 칠 때마다 다시 그리므로, 캐시가 없으면 매번 다시 받아 깜빡이고 R2 읽기가 쌓인다
 */
export const IMAGE_CACHE_CONTROL = "private, max-age=31536000, immutable";

/**
 * GET /images/:name → R2의 이미지 (편집 화면 미리보기용, 관리자 확인 뒤에만)
 * 이미지 기능이 설정되지 않았으면 503
 */
export function createImageRoutes(images: ImageService | undefined): Hono<AdminEnv> {
  const routes = new Hono<AdminEnv>();

  routes.get(`${IMAGE_PATH_PREFIX}:name`, async (c) => {
    const image = await requireImages(images).open(c.req.param("name"));
    if (!image) throw new HttpError("not_found", "이미지를 찾을 수 없어요");
    return new Response(image.body, {
      headers: {
        "Content-Type": image.contentType,
        "Content-Length": String(image.size),
        "Cache-Control": IMAGE_CACHE_CONTROL,
        // 이미지 파일에 다른 것을 숨겨 올려도 페이지로 실행되지 않게
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  });

  return routes;
}

export function requireImages(images: ImageService | undefined): ImageService {
  if (!images) throw new HttpError("unavailable", "이미지 저장소 설정이 없어요");
  return images;
}
