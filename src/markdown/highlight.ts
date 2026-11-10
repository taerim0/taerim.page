/**
 * Shiki 색칠기 (설계 13-6·13-7). 무거워서 렌더러 묶음(lib.js)에는 넣지 않고,
 * 빌드 스크립트와 관리자 미리보기용 따로 묶음(highlight.js)만 이 파일을 가져다 쓴다.
 *
 * - shiki/core + 자바스크립트 정규식 엔진 (WASM 없음 → 동기로 바로 준비, 브라우저·Node 어디서나)
 * - 고른 언어만 + 테마 둘 (라이트 github-light-default, 다크 github-dark-default)
 *   → 조각마다 두 색을 다 돌려주고, CSS가 지금 모드(라이트/다크)에 맞는 색으로 칠한다
 * - 언어를 더하려면 아래 LANGS에 한 줄 + import 한 줄
 */
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import bash from "shiki/langs/bash.mjs";
import c from "shiki/langs/c.mjs";
import cpp from "shiki/langs/cpp.mjs";
import css from "shiki/langs/css.mjs";
import diff from "shiki/langs/diff.mjs";
import go from "shiki/langs/go.mjs";
import htmlLang from "shiki/langs/html.mjs";
import java from "shiki/langs/java.mjs";
import javascript from "shiki/langs/javascript.mjs";
import json from "shiki/langs/json.mjs";
import jsx from "shiki/langs/jsx.mjs";
import markdown from "shiki/langs/markdown.mjs";
import python from "shiki/langs/python.mjs";
import rust from "shiki/langs/rust.mjs";
import sql from "shiki/langs/sql.mjs";
import tsx from "shiki/langs/tsx.mjs";
import typescript from "shiki/langs/typescript.mjs";
import yaml from "shiki/langs/yaml.mjs";
import githubDark from "shiki/themes/github-dark-default.mjs";
import githubLight from "shiki/themes/github-light-default.mjs";
import type { CodeHighlighter, HighlightToken } from "./code.ts";

/** 라이트·다크 테마 (CSS의 코드 블록 바탕·기본 글자색과 맞춤) */
export const CODE_THEMES = { light: "github-light-default", dark: "github-dark-default" } as const;

const LANGS = [bash, c, cpp, css, diff, go, htmlLang, java, javascript, json, jsx, markdown, python, rust, sql, tsx, typescript, yaml];

/** 흔히 쓰는 다른 이름 → Shiki 언어 이름 (Shiki 자체 별칭에 없는 것만 더해도 되지만, 확실하게 적어 둠) */
const ALIASES: Record<string, string> = {
  ts: "typescript",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  md: "markdown",
  yml: "yaml",
  py: "python",
  rs: "rust",
  golang: "go",
  "c++": "cpp",
  htm: "html",
};

/** 색칠기 만들기 (동기). 한 번 만들어 setCodeHighlighter로 꽂는다 */
export function createCodeHighlighter(): CodeHighlighter {
  const shiki = createHighlighterCoreSync({
    themes: [githubLight, githubDark],
    langs: LANGS,
    engine: createJavaScriptRegexEngine(),
  });
  const loaded = new Set(shiki.getLoadedLanguages());
  // 테마 기본 글자색은 CSS(코드 블록 글자색)가 맡으므로 조각마다 적지 않는다 → HTML이 훨씬 짧아짐
  const foreground = {
    light: shiki.getTheme(CODE_THEMES.light).fg.toLowerCase(),
    dark: shiki.getTheme(CODE_THEMES.dark).fg.toLowerCase(),
  };
  const own = (color: string | undefined, fg: string) => (color && color.toLowerCase() !== fg ? color : undefined);

  return (code, lang) => {
    const name = ALIASES[lang] ?? lang;
    if (!loaded.has(name)) return null;
    return shiki.codeToTokensWithThemes(code, { lang: name, themes: CODE_THEMES }).map((line) => {
      const merged: HighlightToken[] = [];
      for (const token of line) {
        const light = own(token.variants.light?.color, foreground.light);
        const dark = own(token.variants.dark?.color, foreground.dark);
        const style = token.variants.dark?.fontStyle ?? token.variants.light?.fontStyle;
        const fontStyle = style && style > 0 ? style : undefined;
        const last = merged[merged.length - 1];
        // 모양이 같은 이웃 조각은 하나로
        if (last && last.light === light && last.dark === dark && last.fontStyle === fontStyle) last.content += token.content;
        else merged.push({ content: token.content, light, dark, fontStyle });
      }
      return merged;
    });
  };
}
