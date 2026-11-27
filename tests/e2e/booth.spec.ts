import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { rankings, zones, type Snapshot } from "../../lib/model";
const base = "http://127.0.0.1:3100";
const snap = async (p: Page, admin = false) =>
  (await (
    await p.request.get(base + "/api/" + (admin ? "admin/" : "") + "snapshot")
  ).json()) as Snapshot;
const write = async (
  p: Page,
  path: string,
  epoch: string,
  body: object,
  key = randomUUID(),
) => p.request.post(base + "/api/" + path, { data: { epoch, key, ...body } });
async function login(p: Page) {
  await p.goto(base + "/admin");
  await p
    .getByLabel("관리자 비밀번호")
    .fill(process.env.TEST_ADMIN_PIN ?? "1234");
  await p.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(
    p.getByRole("heading", { name: "관리자 대시보드" }),
  ).toBeVisible();
}
test("세 독립 브라우저에서 신고, 위치 지정, 설치, 실시간 및 재연결", async ({
  browser,
}) => {
  const contexts: BrowserContext[] = [];
  try {
    for (let i = 0; i < 3; i++)
      contexts.push(
        await browser.newContext({ viewport: { width: 1320, height: 900 } }),
      );
    const [a, b, c] = await Promise.all(contexts.map((x) => x.newPage()));
    expect((await a.request.get(base + "/api/admin/snapshot")).status()).toBe(
      401,
    );
    for (const path of [
      "sensor",
      "approve",
      "review",
      "reject",
      "install",
      "reset",
      "logout",
    ])
      expect(
        (
          await a.request.post(base + "/api/admin/" + path, { data: {} })
        ).status(),
      ).toBe(401);
    await login(c);
    const before = await snap(c, true);
    // This destructive suite is intentionally limited to the configured local Supabase project.
    const local = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    expect(new URL(local).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
    expect(
      (await write(c, "admin/reset", before.epoch, { confirm: true })).ok(),
    ).toBeTruthy();
    await Promise.all([a.goto(base), b.goto(base)]);
    await expect(
      a.getByText("실시간 연결", { exact: true }).last(),
    ).toBeVisible();
    const s = await snap(c, true),
      five = s.bins.find((x) => x.zone_id === "five")!,
      mixed = s.bins.find((x) => x.zone_id === "student")!,
      epoch = s.epoch;
    const rank = async () =>
      rankings(await snap(c, true)).find((x) => x.zone.id === "five")!.score;
    const score = await rank();
    await a.getByRole("button", { name: "남은 음료", exact: true }).click();
    await a.locator(".station").filter({ hasText: mixed.name }).click();
    await expect(a.locator(".item-detail")).toHaveCount(
      mixed.waste_types.length,
    );
    await a.getByRole("button", { name: "거점 목록" }).click();
    await a.getByRole("button", { name: five.name, exact: true }).click();
    await b.getByRole("button", { name: five.name, exact: true }).click();
    await c.getByLabel("수거 거점", { exact: true }).selectOption(five.id);
    await c.getByLabel("포화도 설정").press("End");
    await c.getByRole("button", { name: "측정값 적용" }).click();
    await expect(a.getByText("100%")).toBeVisible();
    await expect(b.getByText("100%")).toBeVisible();
    expect(await rank()).toBe(score);
    await expect(a.locator(".pin.chosen")).toHaveClass(/kind-liquid/);
    await a.getByRole("button", { name: "가득 참 신고" }).click();
    await a.getByRole("button", { name: "확인하고 신고" }).click();
    await expect(a.getByRole("status")).toContainText("접수");
    expect(await rank()).toBe(score + 1);
    const args = { id: five.id, item: "liquid" };
    const simultaneous = await Promise.all([
      write(a, "reports", epoch, args),
      write(b, "reports", epoch, args),
    ]);
    expect(simultaneous.map((r) => r.status())).toEqual([429, 200]);
    await a.getByRole("button", { name: "추가 설치 건의" }).click();
    await a.getByLabel("가상 위치 선택").selectOption("five");
    await a.getByRole("button", { name: "종이", exact: true }).click();
    await a.getByRole("button", { name: "남은 음료", exact: true }).click();
    await a.getByLabel("건의 사유").fill("부스 공개 시연");
    await a.getByRole("button", { name: "건의 제출" }).click();
    await expect(a.getByRole("status")).toContainText("접수");
    expect(await rank()).toBe(score + 5);
    const proposal = {
      lat: five.lat + 0.00004,
      lng: five.lng,
      types: ["can"],
      reason: "동시 접수",
    };
    const both = await Promise.all([
      write(a, "requests", epoch, proposal),
      write(b, "requests", epoch, proposal),
    ]);
    expect(both.every((r) => r.ok())).toBeTruthy();
    expect(
      (await snap(b)).requests.some((x) => x.reason === "부스 공개 시연"),
    ).toBe(false);
    await expect(c.locator(".rank-row").first()).toContainText("5호관");
    await c.locator(".rank-row").filter({ hasText: "5호관" }).click();
    await c.getByRole("button", { name: "설치 위치 지정" }).click();
    await c.getByRole("button", { name: "가상 위치로 건물 중심 선택" }).click();
    await c.getByLabel("신규 거점명").fill("새 음료 거점");
    await c.getByRole("button", { name: "남은 음료", exact: true }).click();
    const late = await write(b, "requests", epoch, {
      ...proposal,
      reason: "승인 대상 확인 이후",
    });
    expect(late.ok()).toBeTruthy();
    await c.getByRole("button", { name: "승인 대상 확인" }).click();
    await c.getByRole("button", { name: "설치 승인", exact: true }).click();
    await expect(c.getByText("설치 예정으로 등록했습니다.")).toBeVisible();
    expect((await snap(a)).bins.length).toBe(8);
    expect(await rank()).toBe(3);
    await c.getByRole("button", { name: "설치 완료", exact: true }).click();
    await expect(
      a.getByRole("button", { name: "새 음료 거점", exact: true }),
    ).toBeVisible();
    await expect(
      b.getByRole("button", { name: "새 음료 거점", exact: true }),
    ).toBeVisible();
    const installed = await snap(c, true),
      newBin = installed.bins.find((x) => x.name === "새 음료 거점")!;
    expect(newBin.fills.liquid).toBe(0);
    expect(
      (
        await write(c, "admin/install", epoch, { id: installed.batches[0].id })
      ).ok(),
    ).toBeTruthy();
    expect((await snap(c, true)).bins.length).toBe(9);
    expect(
      (await snap(b)).requests.find((r) => r.reason === "승인 대상 확인 이후")
        ?.status,
    ).toBe("pending");
    await a.goto(base + "/requests");
    await expect(a.getByText("설치 완료").first()).toBeVisible();
    await a.reload();
    await expect(a.getByText("부스 공개 시연")).toBeVisible();
    // Exercise a report-only zone and a candidate offset from the reporting bin.
    const tech = rankings(installed).find((x) => x.zone.id === "tech")!;
    expect(tech.requests.length).toBe(0);
    const target = {
      zone: "tech",
      lat: tech.zone.lat + 0.00008,
      lng: tech.zone.lng,
      name: "신고 전용 설치",
      types: ["can"],
      requestIds: [],
      reportIds: tech.reports.map((r) => r.id),
    };
    expect(
      (await write(c, "admin/approve", epoch, { ...target, lat: 35 })).status(),
    ).toBe(422);
    const competing = await Promise.all([
      write(c, "admin/approve", epoch, target),
      write(c, "admin/approve", epoch, target),
    ]);
    expect(competing.map((r) => r.status()).sort()).toEqual([200, 409]);
    const batchId = (await competing.find((r) => r.ok())!.json()).id;
    const completions = await Promise.all([
      write(c, "admin/install", epoch, { id: batchId }),
      write(c, "admin/install", epoch, { id: batchId }),
    ]);
    expect((await completions[0].json()).id).toBe(
      (await completions[1].json()).id,
    );
    await contexts[1].setOffline(true);
    await c.getByRole("button", { name: "전역 데모 초기화" }).click();
    await c.getByRole("button", { name: "전체 데이터 초기화" }).click();
    await expect(a.getByText("아직 접수한 건의가 없어요")).toBeVisible();
    await contexts[1].setOffline(false);
    await expect(
      b.getByRole("button", { name: "새 음료 거점", exact: true }),
    ).toHaveCount(0);
    expect((await write(a, "requests", epoch, proposal)).status()).toBe(409);
    expect(
      (
        await c.request.post(base + "/api/admin/reset", {
          headers: { origin: "https://invalid.example" },
          data: {},
        })
      ).status(),
    ).toBe(403);
    await c.reload();
    await expect(
      c.getByRole("heading", { name: "관리자 대시보드" }),
    ).toBeVisible();
    await c.getByRole("button", { name: "로그아웃" }).click();
    await expect(
      c.getByRole("heading", { name: "관리자 로그인" }),
    ).toBeVisible();
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
test("모바일 배치도, 키보드, 줄어든 모션 및 폴링 폴백", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await context.routeWebSocket(/realtime/, (ws) =>
    ws.close({ code: 1000, reason: "poll test" }),
  );
  await page.goto(base);
  await expect(page.locator(".station")).toHaveCount(8);
  await expect(
    page.getByText("주기적 동기화", { exact: true }).last(),
  ).toBeVisible();
  for (const route of ["/", "/requests", "/guide", "/admin"]) {
    await page.goto(base + route);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.keyboard.press("Tab");
    expect(await page.locator(":focus").count()).toBe(1);
  }
  await page.goto(base);
  await page.getByRole("button", { name: "목록 접기" }).click();
  await expect(page.getByRole("button", { name: "목록 펼치기" })).toBeVisible();
  expect(zones.length).toBe(8);
});
