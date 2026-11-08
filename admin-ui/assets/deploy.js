// @ts-check
/**
 * [배포] 버튼 (글 목록 화면 위쪽)
 * - 누르면 공개 사이트 빌드·배포를 요청한다 (GitHub Actions). 실제 반영은 1~2분 뒤
 * - 옆에 가장 최근 배포 상태를 보여주고, 진행 중이면 10초마다 다시 확인한다
 * - 배포 설정이 없는 곳(로컬 개발)에서는 버튼이 꺼진다
 */
import { ApiError, deployApi } from "./api.js";
import { el, formatDateTime, notify } from "./ui.js";

/** @typedef {import("./api.js").DeployRun} DeployRun */

const button = /** @type {HTMLButtonElement | null} */ (document.getElementById("deploy-button"));
const status = /** @type {HTMLElement | null} */ (document.getElementById("deploy-status"));

/** 진행 중 확인 간격과 최대 확인 횟수 (10초 × 60 = 10분) */
const POLL_MS = 10_000;
const MAX_POLLS = 60;
let pollTimer = 0;
let polls = 0;

/** @param {DeployRun | null} run */
function isRunning(run) {
  return run !== null && run.status !== "completed";
}

/** @param {DeployRun | null} run */
function renderStatus(run) {
  if (!status) return;
  if (run === null) {
    status.replaceChildren("배포한 적 없음");
    return;
  }
  const when = formatDateTime(run.createdAt);
  const text = isRunning(run)
    ? `배포 중… (${when} 요청)`
    : run.conclusion === "success"
      ? `마지막 배포 ${when} ✓`
      : `마지막 배포 ${when} 실패`;
  // 상태 글자를 누르면 GitHub의 실행 기록(로그)으로
  status.replaceChildren(el("a", { href: run.url, target: "_blank", rel: "noopener noreferrer" }, text));
}

/** 상태를 받아 와서 그리고, 진행 중이면 다시 확인 예약 */
async function refresh() {
  clearTimeout(pollTimer);
  try {
    const { run } = await deployApi.status();
    renderStatus(run);
    if (button) button.disabled = isRunning(run);
    if (isRunning(run) && polls++ < MAX_POLLS) pollTimer = window.setTimeout(refresh, POLL_MS);
  } catch (error) {
    if (!button || !status) return;
    button.disabled = true;
    if (error instanceof ApiError && error.code === "unavailable") {
      button.title = error.message;
      status.replaceChildren();
    } else {
      status.replaceChildren("배포 상태를 확인하지 못했어요");
    }
  }
}

button?.addEventListener("click", async () => {
  button.disabled = true;
  try {
    await deployApi.request();
    notify("배포를 요청했어요. 1~2분 뒤 공개 사이트에 반영돼요", "info");
    // GitHub에 실행 기록이 생기기까지 몇 초 걸려서 조금 뒤에 확인
    polls = 0;
    if (status) status.replaceChildren("배포 요청함…");
    pollTimer = window.setTimeout(refresh, 3000);
  } catch (error) {
    notify(error instanceof ApiError ? error.message : "배포를 요청하지 못했어요");
    button.disabled = false;
  }
});

void refresh();
