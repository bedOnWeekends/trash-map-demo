import { expect, test, type Page } from "@playwright/test";
import type { Snapshot } from "../../lib/model";

const camera = (page: Page) => page.locator(".basemap").getAttribute("viewBox");
const rect = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => el.getBoundingClientRect().toJSON());

test("콘텐츠 높이, 중복 스냅 통합, 드래그 중 화면 및 카메라 보존", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const model: Snapshot = await (
    await page.request.get("/api/snapshot")
  ).json();
  // Isolate the growing list from all writers, including other booth visitors.
  const bins = Array.from({ length: 32 }, (_, i) => ({
    ...model.bins[i % model.bins.length],
    id: "fixture-" + i,
    name: `거점${i} ${i === 0 ? "단일 " : ""}${i < 3 ? "세곳 " : ""}${i < 9 ? "아홉곳" : ""}`,
  }));
  await page.route("**/api/snapshot", (route) =>
    route.fulfill({ json: { ...model, bins } }),
  );
  await page.goto("/");
  const sheet = page.locator(".station-sheet"),
    handle = sheet.locator(".sheet-handle");
  await expect(sheet.locator(".station")).toHaveCount(32);
  await expect(handle).toHaveAccessibleName("목록 펼치기");
  const stage = await rect(page, ".map-surface"),
    before = await camera(page);
  const mark = await rect(page, ".pin-anchor");
  async function startDrag(distance: number) {
    const h = await rect(page, ".sheet-handle"),
      x = h.x + 40,
      y = h.y + h.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - distance, { steps: 5 });
    await expect(sheet).toHaveAttribute("data-state", "dragging");
  }
  for (const cancelEvent of ["pointercancel", "lostpointercapture"] as const) {
    await startDrag(150);
    const p = await rect(page, ".station-sheet"),
      top = await rect(page, ".sheet-handle");
    expect(Math.abs(top.y - p.y)).toBeLessThanOrEqual(3);
    expect((await rect(page, ".sheet-scroll")).height).toBeGreaterThan(75);
    await expect(sheet.locator(".station").first()).toBeInViewport();
    expect(await rect(page, ".map-surface")).toEqual(stage);
    expect(await rect(page, ".pin-anchor")).toEqual(mark);
    expect(await camera(page)).toBe(before);
    await handle.dispatchEvent(cancelEvent, { pointerId: 1, bubbles: true });
    await page.mouse.up();
    await expect(sheet).toHaveAttribute("data-state", "peek");
  }
  await startDrag(260);
  await page.mouse.up();
  await expect(sheet).toHaveAttribute("data-state", "half");
  await startDrag(250);
  await page.mouse.up();
  await expect(sheet).toHaveAttribute("data-state", "expanded");
  await startDrag(-560);
  await page.mouse.up();
  await expect(sheet).toHaveAttribute("data-state", "peek");
  const input = page.getByRole("searchbox");
  const unfocused = await rect(page, ".map-search-field");
  await input.focus();
  expect(await rect(page, ".map-search-field")).toEqual(unfocused);
  await expect(input).toHaveCSS("outline-style", "none");
  await expect(page.locator(".map-search-field")).toHaveCSS(
    "border-top-color",
    "rgb(0, 91, 172)",
  );
  const heights: number[] = [];
  for (const [query, count] of [
    ["없는곳", 0],
    ["단일", 1],
    ["세곳", 3],
    ["아홉곳", 9],
    ["", 32],
  ] as const) {
    await input.fill(query);
    await expect(sheet.locator(".station")).toHaveCount(count);
    await expect(sheet).toHaveAttribute("data-state", "half");
    if (count < 4) {
      await expect(handle).toHaveAccessibleName("목록 접기");
      expect(
        await sheet
          .locator(".sheet-scroll")
          .evaluate((e) => e.scrollHeight - e.clientHeight),
      ).toBeLessThanOrEqual(2);
    } else {
      await expect(handle).toHaveAccessibleName("시트 최대로 펼치기");
    }
    heights.push((await rect(page, ".station-sheet")).height);
    expect(await camera(page)).toBe(before);
  }
  expect(heights[1]).toBeLessThan(210);
  expect(heights[2]).toBeGreaterThan(heights[1]);
  await handle.click();
  await expect(sheet).toHaveAttribute("data-state", "expanded");
  await sheet.locator(".station").last().scrollIntoViewIfNeeded();
  expect(
    await sheet.locator(".sheet-scroll").evaluate((el) => el.scrollTop),
  ).toBeGreaterThan(200);
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test("스냅마다 검색·지도 버튼·저작권·탭이 서로 겹치지 않는다", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height] of [
    [320, 568],
    [360, 640],
    [375, 667],
    [390, 844],
    [412, 915],
    [430, 932],
    [454, 312],
    [667, 375],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const handle = page.locator(".sheet-handle");
    await expect(handle).toHaveAccessibleName("목록 펼치기");
    await expect(page.locator(".station").first()).toBeAttached();
    const initial = await camera(page);
    // At 312px high the half and maximum heights differ by under one touch
    // target. The sheet intentionally combines them and next returns to peek.
    const cycle =
      height === 312 ? ["peek", "half", "peek"] : ["peek", "half", "expanded"];
    for (const [index, state] of cycle.entries()) {
      if (index) await handle.click();
      await expect(page.locator(".station-sheet")).toHaveAttribute(
        "data-state",
        state,
      );
      expect(await camera(page)).toBe(initial);
      const overlaps = await page.evaluate(() => {
        const targets = [
          ".map-search-field",
          ".quick-filters",
          ".map-controls",
          ".proposal-fab",
          ".station-sheet",
          ".student-tabs",
          ".map-credit",
        ];
        const visible = targets
          .map((s) => [s, document.querySelector<HTMLElement>(s)] as const)
          .filter(
            (p): p is [string, HTMLElement] =>
              !!p[1] && p[1].checkVisibility({ visibilityProperty: true }),
          );
        const collisions: string[] = [];
        for (const [i, [a, el]] of visible.entries()) {
          const x = el.getBoundingClientRect();
          for (const [b, other] of visible.slice(i + 1)) {
            const y = other.getBoundingClientRect();
            if (
              Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 &&
              Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1
            )
              collisions.push(a + " / " + b);
          }
        }
        return collisions;
      });
      expect(overlaps, width + "×" + height + " " + state).toEqual([]);
      const credit = page.locator(".map-credit a");
      await expect(credit).toBeInViewport({ ratio: 1 });
      if (state === "peek" && width > height) {
        const overlaps = await page
          .locator(".map-label")
          .evaluateAll((labels) => {
            const bounds = labels.map((el) => el.getBoundingClientRect());
            return bounds.some((a, i) =>
              bounds
                .slice(i + 1)
                .some(
                  (b) =>
                    a.left < b.right &&
                    b.left < a.right &&
                    a.top < b.bottom &&
                    b.top < a.bottom,
                ),
            );
          });
        expect(overlaps).toBe(false);
      }
      if (
        state === "peek" &&
        (await page.locator(".quick-filters").isVisible())
      ) {
        expect((await rect(page, ".chip-pill")).height).toBe(32);
        expect(
          (await rect(page, ".quick-filters button")).height,
        ).toBeGreaterThanOrEqual(44);
      }
    }
  }
});

test("명시적으로 고른 화면 밖 거점과 건물만 줌을 유지하며 보여준다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".pin").first()).toBeVisible();
  const current = await camera(page);
  await page.mouse.move(150, 215);
  await page.mouse.down();
  await page.mouse.move(150, 598, { steps: 6 });
  await page.mouse.up();
  const away = await camera(page);
  expect(away).not.toBe(current);
  await page.getByRole("button", { name: "목록 펼치기" }).click();
  expect(await camera(page)).toBe(away);
  await page.locator(".station").first().click();
  await expect.poll(() => camera(page)).not.toEqual(away);
  const revealed = await camera(page);
  expect(revealed!.split(" ").slice(2)).toEqual(away!.split(" ").slice(2));
  await page.getByRole("button", { name: "추가 설치 건의" }).click();
  await page.mouse.move(150, 215);
  await page.mouse.down();
  await page.mouse.move(150, 515, { steps: 6 });
  await page.mouse.up();
  const panned = await camera(page);
  await page.getByLabel("가상 위치 선택").selectOption("main");
  await expect.poll(() => camera(page)).not.toEqual(panned);
  expect((await camera(page))!.split(" ").slice(2)).toEqual(
    panned!.split(" ").slice(2),
  );
});

test("검색 중 Visual Viewport가 줄어들고 복원되어도 입력과 지도 출처가 보인다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const field = page.getByRole("searchbox");
  await field.fill("본관");
  async function resizeKeyboard(height: number) {
    await page.evaluate((h) => {
      const v = window.visualViewport!;
      Object.defineProperty(v, "height", { configurable: true, value: h });
      v.dispatchEvent(new Event("resize"));
    }, height);
  }
  await resizeKeyboard(415);
  await expect(page.locator(".student-app")).toHaveAttribute(
    "data-keyboard",
    "",
  );
  await expect(field).toBeFocused();
  await expect(page.locator(".student-tabs")).toBeHidden();
  expect((await rect(page, ".map-credit")).bottom).toBeLessThanOrEqual(415);
  expect((await rect(page, ".map-search-field")).bottom).toBeLessThan(
    (await rect(page, ".station-sheet")).top,
  );
  await resizeKeyboard(844);
  await expect(page.locator(".student-tabs")).toBeVisible();
  await expect(field).toHaveValue("본관");
});
