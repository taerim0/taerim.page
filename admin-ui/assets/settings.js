// @ts-check
/**
 * 사이트 설정 화면 (/settings, 설계 15-3)
 * - 칸을 고치면 오른쪽 소개 카드 미리보기가 바로 바뀜, 저장 안 됨 표시, 떠날 때 확인
 * - 사진: 본문 이미지와 같은 방식(WebP 변환)으로 올려 /images/… 주소를 칸에 넣음. "기본 그림으로" = 비움
 * - 저장 = 통째로 PUT. 칸별 오류는 칸 아래. 공개 사이트는 [배포]해야 바뀜
 */
import { ApiError, settingsApi } from "./api.js";
import { uploadImageFile } from "./image-upload.js";
import { clearNotice, el, formatDateTime, notify } from "./ui.js";

/** @typedef {import("./api.js").SiteSettings} SiteSettings */

const FIELDS = /** @type {const} */ (["name", "photo", "tagline", "taglineEn", "description", "descriptionEn", "github", "email", "linkedin", "solvedac"]);
const DEFAULT_AVATAR = "/assets/default-avatar.svg";

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const form = /** @type {HTMLFormElement} */ ($("settings-form"));
const inputs = Object.fromEntries(FIELDS.map((field) => [field, /** @type {HTMLInputElement} */ ($(field))]));
const saveButton = /** @type {HTMLButtonElement} */ ($("save"));

/** 마지막으로 저장된 값 (칸 글자 그대로) */
let saved = /** @type {Record<string, string>} */ ({});
let busy = false;

/** 지금 칸 값 → 서버에 보낼 모양 (빈 칸은 null) @returns {SiteSettings} */
function currentSettings() {
  const value = (/** @type {typeof FIELDS[number]} */ field) => inputs[field]?.value.trim() || null;
  return {
    name: value("name") ?? "",
    photo: value("photo"),
    tagline: value("tagline"),
    taglineEn: value("taglineEn"),
    description: value("description") ?? "",
    descriptionEn: value("descriptionEn"),
    github: value("github"),
    email: value("email"),
    linkedin: value("linkedin"),
    solvedac: value("solvedac"),
  };
}

const snapshot = () => Object.fromEntries(FIELDS.map((field) => [field, inputs[field]?.value.trim() ?? ""]));
const isDirty = () => FIELDS.some((field) => (inputs[field]?.value.trim() ?? "") !== (saved[field] ?? ""));

/** @param {SiteSettings} settings @param {string | null} updatedAt */
function fill(settings, updatedAt) {
  for (const field of FIELDS) {
    const input = inputs[field];
    if (input) input.value = settings[field] ?? "";
  }
  saved = snapshot();
  $("saved-at").textContent = updatedAt ? `저장 ${formatDateTime(updatedAt)}` : "아직 저장한 적 없음 (기본값)";
  refresh();
}

function refresh() {
  $("dirty-mark").hidden = !isDirty();
  saveButton.disabled = busy || !isDirty();
  const settings = currentSettings();
  /** @type {HTMLImageElement} */ ($("photo-preview")).src = settings.photo ?? DEFAULT_AVATAR;
  renderCard(settings);
}

/** 소개 카드 미리보기 (공개 사이트 홈 카드와 같은 구성) @param {SiteSettings} s */
function renderCard(s) {
  const links = [
    s.github && el("a", { href: s.github, target: "_blank", rel: "noopener" }, "GitHub"),
    s.email && el("a", { href: `mailto:${s.email}` }, "이메일"),
    s.linkedin && el("a", { href: s.linkedin, target: "_blank", rel: "noopener" }, "LinkedIn"),
    s.solvedac && el("a", { href: s.solvedac, target: "_blank", rel: "noopener" }, "solved.ac"),
  ].filter(Boolean);
  $("card-preview").replaceChildren(
    el("img", { class: "avatar avatar-large", src: s.photo ?? DEFAULT_AVATAR, alt: "" }),
    el("p", { class: "profile-name" }, s.name || "(이름)"),
    s.tagline ? el("p", { class: "profile-tagline" }, s.tagline) : "",
    links.length > 0 ? el("p", { class: "profile-links" }, ...links.flatMap((link, i) => (i === 0 ? [link] : [" · ", link]))) : "",
  );
}

function clearErrors() {
  for (const target of document.querySelectorAll("[data-error-for]")) target.textContent = "";
}

/** @param {unknown} error */
function showError(error) {
  if (!(error instanceof ApiError)) {
    notify("저장하지 못했어요");
    return;
  }
  for (const issue of error.issues) {
    const target = document.querySelector(`[data-error-for="${issue.field}"]`);
    if (target) target.textContent = issue.message;
  }
  notify(error.issues.length > 0 ? "입력을 확인해 주세요" : error.message);
}

async function save() {
  if (busy) return;
  busy = true;
  refresh();
  clearErrors();
  try {
    const result = await settingsApi.save(currentSettings());
    fill(result.settings, result.updatedAt);
    notify("저장했어요. 배포하면 공개 사이트에 반영돼요", "info");
  } catch (error) {
    showError(error);
  } finally {
    busy = false;
    refresh();
  }
}

async function load() {
  try {
    const { settings, updatedAt } = await settingsApi.get();
    fill(settings, updatedAt);
  } catch (error) {
    $("loading").textContent = "설정을 불러오지 못했어요.";
    showError(error);
    return;
  }
  $("loading").hidden = true;
  $("settings").hidden = false;
}

// ── 이벤트 ──────────────────────────────────────────

for (const field of FIELDS) inputs[field]?.addEventListener("input", refresh);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void save();
});

// 사진 올리기 / 기본 그림으로
const photoFile = /** @type {HTMLInputElement} */ ($("photo-file"));
$("photo-button").addEventListener("click", () => photoFile.click());
photoFile.addEventListener("change", async () => {
  const file = photoFile.files?.[0];
  photoFile.value = "";
  if (!file) return;
  const button = /** @type {HTMLButtonElement} */ ($("photo-button"));
  button.disabled = true;
  button.textContent = "올리는 중…";
  try {
    /** @type {HTMLInputElement} */ (inputs.photo).value = await uploadImageFile(file);
    refresh();
  } catch (error) {
    notify(`사진을 올리지 못했어요: ${error instanceof Error ? error.message : ""}`);
  } finally {
    button.disabled = false;
    button.textContent = "사진 올리기";
  }
});
$("photo-clear").addEventListener("click", () => {
  /** @type {HTMLInputElement} */ (inputs.photo).value = "";
  refresh();
});

// Ctrl+S = 저장
window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    if (!saveButton.disabled) void save();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!isDirty()) return;
  event.preventDefault();
  event.returnValue = "";
});

clearNotice();
void load();
