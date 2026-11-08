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
 * 가로·세로 크기(width/height)는 빌드에서 이미지 목록을 알게 되면 붙인다 (구현 순서 5)
 */
export const imageModule: MarkdownModule = {
  name: "image",
  setup(md) {
    md.enable("image");

    const renderDefault = md.renderer.rules.image
      ?? ((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts));

    md.renderer.rules.image = (tokens, idx, opts, env, self) => {
      const token = tokens[idx]!;
      token.attrSet("loading", "lazy");
      token.attrSet("decoding", "async");
      return renderDefault(tokens, idx, opts, env, self);
    };
  },
};
