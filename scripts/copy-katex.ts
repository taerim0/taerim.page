/**
 * KaTeX CSS·글꼴 복사 (설계 13-8). 수식 화면에 필요한 파일만:
 *   node_modules/katex/dist/katex.min.css + fonts/*.woff2  →  {대상}/katex.min.css, {대상}/fonts/
 * (CSS는 woff2·woff·ttf 순으로 적혀 있고 지금 브라우저는 모두 woff2를 받으므로 woff2만)
 *
 *   node scripts/copy-katex.ts admin-ui/assets/katex      관리자 (npm run build:admin)
 *   빌드 스크립트는 copyKatex("dist/site/assets/katex")를 직접 부름
 */
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

const SOURCE = "node_modules/katex/dist";

export async function copyKatex(target: string): Promise<number> {
  await mkdir(join(target, "fonts"), { recursive: true });
  await copyFile(join(SOURCE, "katex.min.css"), join(target, "katex.min.css"));
  const fonts = (await readdir(join(SOURCE, "fonts"))).filter((name) => name.endsWith(".woff2"));
  for (const name of fonts) await copyFile(join(SOURCE, "fonts", name), join(target, "fonts", name));
  return fonts.length;
}

// 직접 실행했을 때만 (빌드 스크립트가 import할 때는 실행하지 않음)
if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/copy-katex.ts")) {
  const target = process.argv[2];
  if (!target) throw new Error("대상 폴더를 적어 주세요: node scripts/copy-katex.ts <폴더>");
  const count = await copyKatex(target);
  console.log(`KaTeX CSS + 글꼴 ${count}개 → ${target}`);
}
