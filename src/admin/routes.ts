import { Hono } from "hono";
import type { Context } from "hono";
import type { EmbedService } from "../embeds/service.ts";
import type { IssueService } from "../issues/issues.ts";
import type { SettingsService } from "../settings/settings.ts";
import type { ImageService } from "../images/service.ts";
import { MAX_IMAGE_BYTES } from "../images/service.ts";
import type { RenderFn } from "../markdown/index.ts";
import type { PostService } from "../posts/service.ts";
import { LIMITS } from "../posts/validation.ts";
import type { TranslationService } from "../translations/service.ts";
import { TRANSLATION_LIMITS } from "../translations/service.ts";
import { isTranslationLang } from "../translations/types.ts";
import type { TranslationLang } from "../translations/types.ts";
import type { AdminEnv } from "./auth.ts";
import { DeployError } from "./deploy.ts";
import type { DeployTrigger } from "./deploy.ts";
import { HttpError } from "./http-errors.ts";
import { requireImages } from "./images.ts";
import { parseListQuery } from "./query.ts";

/** API에 필요한 것들 */
export interface ApiDeps {
  service: PostService;
  /** 미리보기용 Markdown 렌더러 (빌드와 같은 것) */
  render: RenderFn;
  /** 공개 사이트 배포 요청하는 곳. 없으면 배포 API는 503 (로컬 개발 등) */
  deploy?: DeployTrigger;
  /** 이미지 기능. 없으면 이미지 API는 503 (R2 설정이 없을 때) */
  images?: ImageService;
  /** 사이트 설정 (설계 15-3). 없으면 설정 API는 503 */
  settings?: SettingsService;
  /** 이슈 (설계 15-5). 없으면 이슈 API는 503 */
  issues?: IssueService;
  /** 임베드 카드 정보 (설계 13-9). 없으면 임베드 API는 503 */
  embeds?: EmbedService;
  /** 번역 기능. 없으면 번역 API는 503 (제공자 설정이 없어도 이건 있음 — 그때는 번역 버튼만 503) */
  translations?: TranslationService;
}

/** 요청 본문 최대 크기: 1MB */
export const MAX_BODY_BYTES = 1024 * 1024;

/**
 * /api 아래 주소들. app.ts가 /api에 붙인다.
 * 여기서는 요청을 읽어 서비스에 넘기고 결과를 JSON으로 돌려주기만 한다.
 * 실패하면 오류를 던지고, 응답 변환은 app.ts의 오류 처리가 맡는다.
 */
export function createApiRoutes({ service, render, deploy, images, translations, embeds, settings, issues }: ApiDeps): Hono<AdminEnv> {
  const api = new Hono<AdminEnv>();

  // ── 글 ─────────────────────────────────────────────
  api.get("/posts", async (c) => {
    const filter = parseListQuery(new URL(c.req.url).searchParams);
    return c.json(await service.list(filter));
  });

  api.post("/posts", async (c) => c.json(await service.create(await readJson(c)), 201));

  api.get("/posts/:id", async (c) => c.json(await service.getForEdit(idParam(c))));

  /** 저장: 보낸 칸만 바뀌므로 PATCH (빈 값을 보내면 그 칸을 비움) */
  api.patch("/posts/:id", async (c) => {
    const id = idParam(c);
    return c.json(await service.save(id, await readJson(c)));
  });

  /** 휴지통에 넣기 (되돌릴 수 있음). 영구 삭제는 /trash 아래에만 있다. */
  api.delete("/posts/:id", async (c) => {
    await service.trash(idParam(c));
    return c.body(null, 204);
  });

  // ── 상태 바꾸기 (동작별 주소) ───────────────────────
  api.post("/posts/:id/publish", async (c) => c.json(await service.publish(idParam(c))));
  api.post("/posts/:id/unpublish", async (c) => c.json(await service.unpublish(idParam(c))));

  api.post("/posts/:id/edits/apply", async (c) => c.json(await service.applyEdits(idParam(c))));
  api.delete("/posts/:id/edits", async (c) => {
    await service.discardEdits(idParam(c));
    return c.body(null, 204);
  });

  // ── 휴지통 ─────────────────────────────────────────
  api.post("/trash/:id/restore", async (c) => {
    await service.restore(idParam(c));
    return c.body(null, 204);
  });

  api.delete("/trash/:id", async (c) => {
    await service.purge(idParam(c));
    return c.body(null, 204);
  });

  api.delete("/trash", async (c) => c.json({ removed: await service.emptyTrash() }));

  // ── 그 밖 ──────────────────────────────────────────
  api.get("/tags", async (c) => c.json(await service.listTags()));

  /** 태그의 부모 정하기 { parent: "개발" | null } → 전체 태그 목록 (설계 14). 이름은 주소 인코딩 */
  api.put("/tags/:name/parent", async (c) => {
    const data = await readJson(c);
    const parent = typeof data === "object" && data !== null ? (data as { parent?: unknown }).parent : undefined;
    if (parent !== null && typeof parent !== "string") throw new HttpError("bad_request", "parent(상위 태그)를 글자나 null로 보내 주세요");
    return c.json(await service.setTagParent(c.req.param("name") ?? "", parent));
  });

  /**
   * 입력 제한값. 관리자 화면이 "남은 글자 수"를 보여줄 때 쓴다. 번역 칸 제한은 translation 아래에.
   * 화면에 숫자를 따로 적지 않고 여기서 받아 가서, 서버 규칙과 화면 표시가 어긋나지 않게 한다.
   */
  api.get("/limits", (c) => c.json({ ...LIMITS, translation: TRANSLATION_LIMITS }));

  /** 미리보기: { body } → { html }. 저장하지 않는다. */
  api.post("/preview", async (c) => {
    const data = await readJson(c);
    const body = typeof data === "object" && data !== null ? (data as { body?: unknown }).body : undefined;
    if (typeof body !== "string") throw new HttpError("bad_request", "body(본문)를 글자로 보내 주세요");
    if (body.length > LIMITS.body) throw new HttpError("bad_request", "본문이 너무 길어요");
    return c.json({ html: render(body) });
  });

  // ── 이미지 ──────────────────────────────────────────
  /**
   * 이미지 올리기. 본문 = 파일 그대로, 원래 파일 이름은 X-File-Name 헤더(주소 인코딩).
   * 새로 저장 201 / 같은 이미지가 이미 있음 200, 둘 다 { image }
   */
  api.post("/images", async (c) => {
    const service = requireImages(images);
    const bytes = await readBytes(c, MAX_IMAGE_BYTES);
    const { image, created } = await service.upload(bytes, fileNameHeader(c));
    return c.json({ image }, created ? 201 : 200);
  });

  // ── 번역 (설계 12-9) ────────────────────────────────
  /** 목록 표시용: 번역이 있는 글들의 상태 */
  api.get("/translations/:lang", async (c) => c.json(await requireTranslations(translations).list(langParam(c))));

  const translation = "/posts/:id/translations/:lang";
  api.get(translation, async (c) => c.json(await requireTranslations(translations).get(idParam(c), langParam(c))));
  /** LLM 번역 → 초안 (오래 걸릴 수 있음) */
  api.post(`${translation}/generate`, async (c) => {
    return c.json(await requireTranslations(translations).generate(idParam(c), langParam(c)));
  });
  api.patch(`${translation}/draft`, async (c) => {
    const [id, lang] = [idParam(c), langParam(c)];
    return c.json(await requireTranslations(translations).saveDraft(id, lang, await readJson(c)));
  });
  api.delete(`${translation}/draft`, async (c) => {
    await requireTranslations(translations).deleteDraft(idParam(c), langParam(c));
    return c.body(null, 204);
  });
  api.post(`${translation}/publish`, async (c) => c.json(await requireTranslations(translations).publish(idParam(c), langParam(c))));
  api.post(`${translation}/unpublish`, async (c) => {
    return c.json(await requireTranslations(translations).unpublish(idParam(c), langParam(c)));
  });

  // ── 사이트 설정 (설계 15-3) ──────────────────────────
  api.get("/settings", async (c) => c.json(await requireSettings(settings).get()));
  /** 통째로 저장 (칸별 오류는 400). 공개 사이트는 배포해야 바뀜 */
  api.put("/settings", async (c) => c.json(await requireSettings(settings).save(await readJson(c))));

  // ── 이슈 (설계 15-5) ────────────────────────────────
  api.get("/issues", async (c) => c.json(await requireIssues(issues).list()));
  api.post("/issues", async (c) => c.json(await requireIssues(issues).create(await readJson(c)), 201));
  api.get("/issues/:id", async (c) => c.json(await requireIssues(issues).get(issueIdParam(c))));
  api.put("/issues/:id", async (c) => c.json(await requireIssues(issues).update(issueIdParam(c), await readJson(c))));
  api.delete("/issues/:id", async (c) => {
    await requireIssues(issues).delete(issueIdParam(c));
    return c.body(null, 204);
  });

  // ── 임베드 (설계 13-9) ──────────────────────────────
  /** 카드 정보: 저장된 게 새것이면 그대로, 아니면 받아서 저장. 임베드 대상 주소가 아니면 404 */
  api.get("/embeds", async (c) => {
    if (!embeds) throw new HttpError("unavailable", "임베드 기능이 설정되지 않았어요");
    const info = await embeds.get(c.req.query("url") ?? "");
    if (!info) throw new HttpError("not_found", "임베드할 수 없는 주소예요 (http·https만)");
    return c.json(info);
  });

  // ── 배포 ────────────────────────────────────────────
  /** 공개 사이트 배포 요청 → 202 (빌드·배포는 GitHub Actions에서 따로 진행) */
  api.post("/deploy", async (c) => {
    await requireDeploy(deploy).request().catch(toHttpError);
    return c.json({ requested: true }, 202);
  });

  /** 가장 최근 배포 상태 (한 번도 없으면 { run: null }) */
  api.get("/deploy", async (c) => c.json({ run: await requireDeploy(deploy).latest().catch(toHttpError) }));

  return api;
}

function requireIssues(issues: IssueService | undefined): IssueService {
  if (!issues) throw new HttpError("unavailable", "이슈 기능이 설정되지 않았어요");
  return issues;
}

/** 주소의 이슈 :id. 숫자가 아니면 404 */
function issueIdParam(c: Context<AdminEnv>): number {
  const raw = c.req.param("id") ?? "";
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new HttpError("not_found", "이슈를 찾을 수 없어요");
  return Number(raw);
}

function requireSettings(settings: SettingsService | undefined): SettingsService {
  if (!settings) throw new HttpError("unavailable", "설정 기능이 설정되지 않았어요");
  return settings;
}

function requireTranslations(translations: TranslationService | undefined): TranslationService {
  if (!translations) throw new HttpError("unavailable", "번역 기능이 설정되지 않았어요");
  return translations;
}

/** 주소의 :lang. 지원하는 언어가 아니면 404 */
function langParam(c: Context<AdminEnv>): TranslationLang {
  const raw = c.req.param("lang") ?? "";
  if (!isTranslationLang(raw)) throw new HttpError("not_found", "지원하지 않는 언어예요");
  return raw;
}

function requireDeploy(deploy: DeployTrigger | undefined): DeployTrigger {
  if (!deploy) throw new HttpError("unavailable", "배포 설정이 없어요 (로컬 개발에서는 배포할 수 없어요)");
  return deploy;
}

/** GitHub 쪽 실패는 502로. 그 밖(버그)은 그대로 던져 500 + 로그 */
function toHttpError(error: unknown): never {
  if (error instanceof DeployError) throw new HttpError("bad_gateway", error.message);
  throw error;
}

/**
 * 주소의 :id. 1 이상의 정수가 아니면 404 (없는 글과 같게 취급)
 * 예) /posts/42 → 42, /posts/abc → 404
 */
function idParam(c: Context<AdminEnv>): number {
  const raw = c.req.param("id") ?? "";
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new HttpError("not_found", "글을 찾을 수 없어요");
  }
  return Number(raw);
}

/**
 * 요청 본문을 JSON으로 읽는다.
 * - Content-Type이 application/json이 아니면 400
 * - 1MB를 넘으면 413 (Content-Length로 먼저 보고, 실제 크기로 한 번 더)
 * - JSON 문법이 틀리면 400
 */
async function readJson(c: Context<AdminEnv>): Promise<unknown> {
  const type = c.req.header("Content-Type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new HttpError("bad_request", "요청 본문은 JSON(Content-Type: application/json)으로 보내 주세요");
  }

  const declared = Number(c.req.header("Content-Length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw tooLarge();

  const text = await c.req.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw tooLarge();

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError("bad_request", "요청 본문이 올바른 JSON이 아니에요");
  }
}

function tooLarge(): HttpError {
  return new HttpError("payload_too_large", "요청 본문은 1MB까지예요");
}

/**
 * 요청 본문을 바이트 그대로 읽는다. 최대 크기를 넘으면 413
 * (Content-Length로 먼저 보고, 실제 크기로 한 번 더)
 */
async function readBytes(c: Context<AdminEnv>, maxBytes: number): Promise<Uint8Array> {
  const over = () => new HttpError("payload_too_large", `파일은 ${Math.round(maxBytes / 1024 / 1024)}MB까지예요`);
  const declared = Number(c.req.header("Content-Length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw over();
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw over();
  return bytes;
}

/** X-File-Name 헤더 (주소 인코딩된 파일 이름). 없거나 풀 수 없으면 null */
function fileNameHeader(c: Context<AdminEnv>): string | null {
  const raw = c.req.header("X-File-Name");
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}
