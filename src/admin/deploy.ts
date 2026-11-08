/**
 * [배포] 버튼 → 공개 사이트 빌드·배포 (GitHub Actions 워크플로).
 *
 * 관리자 Worker는 빌드를 직접 하지 않고, GitHub에 "이 워크플로를 실행해 줘"라고 요청만 한다.
 * 실제 빌드(원격 D1 읽기 → 정적 파일)와 배포는 GitHub Actions가 한다.
 */

/** 가장 최근 배포(워크플로 실행) 상태 */
export interface DeployRun {
  /** queued(대기) · in_progress(진행 중) · completed(끝남) 등 GitHub 값 그대로 */
  status: string;
  /** 끝났을 때 결과: success · failure · cancelled 등. 아직 안 끝났으면 null */
  conclusion: string | null;
  /** 요청한 시각 (ISO) */
  createdAt: string;
  /** GitHub에서 로그를 볼 수 있는 주소 */
  url: string;
}

/** 배포 요청하는 곳. 테스트에서는 가짜를 넣는다 */
export interface DeployTrigger {
  /** 배포 시작 요청 */
  request(): Promise<void>;
  /** 가장 최근 배포. 한 번도 없으면 null */
  latest(): Promise<DeployRun | null>;
}

/** GitHub이 요청을 거절했거나 연결이 안 될 때 */
export class DeployError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeployError";
  }
}

export interface GitHubDeployOptions {
  /** fine-grained 토큰 (이 저장소만, Actions: 읽기·쓰기). Worker 시크릿에 둔다 */
  token: string;
  /** "taerim0/taerim.page" */
  repository: string;
  /** 워크플로 파일 이름. 예) "deploy-site.yml" */
  workflow: string;
  /** 어느 브랜치의 코드로 빌드할지. 기본 main */
  ref?: string;
  /** 테스트에서 바꿔 끼운다. 기본: 전역 fetch */
  fetch?: typeof fetch;
}

const GITHUB_API = "https://api.github.com";

export function githubDeployTrigger(options: GitHubDeployOptions): DeployTrigger {
  const ref = options.ref ?? "main";
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const base = `${GITHUB_API}/repos/${options.repository}/actions/workflows/${encodeURIComponent(options.workflow)}`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${options.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    // GitHub API는 User-Agent가 없으면 거절한다
    "User-Agent": "taerim-page-admin",
  };

  /** GitHub에 요청. 실패하면 DeployError (토큰 등 자세한 내용은 메시지에 넣지 않는다) */
  async function call(url: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await doFetch(url, { ...init, headers: { ...headers, ...init.headers } });
    } catch {
      throw new DeployError("GitHub에 연결하지 못했어요");
    }
    if (!response.ok) throw new DeployError(`GitHub이 요청을 거절했어요 (${response.status})`);
    return response;
  }

  return {
    async request() {
      await call(`${base}/dispatches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref }),
      });
    },

    async latest() {
      const response = await call(`${base}/runs?per_page=1&branch=${encodeURIComponent(ref)}`, { method: "GET" });
      const data = (await response.json()) as { workflow_runs?: GitHubRun[] };
      const run = data.workflow_runs?.[0];
      return run ? { status: run.status, conclusion: run.conclusion, createdAt: run.created_at, url: run.html_url } : null;
    },
  };
}

/** GitHub 응답 중 쓰는 칸만 */
interface GitHubRun {
  status: string;
  conclusion: string | null;
  created_at: string;
  html_url: string;
}
