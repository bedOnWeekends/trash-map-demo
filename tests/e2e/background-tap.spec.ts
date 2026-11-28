import { expect, test, type Page } from "@playwright/test";
import type { Snapshot } from "../../lib/model";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

async function openMap(page: Page) {
  const model: Snapshot = await (
    await page.request.get("/api/snapshot")
  ).json();
  const bins = ["five", "anniversary", "main"].map((zone, i) => ({
    ...model.bins.find((b) => b.zone_id === zone)!,
    name: "교내 수거함 " + (i + 1),
    waste_types: i === 2 ? ["glass"] : ["liquid"],
  }));
  await page.route("**/api/snapshot", (route) =>
    route.fulfill({ json: { ...model, bins } }),
  );
  await page.goto("/");
  await expect(page.locator(".pin")).toHaveCount(3);
}

test("거점 전환과 배경 탭은 검색·필터·카메라를 보존한다", async ({ page }) => {
  await openMap(page);
  await page.getByRole("searchbox").fill("교내");
  await page.getByRole("button", { name: "남은 음료", exact: true }).tap();
  await expect(page.locator(".pin")).toHaveCount(2);
  await page.getByRole("button", { name: "시트 닫기" }).tap();
  const sheet = page.locator(".station-sheet"),
    first = page.getByRole("button", { name: "교내 수거함 1", exact: true }),
    second = page.getByRole("button", { name: "교내 수거함 2", exact: true });
  const map = page.locator(".basemap"),
    camera = await map.getAttribute("viewBox");
  await first.tap();
  await expect(sheet).toHaveAttribute("aria-label", "거점 상세");
  const r = (await map.boundingBox())!;
  // A pin must also win against a single background tap awaiting classification.
  await page.touchscreen.tap(r.x + 12, r.y + 15);
  await second.tap();
  await page.waitForTimeout(450);
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.locator(".sheet-label")).toContainText("교내 수거함 2");
  await page.touchscreen.tap(r.x + 12, r.y + 15);
  await expect(sheet).toHaveAttribute("data-state", "peek");
  await expect(sheet).toHaveAttribute("aria-label", "수거 거점 목록");
  await expect(page.locator(".pin[aria-pressed=true]")).toHaveCount(0);
  await expect(page.getByRole("searchbox")).toHaveValue("교내");
  await expect(page.locator(".quick-filters [aria-pressed=true]")).toHaveText(
    "남은 음료",
  );
  await expect(page.locator(".station")).toHaveCount(2);
  await expect(map).toHaveAttribute("viewBox", camera!);
});

test("드래그·핀치·더블 탭·지도 버튼은 선택된 거점을 닫지 않는다", async ({
  page,
  context,
}) => {
  await openMap(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const pin = page.getByRole("button", { name: "교내 수거함 1", exact: true });
  await pin.tap();
  const map = page.locator(".basemap"),
    sheet = page.locator(".station-sheet");
  const box = (await map.boundingBox())!,
    x = box.x + 55,
    y = box.y + 60;
  const cdp = await context.newCDPSession(page);
  async function touch(
    type: "touchStart" | "touchMove" | "touchEnd",
    coords: number[][],
  ) {
    await cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: coords.map(([x, y], id) => ({ x, y, id })),
    });
  }
  async function checkGesture(action: () => Promise<void>) {
    const camera = await map.getAttribute("viewBox");
    await action();
    await expect.poll(() => map.getAttribute("viewBox")).not.toEqual(camera);
    // Observe the settled selection after the single/double-tap window.
    await page.waitForTimeout(450);
    await expect(pin).toHaveAttribute("aria-pressed", "true");
    await expect(sheet).toHaveAttribute("aria-label", "거점 상세");
  }
  await checkGesture(async () => {
    await touch("touchStart", [[x, y]]);
    await touch("touchMove", [[x + 40, y + 15]]);
    await touch("touchEnd", []);
  });
  await checkGesture(async () => {
    await touch("touchStart", [
      [x, y],
      [x + 70, y],
    ]);
    await touch("touchMove", [
      [x - 15, y],
      [x + 95, y],
    ]);
    await touch("touchEnd", []);
  });
  await checkGesture(async () => {
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x + 1, y);
  });
  await checkGesture(() =>
    page.getByRole("button", { name: "지도 축소", exact: true }).tap(),
  );
});

test("데스크톱 목록의 길이가 바뀌어도 배경 클릭 전후 지도 크기와 카메라는 같다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1320, height: 900 });
  await page.goto("/");
  const map = page.locator(".basemap");
  await page.locator(".pin").first().click();
  await expect(page.locator(".item-detail").first()).toBeVisible();
  const box = (await map.boundingBox())!,
    before = await map.getAttribute("viewBox");
  await page.mouse.click(box.x + box.width / 2, box.y + 16);
  await expect(page.locator(".station").first()).toBeVisible();
  await expect(page.locator(".pin.chosen")).toHaveCount(0);
  expect(await map.boundingBox()).toEqual(box);
  await expect(map).toHaveAttribute("viewBox", before!);
});
