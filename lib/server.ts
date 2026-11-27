import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const missing = () =>
  new HttpError(
    503,
    "서버 연결 설정을 확인해 주세요. 운영자에게 문의해 주세요.",
  );
const secret = () => {
  const key = process.env.DEMO_SESSION_SECRET;
  if (!key || key.length < 32) throw missing();
  return key;
};
export const digest = (v: string) =>
  createHmac("sha256", secret()).update(v).digest("hex");
export const equal = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
export async function identity(role: "visitor" | "admin") {
  const value = (await cookies()).get("booth_" + role)?.value;
  if (!value) return null;
  const [id, exp, mac] = value.split(".");
  if (
    !id ||
    !mac ||
    Number(exp) < Date.now() ||
    !equal(digest([role, id, exp].join(".")), mac)
  )
    return null;
  return id;
}
export async function issue(role: "visitor" | "admin", req: Request) {
  const id = randomUUID(),
    age = role === "admin" ? 7200 : 60 * 86400,
    exp = Date.now() + age * 1000;
  (await cookies()).set(
    "booth_" + role,
    [id, exp, digest([role, id, exp].join("."))].join("."),
    {
      httpOnly: true,
      sameSite: "lax",
      secure:
        new URL(req.url).protocol === "https:" || process.env.VERCEL === "1",
      maxAge: age,
      path: "/",
    },
  );
  return id;
}
const errors: Record<string, [number, string]> = {
  EPOCH: [409, "데모가 초기화되었습니다. 새 상태에서 다시 시도해 주세요."],
  ZONE: [422, "선택한 관리 구역 안에 위치를 지정해 주세요."],
  ITEM: [422, "이 거점에 설치된 품목을 선택해 주세요."],
  CONFLICT: [409, "처리 대상이 변경되었습니다. 최신 목록을 확인해 주세요."],
  COOLDOWN: [429, "같은 품목은 10분에 한 번 신고할 수 있어요."],
  INVALID: [422, "입력한 내용을 확인해 주세요."],
};
export async function rpc(name: string, args: Record<string, unknown>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SECRET_KEY;
  const token = process.env.SUPABASE_BOOTH_RPC_TOKEN;
  if (!url || (!key && !token)) throw missing();
  let data, error;
  if (key) {
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    });
    ({ data, error } = await db.rpc(name, args));
  } else {
    const result = await fetch(new URL("/functions/v1/booth-rpc", url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ name, args }),
      cache: "no-store",
    });
    const json = await result.json().catch(() => null);
    if (result.ok) data = json;
    else
      error = {
        code: String(result.status),
        message: json?.message ?? "GATEWAY",
      };
  }
  if (error) {
    const known = errors[error.message];
    if (known) throw new HttpError(...known);
    console.error("booth RPC", name, error.code);
    throw new HttpError(
      503,
      "공유 데이터베이스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }
  return data;
}
