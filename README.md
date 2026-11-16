# portfolio

개인 블로그. [taerim.page](https://taerim.page)를 fork해서 쓰는 저장소예요.

- 방문자는 **정적 파일만** 봐요 (Cloudflare Workers 정적 파일). 봇이 와도 요청 한도·비용이 들지 않아요
- 글은 **관리자 페이지**(Cloudflare Worker + D1 + R2)에서 쓰고, [배포] 버튼을 누르면 GitHub Actions가 정적 파일을 새로 만들어요
- 모두 Cloudflare 무료 플랜으로 돌아가요 (R2는 결제 수단 등록 필요, 무료 한도 월 10GB)

## 1. 먼저 바꿀 값 (`example.com` → 내 도메인)

원래 블로그(taerim.page)의 값은 모두 빼고 자리표시로 바꿔 두었어요. 아래를 내 값으로 채워요.

| 파일 | 바꿀 것 |
|---|---|
| `wrangler.jsonc` | `routes`의 `admin.example.com`, `vars`(Access·관리자 이메일, 아래 3단계), `database_id`(아래 2단계) |
| `wrangler.site.jsonc` | `routes`의 `example.com` |
| `src/site/config.ts` | `name`, `url`, `description`. 댓글(giscus)을 쓰면 주석을 풀어 채움 |
| `src/markdown/renderer.ts` | `DEFAULT_SITE_HOST` (이 도메인 링크는 같은 탭에서 열림) |
| `admin-ui/assets/list.js` | `SITE_ORIGIN` (관리자 글 목록에서 공개 글로 가는 주소) |
| `package.json` | `homepage` |

블로그 이름·소개·사진·링크(GitHub·이메일 등)는 코드가 아니라 **관리자 > 사이트 설정**에서 바꿔요.

## 2. Cloudflare 준비

도메인이 Cloudflare에 연결되어 있어야 해요 (Cloudflare Registrar에서 사면 바로 됨).

```bash
npm ci
npx wrangler login
npx wrangler d1 create blog-db                # 나오는 database_id를 wrangler.jsonc에
npx wrangler r2 bucket create blog-images     # "설정에 추가할까요?"에는 no (이미 들어 있음)
npx wrangler d1 migrations apply blog-db --remote
```

## 3. 관리자 로그인 (Cloudflare Access)

관리자 페이지는 Cloudflare Access로 막아요. 설정 전에는 관리자 API가 **모두 막힌** 상태라 안전해요.

1. Cloudflare Zero Trust > Settings > Team domain 확인 → `ACCESS_TEAM_DOMAIN` (예: `myteam.cloudflareaccess.com`)
2. Zero Trust > Integrations > Identity providers에 GitHub 로그인 추가 (GitHub OAuth 앱 필요)
3. Access > Applications > 관리자 주소(`admin.내도메인`)로 앱 만들기, 내 이메일만 허용
4. 앱 > Additional settings > AUD tag → `ACCESS_AUD`
5. `ADMIN_EMAILS`에 내 이메일 (쉼표로 여러 개)

## 4. GitHub Actions

fork한 저장소는 Actions가 꺼져 있을 수 있어요 → Actions 탭에서 켜기.

Settings > Secrets and variables > Actions에 넣을 것:

| 이름 | 내용 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API 토큰. "Edit Cloudflare Workers" 템플릿 + D1 편집 + R2 읽기 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 계정 ID |
| `CLOUDFLARE_ANALYTICS_TOKEN` | (조회수를 쓸 때) Account Analytics 읽기 토큰. Cloudflare Web Analytics를 내 도메인에 켜 둠 |

- `main`에 푸시하면 관리자·공개 사이트가 자동 배포돼요
- 공개 사이트는 매일 한국 04:00에 조회수를 모으고 다시 빌드해요 (`deploy-site.yml`의 `schedule`)

관리자의 [배포] 버튼을 쓰려면 이 저장소만 접근하는 fine-grained 토큰(Actions 읽기·쓰기)을 만들어 등록해요.

```bash
npx wrangler secret put GITHUB_DEPLOY_TOKEN
```

## 5. 로컬 개발

```bash
cp .dev.vars.example .dev.vars                 # localhost를 관리자로 봄
npx wrangler d1 migrations apply blog-db --local
npx wrangler dev                                # 관리자 http://localhost:8787
npm run dev:site                                # 공개 사이트 http://127.0.0.1:8789
```

## 선택 기능

- **댓글·반응 (giscus)**: 저장소 Settings에서 Discussions를 켜고 [giscus.app](https://giscus.app)에서 값을 받아 `src/site/config.ts`에
- **AI 번역 (영어 페이지)**: 제공자 연결이 아직 `fake`(시험용)만 있어요. `src/translations/config.ts`에 제공자를 추가하고 `TRANSLATE_PROVIDER`·`TRANSLATE_MODEL`(vars), `TRANSLATE_API_KEY`(secret)를 넣어요

## 라이선스

MIT. 원래 저작권 표기(`LICENSE`)는 남겨 두고, 내 이름을 한 줄 더할 수 있어요.
