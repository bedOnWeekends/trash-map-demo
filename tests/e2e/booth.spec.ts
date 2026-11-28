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
    await expect(a.locator(".pin").first()).toBeVisible();
    for (const page of [a, c]) {
      await expect(page.getByText("데모", { exact: true })).toHaveCount(0);
      await expect(page.getByText("실시간 연결", { exact: true })).toHaveCount(
        0,
      );
    }
    const s = await snap(c, true),
      five = s.bins.find((x) => x.zone_id === "five")!,
      mixed = s.bins.find((x) => x.zone_id === "student")!,
      epoch = s.epoch;
    const rank = async () =>
      rankings(await snap(c, true)).find((x) => x.zone.id === "five")!.score;
    const score = await rank();
    await c.locator('[data-zone-id="main"]').click();
    const adminMap = await c
      .locator("#management .map-surface")
      .elementHandle();
    const adminCamera = await c
      .locator("#management .basemap")
      .getAttribute("viewBox");
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
    await expect(
      a.getByRole("button", { name: "남은 음료", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await a.getByLabel("건의 사유").fill("부스 공개 시연");
    await a.getByRole("button", { name: "건의 제출" }).click();
    await expect(a.getByRole("status")).toContainText("설치 건의를 접수했어요");
    expect(await rank()).toBe(score + 5);
    await expect(
      c
        .locator(".rank-explanation")
        .filter({ hasText: "설치 건의 접수" })
        .first(),
    ).toBeVisible();
    await expect(c.locator('.rank-row[aria-pressed="true"]')).toContainText(
      "본관",
    );
    expect(
      await adminMap!.evaluate(
        (el) => el === document.querySelector("#management .map-surface"),
      ),
    ).toBe(true);
    expect(
      await c.locator("#management .basemap").getAttribute("viewBox"),
    ).toBe(adminCamera);
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
    await expect(c.locator(".rank-row").first().locator("b")).toHaveText(
      String(score + 11),
    );
    await c.locator(".rank-row").filter({ hasText: "5호관" }).click();
    await c.getByRole("button", { name: "설치 위치 지정" }).click();
    await c.getByRole("button", { name: "가상 위치로 건물 중심 선택" }).click();
    await c.getByLabel("신규 거점명").fill("새 음료 거점");
    await expect(
      c.getByRole("button", { name: "남은 음료", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
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
    await expect(c.getByText("신규 거점을 설치했습니다.")).toBeVisible();
    const installed = await snap(c, true),
      newBin = installed.bins.find((x) => x.name === "새 음료 거점")!;
    const marker = '.pin[data-bin-ids~="' + newBin.id + '"]:not([inert])';
    await expect(a.locator(marker)).toBeVisible();
    await expect(b.locator(marker)).toBeVisible();
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
    const completed = (await snap(a)).requests.find(
      (r) => r.reason === "부스 공개 시연",
    )!;
    expect(completed.installed_bin_id).toBe(newBin.id);
    await a.setViewportSize({ width: 390, height: 844 });
    const entry = a
      .locator(".request-entry")
      .filter({ hasText: "부스 공개 시연" });
    await entry.locator("summary").click();
    await entry.getByRole("link", { name: "설치된 수거함 보기" }).click();
    await expect(a.locator(".sheet-label")).toHaveText(newBin.name);
    await expect(a.locator(marker)).toHaveAttribute("aria-pressed", "true");
    await a.setViewportSize({ width: 1320, height: 900 });
    await a.goto(base + "/requests");
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
    await expect(b.locator(marker)).toHaveCount(0);
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
  let reads = 0;
  page.on("response", (r) => {
    if (new URL(r.url()).pathname === "/api/snapshot" && r.ok()) reads++;
  });
  await page.goto(base);
  await page.getByRole("button", { name: "목록 펼치기" }).click();
  await expect(page.locator(".station")).toHaveCount(8);
  const initial = reads;
  await expect.poll(() => reads, { timeout: 15000 }).toBeGreaterThan(initial);
  await expect(page.getByText(/주기적 동기화|오프라인|재연결 중/)).toHaveCount(
    0,
  );
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
  await page.getByRole("button", { name: "목록 펼치기" }).click();
  await page.getByRole("button", { name: "시트 닫기" }).click();
  await expect(page.getByRole("button", { name: "목록 펼치기" })).toBeVisible();
  expect(zones.length).toBe(8);
});

const sizes = [
  [320, 568],
  [360, 640],
  [375, 667],
  [390, 844],
  [412, 915],
  [430, 932],
  [844, 390],
] as const;
test("학생 앱 셸과 배출 안내가 화면 크기와 방향에 맞는다", async ({
  page,
}, info) => {
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    for (const route of ["/", "/requests", "/guide"]) {
      await page.goto(base + route);
      const app = page.locator(".student-app");
      await expect(app).toBeVisible();
      await expect(app.locator(".student-tabs [aria-current]")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const fits = await app.evaluate((el) => {
        const root = document.documentElement,
          nav = el.querySelector(".student-tabs")!.getBoundingClientRect();
        return (
          root.scrollHeight <= innerHeight + 1 &&
          root.scrollWidth <= innerWidth + 1 &&
          nav.bottom <= innerHeight + 1 &&
          nav.top >= 0
        );
      });
      expect(fits, route + " " + width + "x" + height).toBe(true);
      if (route === "/") {
        await expect(page.locator(".pin").first()).toBeVisible();
        await expect
          .poll(() =>
            page.locator(".pin").evaluateAll((pins) =>
              pins.every((pin) => {
                const r = pin.getBoundingClientRect();
                return pin.contains(
                  document.elementFromPoint(
                    r.x + r.width / 2,
                    r.y + r.height / 2,
                  ),
                );
              }),
            ),
          )
          .toBe(true);
        const credit = page.locator(".map-credit");
        if (await credit.count()) {
          const c = await credit.boundingBox(),
            sheet = await page.locator(".mobile-sheet").boundingBox();
          expect(sheet!.y + sheet!.height).toBeLessThanOrEqual(c!.y + 1);
        }
      }
      if (route === "/requests")
        await expect(
          page.locator(".request-empty, .request-entry").first(),
        ).toBeVisible();
      if (route === "/guide") {
        const buttons = page.locator(".guide-grid button");
        await expect(buttons).toHaveCount(6);
        await expect(buttons.last()).toBeInViewport({ ratio: 1 });
        await buttons.last().click();
        await expect(page.getByRole("dialog")).toContainText(
          "컵과 음료는 따로",
        );
        await page.getByRole("button", { name: "닫기", exact: true }).click();
      }
      await page.screenshot({
        path: info.outputPath(
          width + "x" + height + "-" + (route.slice(1) || "map") + ".png",
        ),
        animations: "disabled",
      });
    }
  }
});
test("모바일 시트, 품목 신고, 작성 복원, 제출 및 실시간 갱신", async ({
  page,
  browser,
}, info) => {
  expect(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname).toMatch(
    /^(127\.0\.0\.1|localhost)$/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const admin = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  try {
    await login(admin);
    await page.goto(base);
    const model = await snap(admin, true),
      bin = model.bins.find((b) => b.waste_types.length > 1)!;
    const search = page.getByRole("searchbox");
    await search.fill(bin.name);
    await expect(page.locator(".station")).toHaveCount(1);
    await expect(page.locator(".pin")).toHaveCount(1);
    await page.getByRole("button", { name: "검색·필터 초기화" }).click();
    await page.getByRole("button", { name: "전체 품목 필터" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "남은 음료", exact: true })
      .click();
    await expect(page.locator(".quick-filters [aria-pressed=true]")).toHaveText(
      "남은 음료",
    );
    await page.getByRole("button", { name: "시트 닫기" }).click();
    const handle = page.locator(".sheet-handle");
    await handle.hover(); // Wait for the snap animation to settle before taking pointer coordinates.
    const rect = await handle.boundingBox();
    await page.mouse.move(rect!.x + 60, rect!.y + 20);
    await page.mouse.down();
    await page.mouse.move(rect!.x + 60, rect!.y - 120, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator(".mobile-workbench")).toHaveAttribute(
      "data-snap",
      "half",
    );
    // The two liquid stations fit on one sheet, so the next stop is peek.
    await handle.click();
    await expect(page.locator(".station-sheet")).toHaveAttribute(
      "data-state",
      "peek",
    );
    await page.getByRole("button", { name: "전체", exact: true }).click();
    await handle.click();
    await expect(page.locator(".station-sheet")).toHaveAttribute(
      "data-state",
      "expanded",
    );
    await page.getByRole("button", { name: "시트 닫기" }).click();
    // Open a station from its actual map pin. The mixed station near the center is accessible at initial zoom.
    const central =
      model.bins.find((b) => b.zone_id === "anniversary") ??
      model.bins.find((b) => b.name.includes("60주년")) ??
      bin;
    const camera = page.locator(".basemap");
    const viewBefore = await camera.getAttribute("viewBox");
    await page.getByRole("button", { name: central.name, exact: true }).click();
    await expect(page.locator(".item-detail")).toHaveCount(
      central.waste_types.length,
    );
    await expect(page.locator(".mobile-workbench")).toHaveAttribute(
      "data-snap",
      "half",
    );
    await expect(camera).toHaveAttribute("viewBox", viewBefore!);
    await page.screenshot({
      path: info.outputPath("station-detail.png"),
      animations: "disabled",
    });
    const waste = central.waste_types[0];
    const next = central.fills[waste] === 72 ? 71 : 72;
    expect(
      (
        await write(admin, "admin/sensor", model.epoch, {
          id: central.id,
          item: waste,
          percent: next,
        })
      ).ok(),
    ).toBe(true);
    await expect(page.locator(".item-detail").first()).toContainText(
      next + "%",
    );
    await expect(page.locator(".pin.chosen")).toHaveAttribute(
      "title",
      central.name,
    );
    await expect(page.locator(".mobile-workbench")).toHaveAttribute(
      "data-snap",
      "half",
    );
    await expect(camera).toHaveAttribute("viewBox", viewBefore!);
    await page.locator(".report").first().click();
    await page.getByRole("button", { name: "확인하고 신고" }).click();
    await expect(page.getByRole("status")).toContainText("신고를 접수");
    expect(
      (await snap(admin, true)).bins.find((b) => b.id === central.id)?.fills[
        waste
      ],
    ).toBe(next);
    await page.getByRole("button", { name: "추가 설치 건의" }).click();
    await expect(page.getByRole("button", { name: "다음" })).toBeDisabled();
    await page.getByLabel("가상 위치 선택").selectOption("five");
    await expect(page.locator(".pin.kind-candidate")).toBeVisible();
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByRole("button", { name: "다음" })).toBeDisabled();
    await page.getByRole("button", { name: "종이", exact: true }).click();
    await page.getByRole("button", { name: "유리", exact: true }).click();
    await page.screenshot({
      path: info.outputPath("wizard-items.png"),
      animations: "disabled",
    });
    await page.getByRole("button", { name: "다음" }).click();
    const reason = "모바일 세미나 분리배출";
    await page.getByLabel("건의 사유").fill(reason);
    await page.getByRole("button", { name: "이전" }).click();
    await expect(
      page.getByRole("button", { name: "종이", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "다음" }).click();
    await page.getByRole("link", { name: "내 건의", exact: true }).click();
    await page.getByRole("link", { name: "수거함 지도", exact: true }).click();
    await expect(page.getByLabel("건의 사유")).toHaveValue(reason);
    await page.getByRole("button", { name: "건의 작성 취소" }).click();
    await page.getByRole("button", { name: "계속 작성" }).click();
    await page.setViewportSize({ width: 390, height: 415 });
    await page.getByLabel("건의 사유").focus();
    await expect(
      page.getByRole("button", { name: "건의 제출" }),
    ).toBeInViewport({ ratio: 1 });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: info.outputPath("wizard.png") });
    await page.route(
      "**/api/requests",
      (route) =>
        route.fulfill({
          status: 503,
          json: { error: "잠시 뒤 다시 시도해 주세요." },
        }),
      { times: 1 },
    );
    await page.getByRole("button", { name: "건의 제출" }).click();
    await expect(page.getByRole("status")).toContainText("다시 시도");
    await expect(page.getByLabel("건의 사유")).toHaveValue(reason);
    await page.getByRole("button", { name: "건의 제출" }).click();
    await expect(page.getByRole("status")).toContainText("접수");
    await page.getByRole("link", { name: "내 건의 보기", exact: true }).click();
    await expect(page.locator(".request-entry").first()).toContainText("접수");
    await page.locator(".request-entry summary").first().click();
    await expect(page.getByText(reason)).toBeVisible();
    await page.screenshot({ path: info.outputPath("request-history.png") });
  } finally {
    await admin.close();
  }
});

test("터치 지도 제스처, 직접 위치 지정, 안전 영역과 가로 시트", async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    isMobile: true,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", {
      insets: { top: 16, bottom: 24, left: 0, right: 0 },
    });
    await page.goto(base);
    const sheet = page.locator(".mobile-workbench"),
      map = page.locator(".schematic"),
      svg = map.locator("svg.basemap");
    await expect(page.locator(".pin").first()).toBeVisible();
    await expect(page.locator(".student-tabs")).toHaveCSS(
      "padding-bottom",
      "24px",
    );
    await expect(page.locator(".student-app")).toHaveCSS("padding-top", "16px");
    async function touch(
      type: "touchStart" | "touchMove" | "touchEnd",
      coords: number[][],
    ) {
      await cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: coords.map(([x, y], id) => ({ x, y, id })),
      });
    }
    const basis = await svg.getAttribute("viewBox");
    await touch("touchStart", [
      [160, 230],
      [220, 230],
    ]);
    await touch("touchMove", [
      [125, 230],
      [255, 230],
    ]);
    await touch("touchEnd", []);
    await expect.poll(() => svg.getAttribute("viewBox")).not.toBe(basis);
    expect(
      Number((await svg.getAttribute("viewBox"))!.split(" ")[2]),
    ).toBeLessThan(Number(basis!.split(" ")[2]));
    const zoomed = await svg.getAttribute("viewBox");
    await touch("touchStart", [[180, 210]]);
    await touch("touchMove", [[155, 245]]);
    await touch("touchEnd", []);
    await expect.poll(() => svg.getAttribute("viewBox")).not.toBe(zoomed);
    await expect(sheet).toHaveAttribute("data-snap", "peek");
    await page.getByRole("button", { name: "지도 범위 맞추기" }).click();
    await expect(svg).toHaveAttribute("viewBox", basis!);
    await page.getByRole("button", { name: "추가 설치 건의" }).click();
    const surface = await map.boundingBox();
    await page.touchscreen.tap(surface!.x + 5, surface!.y + 5);
    await expect(page.getByRole("status")).toContainText("캠퍼스 관리 구역");
    await expect(page.getByRole("button", { name: "다음" })).toBeDisabled();
    const point = await page
      .locator(".map-label")
      .filter({ hasText: "본관" })
      .evaluate((el) => {
        const r = el.parentElement!.getBoundingClientRect(),
          label = el as HTMLElement;
        return {
          x: r.x + (parseFloat(label.style.left) * r.width) / 100,
          y: r.y + (parseFloat(label.style.top) * r.height) / 100,
        };
      });
    const viewPicking = await svg.getAttribute("viewBox");
    await page.touchscreen.tap(point.x, point.y);
    await expect(page.getByLabel("가상 위치 선택")).toHaveValue("main");
    await expect(svg).toHaveAttribute("viewBox", viewPicking!);
    const target = (await snap(page)).bins.find(
      (b) => b.name === "5호관 남은 음료 수거함",
    )!;
    const marker = page.locator(
      '.pin[data-bin-ids~="' + target.id + '"]:not([inert])',
    );
    await marker.tap();
    if (await marker.getAttribute("data-group-size")) {
      await expect(page.getByLabel("가상 위치 선택")).toHaveValue("main");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: new RegExp(target.name) })
        .tap();
    }
    await expect(page.getByLabel("가상 위치 선택")).toHaveValue("five");
    await expect(svg).toHaveAttribute("viewBox", viewPicking!);
    await expect(page.getByRole("button", { name: "다음" })).toBeEnabled();
    await page.screenshot({
      path: info.outputPath("map-picked.png"),
      animations: "disabled",
    });
    await page.getByRole("button", { name: "건의 작성 취소" }).click();
    const dialog = page.getByRole("dialog");
    const resume = dialog.getByRole("button", { name: "계속 작성" });
    const discard = dialog.getByRole("button", {
      name: "작성 취소",
      exact: true,
    });
    await expect(discard).toBeVisible();
    await dialog.evaluate((el) =>
      Promise.allSettled(
        el.getAnimations().map((animation) => animation.finished),
      ),
    );
    const upper = (await resume.boundingBox())!;
    const lower = (await discard.boundingBox())!;
    expect(lower.y - (upper.y + upper.height)).toBe(12);
    expect(lower.x).toBe(upper.x);
    expect(lower.width).toBe(upper.width);
    expect(lower.height).toBe(upper.height);
    expect(lower.height).toBeGreaterThanOrEqual(44);
    await expect(discard).toHaveCSS(
      "border-radius",
      await resume.evaluate((button) => getComputedStyle(button).borderRadius),
    );
    await page.touchscreen.tap(upper.x + upper.width / 2, lower.y - 6);
    await expect(dialog).toBeVisible();
    await discard.tap();
    await page.setViewportSize({ width: 844, height: 390 });
    await page.getByRole("button", { name: "목록 펼치기" }).click();
    const handle = page.locator(".sheet-handle");
    await page.waitForFunction(() => {
      const el = document.querySelector<HTMLElement>(".map-overlays")!;
      return (
        Math.abs(
          document.querySelector(".station-sheet")!.getBoundingClientRect()
            .height - parseFloat(el.style.getPropertyValue("--sheet-height")),
        ) < 1
      );
    });
    // Safe-area overrides can leave less than one touch target between half
    // and maximum. An upward drag must then remain at the merged maximum.
    const distinctMaximum =
      (await handle.getAttribute("aria-label")) === "시트 최대로 펼치기";
    const h = (await handle.boundingBox())!;
    await touch("touchStart", [[h.x + 40, h.y + 25]]);
    await touch("touchMove", [[h.x + 40, Math.max(3, h.y - 95)]]);
    await touch("touchEnd", []);
    await expect(sheet).toHaveAttribute(
      "data-snap",
      distinctMaximum ? "expanded" : "half",
    );
    await expect(
      page.locator(".station-sheet .sheet-scroll"),
    ).not.toHaveAttribute("inert", "");
    await page.getByRole("button", { name: "시트 닫기" }).click();
    await page.setViewportSize({ width: 320, height: 568 });
    await page.getByRole("link", { name: "배출 안내" }).click();
    await page.addStyleTag({
      content: ".guide-grid strong, .mobile-dialog p {font-size: 2rem}",
    });
    for (const btn of await page.locator(".guide-grid button").all()) {
      await btn.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("button", { name: "닫기", exact: true }).click();
    }
  } finally {
    await context.close();
  }
});

test("관리자 분포 막대가 중간 너비를 거쳐 최신 개수에 도달한다", async ({
  page,
}) => {
  await login(page);
  const seed = await snap(page, true);
  const bin = seed.bins[0];
  let generation = 1;
  let value: number | null = 10;
  let empty = false;
  await page.route("**/api/admin/snapshot", (route) =>
    route.fulfill({
      json: {
        ...seed,
        version: seed.version + generation,
        bins: empty
          ? []
          : [{ ...bin, waste_types: ["general"], fills: { general: value } }],
      },
    }),
  );
  const refresh = () =>
    page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const segment = page.locator('.distribution i[data-level="가득 참"]');
  const counts = page.locator(".level-list b");
  await refresh();
  await expect(counts).toHaveText(["1", "0", "0", "0", "0"]);
  await expect(segment).toHaveCSS("flex-grow", "0");
  const frames = await segment.evaluateHandle((el) => {
    const grow: number[] = [];
    let frame = 0;
    const record = () => {
      grow.push(Number(getComputedStyle(el).flexGrow));
      frame = requestAnimationFrame(record);
    };
    record();
    return { grow, stop: () => cancelAnimationFrame(frame) };
  });
  value = 100;
  generation++;
  await refresh();
  await expect(counts).toHaveText(["0", "0", "0", "1", "0"]);
  await expect(segment).toHaveCSS("flex-grow", "1");
  expect(
    await frames.evaluate(({ grow }) => grow.some((n) => n > 0 && n < 1)),
  ).toBe(true);
  value = null;
  generation++;
  await refresh();
  await expect(counts).toHaveText(["0", "0", "0", "0", "1"]);
  empty = true;
  generation++;
  await refresh();
  await expect(counts).toHaveText(["0", "0", "0", "0", "0"]);
  await expect(segment).toHaveCSS("flex-grow", "0");
  await frames.evaluate((f) => f.stop());
  await page.emulateMedia({ reducedMotion: "reduce" });
  empty = false;
  value = 100;
  generation++;
  await refresh();
  await expect(counts).toHaveText(["0", "0", "0", "1", "0"]);
  await expect(segment).toHaveCSS("transition-property", "none");
  expect(await segment.evaluate((el) => el.getAnimations().length)).toBe(0);
  await expect(segment).toHaveCSS("flex-grow", "1");
});
