import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { items } from "@/lib/model";
import { digest, equal, HttpError, identity, issue, rpc } from "@/lib/server";
export const dynamic = "force-dynamic";
const uuid = z.uuid(),
  types = z.array(z.enum(items)).min(1).max(6);
const point = {
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
};
const actions = {
  request: z.object({
    ...point,
    types,
    reason: z.string().trim().min(1).max(400),
  }),
  report: z.object({ id: uuid, item: z.enum(items) }),
  sensor: z.object({
    id: uuid,
    item: z.enum(items),
    percent: z.int().min(0).max(100),
  }),
  approve: z.object({
    ...point,
    zone: z.string().max(30),
    types,
    name: z.string().trim().min(1).max(60),
    requestIds: z.array(uuid).max(5000),
    reportIds: z.array(uuid).max(5000),
  }),
  install: z.object({ id: uuid }),
  review: z.object({ id: uuid }),
  reject: z.object({ id: uuid }),
  reset: z.object({ confirm: z.literal(true) }),
};
const respond = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
type Context = { params: Promise<{ path: string[] }> };
async function route(req: Request, ctx: Context) {
  try {
    const path = (await ctx.params).path.join("/"),
      post = req.method === "POST",
      admin = path.startsWith("admin/");
    if (post) {
      const origin = req.headers.get("origin");
      if (
        (origin &&
          (new URL(origin).host !== req.headers.get("host") ||
            new URL(origin).protocol !== new URL(req.url).protocol)) ||
        req.headers.get("sec-fetch-site") === "cross-site" ||
        !req.headers.get("content-type")?.startsWith("application/json")
      )
        throw new HttpError(403, "허용되지 않은 요청입니다.");
    }
    let actor = await identity(admin ? "admin" : "visitor");
    if (admin && path !== "admin/login" && !actor)
      throw new HttpError(401, "관리자 로그인이 필요합니다.");
    if (!post && (path === "snapshot" || path === "admin/snapshot")) {
      if (!actor) actor = await issue("visitor", req);
      return respond(await rpc("booth_snapshot", { actor, admin_view: admin }));
    }
    if (!post) throw new HttpError(404, "경로를 확인해 주세요.");
    const raw = await req.text();
    if (raw.length > 512000)
      throw new HttpError(413, "입력한 내용이 너무 깁니다.");
    const input = JSON.parse(raw);
    if (path === "admin/login") {
      const { password } = z
        .object({ password: z.string().min(1).max(128) })
        .parse(input);
      if (!process.env.DEMO_ADMIN_PASSWORD)
        throw new HttpError(503, "관리자 PIN 설정이 필요합니다.");
      const client =
        req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
        "booth-local";
      if (!(await rpc("booth_login_attempt", { client_key: digest(client) })))
        throw new HttpError(
          429,
          "로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.",
        );
      if (!equal(digest(password), digest(process.env.DEMO_ADMIN_PASSWORD)))
        throw new HttpError(401, "비밀번호를 확인해 주세요.");
      await issue("admin", req);
      return respond({ ok: true });
    }
    if (path === "admin/logout") {
      (await cookies()).delete("booth_admin");
      return respond({ ok: true });
    }
    if (!actor)
      throw new HttpError(401, "지도를 다시 열어 방문자 연결을 시작해 주세요.");
    const action =
      path === "requests"
        ? "request"
        : path === "reports"
          ? "report"
          : admin
            ? path.slice(6)
            : "";
    if (
      !Object.hasOwn(actions, action) ||
      (admin && ["report", "request"].includes(action))
    )
      throw new HttpError(404, "경로를 확인해 주세요.");
    const { epoch, key } = z.object({ epoch: uuid, key: uuid }).parse(input);
    const payload = actions[action as keyof typeof actions].parse(input);
    return respond(
      await rpc("booth_mutate", {
        actor,
        action,
        generation: epoch,
        key,
        payload,
      }),
    );
  } catch (e) {
    if (e instanceof HttpError) return respond({ error: e.message }, e.status);
    if (e instanceof SyntaxError || e instanceof z.ZodError)
      return respond({ error: "필수 항목과 입력값을 확인해 주세요." }, 400);
    console.error("booth handler", e instanceof Error ? e.name : "unknown");
    return respond({ error: "요청을 처리하지 못했습니다." }, 500);
  }
}
export { route as GET, route as POST };
