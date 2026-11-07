import { describe, expect, it } from "vitest";
import { createRenderer, isExternalLink, renderMarkdown } from "../src/markdown/index.ts";
import type { MarkdownModule } from "../src/markdown/index.ts";

// core만 켠 렌더러. 입력은 String.raw 로 써서 \ 가 그대로 전달되게 한다.
const render = createRenderer();

describe("core 문법", () => {
  it("제목: # ~ ######", () => {
    expect(render("# 하나")).toBe("<h1>하나</h1>\n");
    expect(render("###### 여섯")).toBe("<h6>여섯</h6>\n");
  });

  it("굵게·기울임", () => {
    expect(render("**굵게** *기울임* ***둘다***")).toBe(
      "<p><strong>굵게</strong> <em>기울임</em> <em><strong>둘다</strong></em></p>\n",
    );
  });

  it("인라인 코드: 안쪽은 Markdown으로 해석하지 않음", () => {
    expect(render("`**그대로**`")).toBe("<p><code>**그대로**</code></p>\n");
  });

  it("목록: 중첩, 번호 시작값", () => {
    expect(render("- a\n  - b")).toBe("<ul>\n<li>a\n<ul>\n<li>b</li>\n</ul>\n</li>\n</ul>\n");
    expect(render("3. 셋")).toBe('<ol start="3">\n<li>셋</li>\n</ol>\n');
  });

  it("구분선", () => {
    expect(render("---")).toBe("<hr>\n");
  });

  it("이스케이프: 기호를 그대로 표시", () => {
    expect(render(String.raw`\*별표\* \# \[괄호\]`)).toBe("<p>*별표* # [괄호]</p>\n");
  });

  it("엔터 한 번 = 줄바꿈, 빈 줄 = 새 문단", () => {
    expect(render("첫째\n둘째\n\n셋째")).toBe("<p>첫째<br>\n둘째</p>\n<p>셋째</p>\n");
  });
});

describe("코드 블록", () => {
  it("``` 와 언어 이름", () => {
    expect(render("```ts\nconst x = 1;\n```")).toBe(
      '<pre><code class="language-ts">const x = 1;\n</code></pre>\n',
    );
  });

  it("~~~ 도 허용", () => {
    expect(render("~~~\nwave\n~~~")).toBe("<pre><code>wave\n</code></pre>\n");
  });

  it("코드 블록 안의 HTML·Markdown은 글자 그대로", () => {
    expect(render("```\n<b>**x**</b>\n```")).toBe("<pre><code>&lt;b&gt;**x**&lt;/b&gt;\n</code></pre>\n");
  });

  it("백틱 4개로 열면 안쪽 ``` 는 글자", () => {
    expect(render("````\n```\nin\n```\n````")).toBe("<pre><code>```\nin\n```\n</code></pre>\n");
  });

  it("닫지 않으면 글 끝까지 코드 블록", () => {
    expect(render("```\na\nb")).toBe("<pre><code>a\nb</code></pre>\n");
  });
});

describe("링크", () => {
  it("외부 링크는 새 탭 + noopener", () => {
    expect(render("[g](https://github.com)")).toBe(
      '<p><a href="https://github.com" target="_blank" rel="noopener noreferrer">g</a></p>\n',
    );
  });

  it("내부 링크·하위 도메인은 같은 탭", () => {
    expect(render("[a](/posts/a)")).toBe('<p><a href="/posts/a">a</a></p>\n');
    expect(render("[b](https://taerim.page/x)")).toBe('<p><a href="https://taerim.page/x">b</a></p>\n');
    expect(render("[c](https://admin.taerim.page)")).toBe('<p><a href="https://admin.taerim.page">c</a></p>\n');
  });

  it("위험한 주소는 링크로 만들지 않음", () => {
    expect(render("[x](javascript:alert(1))")).not.toContain("<a");
    expect(render("[x](data:text/html,hi)")).not.toContain("<a");
  });

  it("isExternalLink 판단 규칙", () => {
    const host = "taerim.page";
    expect(isExternalLink("https://github.com", host)).toBe(true);
    expect(isExternalLink("http://example.com/a", host)).toBe(true);
    expect(isExternalLink("//example.com", host)).toBe(true);
    expect(isExternalLink("https://evil.com@taerim.page", host)).toBe(false); // 실제 호스트는 taerim.page
    expect(isExternalLink("https://taerim.page.evil.com", host)).toBe(true); // 이름만 비슷한 다른 사이트
    expect(isExternalLink("/posts/a", host)).toBe(false);
    expect(isExternalLink("#제목", host)).toBe(false);
    expect(isExternalLink("mailto:a@b.c", host)).toBe(false);
  });

  it("siteHost 옵션으로 기준 도메인 변경", () => {
    const r = createRenderer([], { siteHost: "example.com" });
    expect(r("[t](https://taerim.page)")).toContain('target="_blank"');
    expect(r("[e](https://example.com)")).not.toContain("target=");
  });
});

describe("보안: 글 안의 HTML은 글자 그대로", () => {
  it("블록·인라인 HTML 모두 이스케이프", () => {
    expect(render("<script>alert(1)</script>")).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>\n");
    expect(render('글 <img src=x onerror="alert(1)">')).toBe(
      "<p>글 &lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>\n",
    );
  });
});

describe("core에 없는 문법은 변환하지 않음", () => {
  it.each([
    ["인용", "> 인용"],
    ["밑줄식 제목", "제목\n==="],
    ["4칸 들여쓰기 코드", "    code"],
    ["표", "| a |\n| - |\n| 1 |"],
    ["취소선", "~~x~~"],
    ["자동 링크 <주소>", "<https://github.com>"],
    ["주소만 쓴 글자", "https://github.com"],
  ])("%s", (_name, input) => {
    const html = render(input);
    expect(html.startsWith("<p>")).toBe(true);
    for (const tag of ["<blockquote", "<h1", "<pre", "<table", "<img", "<s>", "<a "]) {
      expect(html).not.toContain(tag);
    }
  });
});

describe("이미지 모듈이 없을 때", () => {
  it("이미지는 안 만들어지고 ! 글자 + 링크로 표시됨", () => {
    // 이미지 문법은 꺼져 있지만 링크 문법은 켜져 있어서 [a](/a.png) 부분이 링크가 된다.
    expect(render("![a](/a.png)")).toBe('<p>!<a href="/a.png">a</a></p>\n');
  });
});

describe("모듈 연결", () => {
  it("모듈의 setup이 호출되고 기능이 켜짐", () => {
    const quote: MarkdownModule = {
      name: "quote",
      setup(md) {
        md.enable("blockquote");
      },
    };
    expect(createRenderer([quote])("> 인용")).toBe("<blockquote>\n<p>인용</p>\n</blockquote>\n");
    expect(render("> 인용")).not.toContain("<blockquote"); // 다른 렌더러에는 영향 없음
  });
});

describe("renderMarkdown (블로그 설정)", () => {
  it("지금은 core와 같은 결과", () => {
    const sample = "## 제목\n**a** [g](https://github.com)\n\n- x";
    expect(renderMarkdown(sample)).toBe(render(sample));
  });
});
