import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { rankings, zones, type Snapshot } from "../lib/model";
const db = new PGlite(),
  first = randomUUID(),
  other = randomUUID(),
  admin = randomUUID();
let epoch: string;
async function snap(actor = admin, full = true) {
  return (
    await db.query<{ s: Snapshot }>("select public.booth_snapshot($1,$2) s", [
      actor,
      full,
    ])
  ).rows[0].s;
}
async function write(
  action: string,
  payload: object,
  actor = admin,
  key = randomUUID(),
  gen = epoch,
) {
  return (
    await db.query<{ r: { id: string } }>(
      "select public.booth_mutate($1,$2,$3,$4,$5) r",
      [actor, action, gen, key, JSON.stringify(payload)],
    )
  ).rows[0].r;
}
before(async () => {
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls; create publication supabase_realtime",
  );
  for (const f of readdirSync("supabase/migrations").sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  await db.exec(readFileSync("supabase/seed.sql", "utf8"));
  await db.exec("set role service_role");
  epoch = (await snap()).epoch;
});
after(() => db.close());
test("시드와 공간 검증, 신고 쿨다운, 재시도, 승인/설치, 세대 전환", async () => {
  const initial = await snap(),
    five = initial.bins.find((b) => b.zone_id === "five")!;
  for (const z of zones) {
    const r = await db.query<{ id: string }>("select booth.zone_at($1,$2) id", [
      z.lat,
      z.lng,
    ]);
    assert.equal(r.rows[0].id, z.id);
  }
  const point = { lat: five.lat + 0.00004, lng: five.lng + 0.00003 },
    proposal = { ...point, types: ["liquid", "can"], reason: "테스트" };
  await assert.rejects(
    write("request", { ...proposal, lat: 0 }, first),
    /ZONE/,
  );
  const key = randomUUID(),
    [req, same] = await Promise.all([
      write("request", proposal, first, key),
      write("request", proposal, first, key),
    ]);
  assert.equal(req.id, same.id);
  await assert.rejects(
    write("request", { ...proposal, reason: "다른 요청" }, first, key),
    /CONFLICT/,
  );
  assert.equal((await snap(first, false)).requests.length, 1);
  assert.equal((await snap(other, false)).requests.length, 0);
  assert.deepEqual((await snap(first, false)).reports, []);
  const args = { id: five.id, item: "liquid" },
    [a, b] = await Promise.allSettled([
      write("report", args, first),
      write("report", args, first),
    ]);
  assert.equal([a, b].filter((r) => r.status === "fulfilled").length, 1);
  assert.match(
    String([a, b].find((r) => r.status === "rejected")?.reason),
    /COOLDOWN/,
  );
  await write("report", args, other);
  const beforeSensor = await snap(),
    rank = rankings(beforeSensor).find((r) => r.zone.id === "five")!;
  assert.equal(
    rank.score,
    rankings(initial).find((r) => r.zone.id === "five")!.score + 5,
  );
  assert.equal(
    beforeSensor.bins.find((b) => b.id === five.id)?.fills.liquid,
    five.fills.liquid,
  );
  await write("sensor", { ...args, percent: 85 });
  await write("sensor", { ...args, percent: 94 });
  const afterSensor = await snap();
  assert.equal(
    rankings(afterSensor).find((r) => r.zone.id === "five")!.score,
    rank.score,
  );
  const entered = (s: Snapshot) =>
    s.readings.filter(
      (r) => (r.previous_percent ?? 0) < 80 && r.fill_percent >= 80,
    ).length;
  assert.equal(entered(afterSensor), entered(beforeSensor) + 1);
  const target = {
    ...point,
    lat: point.lat + 0.00005,
    zone: "five",
    name: "테스트 거점",
    types: ["can", "liquid"],
    requestIds: [req.id],
    reportIds: rank.reports.map((r) => r.id),
  };
  await write("request", proposal, other);
  await assert.rejects(write("approve", { ...target, lat: 0 }), /ZONE/);
  const batch = await write("approve", target);
  await assert.rejects(write("approve", target), /CONFLICT/);
  const approved = await snap();
  assert.equal(approved.bins.length, initial.bins.length);
  assert.equal((await snap(first, false)).requests[0].status, "approved");
  assert.equal(
    rankings(approved).find((r) => r.zone.id === "five")!.score,
    rank.score + 3 - 5,
  );
  const installs = await Promise.all([
    write("install", { id: batch.id }),
    write("install", { id: batch.id }),
  ]);
  assert.equal(installs[0].id, installs[1].id);
  const installed = await snap();
  const added = installed.bins.find((b) => b.id === installs[0].id)!;
  assert.equal(added.lat, target.lat);
  assert.deepEqual(added.fills, { can: 0, liquid: 0 });
  assert.equal(installed.bins.length, 9);
  assert.equal((await snap(first, false)).requests[0].lat, point.lat);
  const tech = rankings(installed).find((r) => r.zone.id === "tech")!;
  assert.equal(tech.requests.length, 0);
  const only = await write("approve", {
    ...target,
    ...{ lat: tech.zone.lat, lng: tech.zone.lng, zone: "tech" },
    requestIds: [],
    reportIds: tech.reports.map((r) => r.id),
  });
  await write("install", { id: only.id });
  const rev = (await snap()).version;
  await write("reset", { confirm: true });
  const reset = await snap();
  assert.ok(reset.version > rev);
  assert.notEqual(reset.epoch, epoch);
  assert.equal(reset.bins.length, 8);
  assert.equal(reset.batches.length, 0);
  await assert.rejects(write("request", proposal, first), /EPOCH/);
});
test("공개 역할은 revision만 읽고 업무 데이터 및 RPC는 접근할 수 없음", async () => {
  await db.exec("set role anon");
  assert.equal(
    (await db.query("select * from public.demo_revision")).rows.length,
    1,
  );
  await assert.rejects(snap(), /permission denied/);
  await assert.rejects(
    db.query("select * from booth.full_reports"),
    /permission denied/,
  );
  await assert.rejects(
    db.query("update public.demo_revision set version=0"),
    /permission denied/,
  );
  await db.exec("reset role");
});
test("로그인 시도 제한은 DB에 보존되며 초기화와 독립적이다", async () => {
  for (let n = 1; n <= 9; n++) {
    const result = await db.query<{ ok: boolean }>(
      "select public.booth_login_attempt($1) ok",
      ["sample"],
    );
    assert.equal(result.rows[0].ok, n <= 8);
  }
  const fresh = (await snap()).epoch;
  await write("reset", { confirm: true }, admin, randomUUID(), fresh);
  const limited = await db.query<{ ok: boolean }>(
    "select public.booth_login_attempt($1) ok",
    ["sample"],
  );
  assert.equal(limited.rows[0].ok, false);
});
test("도형 경계와 미세한 좌표 차이에서도 JS와 SQL 판정이 일치한다", async () => {
  const { zoneAt } = await import("../lib/model");
  const points = zones.flatMap((z) =>
    z.polygon.flatMap(([lng, lat]) => [
      { lng, lat },
      { lng: lng + 1e-7, lat },
    ]),
  );
  const { rows } = await db.query<{ id: string | null }>(
    "select booth.zone_at(p.lat,p.lng) id from jsonb_to_recordset($1) as p(lat float8,lng float8)",
    [JSON.stringify(points)],
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    points.map((p) => zoneAt(p)?.id ?? null),
  );
});
