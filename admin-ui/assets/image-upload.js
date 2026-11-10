// @ts-check
/**
 * 편집 화면 본문 칸에서 이미지 올리기: 붙여넣기(Ctrl+V) · 끌어놓기 · [이미지] 버튼
 *
 * 1. 커서 자리에 자리 표시 `![업로드 중: 사진.png](#uploading-3)`
 * 2. PNG·JPEG·WebP는 브라우저에서 긴 변 1600px·WebP로 변환 (회전 정보 반영, EXIF 사라짐), GIF는 그대로
 * 3. POST /api/images → 성공하면 자리 표시를 `![사진](/images/….webp)`로, 실패하면 지우고 알림
 *
 * 여러 장이면 한 장씩 차례로. 본문을 바꾼 뒤에는 input 이벤트를 보내 저장 안 됨 표시·미리보기가 평소처럼 갱신된다.
 * 한계: 자리 표시를 바꾸는 것은 Ctrl+Z(되돌리기) 기록에 남지 않는다.
 */
import { ApiError, imagesApi } from "./api.js";
import { altFromFileName, fitWithin, imageMarkdown, planUpload, replacePlaceholder, uploadingPlaceholder, WEBP_QUALITY } from "./lib.js";
import { notify } from "./ui.js";

/** 자리 표시 번호 (화면을 연 동안 겹치지 않게) */
let nextId = 1;

/**
 * @param {object} elements
 * @param {HTMLTextAreaElement} elements.textarea 본문 칸
 * @param {HTMLButtonElement} elements.button [이미지] 버튼
 * @param {HTMLInputElement} elements.fileInput 숨긴 파일 고르기 칸
 */
export function bindImageUpload({ textarea, button, fileInput }) {
  /** 올리는 차례 (한 장씩) */
  let queue = Promise.resolve();

  /** @param {File[]} files */
  function uploadAll(files) {
    // 자리 표시는 바로 넣고(누른 순서대로 보이게), 올리기는 한 장씩
    // 여러 장이면 한 줄에 하나씩 (붙어 있으면 미리보기에서 옆으로 나란히 보임)
    const jobs = files.map((file, i) => ({ file, placeholder: insertPlaceholder(file, i < files.length - 1 ? "\n" : "") }));
    for (const job of jobs) {
      queue = queue.then(() => uploadOne(job.file, job.placeholder));
    }
  }

  /**
   * 커서 자리(선택한 글자가 있으면 그 자리)에 자리 표시를 넣는다
   * @param {File} file
   * @param {string} after 자리 표시 뒤에 붙일 글자 (여러 장일 때 줄바꿈)
   */
  function insertPlaceholder(file, after) {
    const placeholder = uploadingPlaceholder(nextId++, file.name);
    textarea.focus();
    textarea.setRangeText(placeholder + after, textarea.selectionStart, textarea.selectionEnd, "end");
    changed();
    return placeholder;
  }

  /**
   * 자리 표시를 바꾼다. 그동안 지웠거나 고쳤으면 false
   * @param {string} placeholder
   * @param {string} replacement
   */
  function replace(placeholder, replacement) {
    const found = replacePlaceholder(textarea.value, placeholder, replacement);
    if (!found) return false;
    // "preserve": 쓰고 있던 커서·선택 위치를 유지
    textarea.setRangeText(replacement, found.index, found.index + placeholder.length, "preserve");
    changed();
    return true;
  }

  /** @param {File} file @param {string} placeholder */
  async function uploadOne(file, placeholder) {
    try {
      const plan = planUpload(file.type, file.size);
      if (plan.kind === "reject") throw new UploadFailed(plan.message);
      const body = plan.kind === "convert" ? await toWebp(file) : file;
      const { image } = await imagesApi.upload(body, file.name);
      if (!replace(placeholder, imageMarkdown(altFromFileName(file.name), image.name))) {
        notify(`"${file.name}"은(는) 올렸는데 넣을 자리가 없어졌어요 (자리 표시를 지웠거나 고쳤어요)`, "info");
      }
    } catch (error) {
      replace(placeholder, "");
      const reason = error instanceof UploadFailed || error instanceof ApiError ? error.message : "알 수 없는 문제가 생겼어요";
      notify(`"${file.name}"을(를) 올리지 못했어요: ${reason}`);
      if (!(error instanceof UploadFailed || error instanceof ApiError)) console.error(error);
    }
  }

  /** 본문이 바뀌었다고 알림 → post.js가 저장 안 됨 표시·미리보기를 갱신 */
  function changed() {
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // 붙여넣기: 클립보드에 이미지 파일만 있으면 올리고, 글자가 있으면 평소처럼 붙여넣기
  textarea.addEventListener("paste", (event) => {
    const data = event.clipboardData;
    if (!data) return;
    const files = imageFiles(data.files);
    if (files.length === 0 || data.getData("text/plain") !== "") return;
    event.preventDefault();
    uploadAll(files);
  });

  // 끌어놓기: 파일을 끌어오면 테두리 강조, 놓으면 커서 자리에
  /** @param {DragEvent} event */
  const hasFiles = (event) => event.dataTransfer?.types.includes("Files") ?? false;
  textarea.addEventListener("dragover", (event) => {
    if (!hasFiles(event)) return; // 글자 끌기는 평소처럼
    event.preventDefault();
    textarea.classList.add("drop-target");
  });
  textarea.addEventListener("dragleave", () => textarea.classList.remove("drop-target"));
  textarea.addEventListener("drop", (event) => {
    textarea.classList.remove("drop-target");
    if (!hasFiles(event)) return;
    event.preventDefault();
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length > 0) uploadAll(files); // 이미지가 아닌 파일은 planUpload가 알림으로 거절
  });

  // [이미지] 버튼 → 파일 고르기 (여러 개 가능)
  button.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const files = [...(fileInput.files ?? [])];
    fileInput.value = ""; // 같은 파일을 다시 골라도 change가 일어나게
    if (files.length > 0) uploadAll(files);
  });
}

/**
 * 파일 하나를 본문과 같은 방식(WebP 변환·GIF 그대로)으로 올리고 주소(/images/…)를 돌려준다.
 * 사이트 설정의 프로필 사진 등 본문 밖에서 쓴다. 실패하면 사람이 읽을 이유를 담은 Error
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function uploadImageFile(file) {
  const plan = planUpload(file.type, file.size);
  if (plan.kind === "reject") throw new UploadFailed(plan.message);
  const body = plan.kind === "convert" ? await toWebp(file) : file;
  try {
    const { image } = await imagesApi.upload(body, file.name);
    return `/images/${image.name}`;
  } catch (error) {
    throw new UploadFailed(error instanceof ApiError ? error.message : "알 수 없는 문제가 생겼어요");
  }
}

/** 브라우저에서 미리 막은 경우 (메시지를 그대로 보여준다) */
export class UploadFailed extends Error {}

/** @param {FileList} list */
function imageFiles(list) {
  return [...list].filter((file) => file.type.startsWith("image/"));
}

/**
 * 긴 변 1600px 이하로 줄여 WebP로 다시 그린다.
 * imageOrientation "from-image": 휴대폰 사진의 회전 정보(EXIF)를 반영해서 그림 → 결과 파일에는 EXIF가 없다
 * @param {File} file
 * @returns {Promise<Blob>}
 */
async function toWebp(file) {
  /** @type {ImageBitmap} */
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new UploadFailed("이미지를 읽지 못했어요 (파일이 깨졌을 수 있어요)");
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new UploadFailed("이 브라우저에서는 이미지를 변환할 수 없어요");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", WEBP_QUALITY));
  // WebP를 못 만드는 브라우저는 PNG를 돌려준다 → 서버가 거절할 것이므로 미리 안내
  if (!(blob instanceof Blob) || blob.type !== "image/webp") {
    throw new UploadFailed("이 브라우저는 WebP 변환을 지원하지 않아요 (Chrome·Edge·Firefox에서 올려 주세요)");
  }
  return blob;
}
