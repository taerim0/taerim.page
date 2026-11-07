import { Hono } from "hono";
import type { Context } from "hono";
import type { RenderFn } from "../markdown/index.ts";
import type { PostService } from "../posts/service.ts";
import { LIMITS } from "../posts/validation.ts";
import type { AdminEnv } from "./auth.ts";
import { HttpError } from "./http-errors.ts";
import { parseListQuery } from "./query.ts";

/** API에 필요한 것들 */
export interface ApiDeps {
  service: PostService;
  /** 미리보기용 Markdown 렌더러 (빌드와 같은 것) */
  render: RenderFn;
}

/** 요청 본문 최대 크기: 1MB */
export const MAX_BODY_BYTES = 1024 * 1024;

/**
 * /api 아래 주소들. app.ts가 /api에 붙인다.
 * 여기서는 요청을 읽어 서비스에 넘기고 결과를 JSON으로 돌려주기만 한다.
 * 실패하면 오류를 던지고, 응답 변환은 app.ts의 오류 처리가 맡는다.
 */
export function createApiRoutes({ service, render }: ApiDeps): Hono<AdminEnv> {
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

  /** 미리보기: { body } → { html }. 저장하지 않는다. */
  api.post("/preview", async (c) => {
    const data = await readJson(c);
    const body = typeof data === "object" && data !== null ? (data as { body?: unknown }).body : undefined;
    if (typeof body !== "string") throw new HttpError("bad_request", "body(본문)를 글자로 보내 주세요");
    if (body.length > LIMITS.body) throw new HttpError("bad_request", "본문이 너무 길어요");
    return c.json({ html: render(body) });
  });

  return api;
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
