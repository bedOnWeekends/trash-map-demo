import { expect, test, type Page } from "@playwright/test";
import type { Snapshot, Waste } from "../../lib/model";

test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const live = process.env.KAKAO_SMOKE_URL;
function sortedIds(bins: Snapshot["bins"], item: Waste | null) {
  const state = (n: number | null | undefined) =>
    n == null ? 4 : n < 50 ? 0 : n < 80 ? 1 : n < 100 ? 2 : 3;
  return bins
    .filter((b) => !item || b.waste_types.includes(item))
    .sort((a, b) => (item ? state(a.fills[item]) - state(b.fills[item]) : 0))
    .map((b) => b.id);
}
async function prepare(page: Page) {
  const snapshot: Snapshot = await (
    await page.request.get(
      live ? new URL("/api/snapshot", live).href : "/api/snapshot",
    )
  ).json();
  if (!live) {
    const waste: Waste[] = [
      "general",
      "plastic",
      "liquid",
      "plastic",
      "general",
      "liquid",
      "plastic",
      "liquid",
    ];
    snapshot.bins = snapshot.bins
      .slice(0, 8)
      .map((b, i) => ({ ...b, waste_types: [waste[i]] }));
    await page.route("**/api/snapshot", (route) =>
      route.fulfill({ json: snapshot }),
    );
  }
  await page.goto(live || "/");
  await expect(
    page.locator(live ? ".kakao .pin" : ".schematic .pin").first(),
  ).toBeVisible();
  return snapshot.bins;
}

async function recordFilter(page: Page, apply: () => Promise<void>) {
  const settled = () =>
    page.waitForFunction(() => {
      const layer = document.querySelector<HTMLElement>(".map-overlays")!;
      const goal = parseFloat(layer.style.getPropertyValue("--sheet-height"));
      return (
        Math.abs(
          document.querySelector(".station-sheet")!.getBoundingClientRect()
            .height - goal,
        ) < 1 && !layer.getAnimations().some((a) => a.playState === "running")
      );
    });
  await settled();
  const result = await page.evaluateHandle(() => {
    type Frame = {
      height: number;
      target: string;
      badPaint: boolean;
      exitsInteractive: boolean;
      stage: number[];
    };
    const frames: Frame[] = [];
    const sheet = document.querySelector<HTMLElement>(".station-sheet")!;
    const viewport = document.querySelector<HTMLElement>(".sheet-scroll")!;
    const layer = document.querySelector<HTMLElement>(".map-overlays")!;
    const surface = document.querySelector<HTMLElement>(".map-surface")!;
    let raf = 0;
    function sample() {
      const scroll = viewport.getBoundingClientRect();
      const rows = [...sheet.querySelectorAll<HTMLElement>(".station-slot")];
      const titles = rows.map((row) => {
        const r = row.querySelector("strong")!.getBoundingClientRect(),
          slot = row.getBoundingClientRect();
        return {
          top: Math.max(scroll.top, r.top, slot.top),
          bottom: Math.min(scroll.bottom, r.bottom, slot.bottom),
          row,
        };
      });
      const badPaint = titles.some((a, i) =>
        titles.slice(i + 1).some((b) => {
          if (Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) < 2)
            return false;
          // An opaque live slot paints over its departing sibling. Two live labels
          // occupying the same pixels, or a transparent cover, are a regression.
          const front = a.row.inert ? b.row : a.row;
          return (
            (!a.row.inert && !b.row.inert) ||
            getComputedStyle(front).backgroundColor === "rgba(0, 0, 0, 0)"
          );
        }),
      );
      const rect = surface.getBoundingClientRect();
      frames.push({
        height: sheet.getBoundingClientRect().height,
        target: layer.style.getPropertyValue("--sheet-height"),
        badPaint,
        exitsInteractive: rows.some(
          (row) =>
            row.inert &&
            (getComputedStyle(row).pointerEvents !== "none" ||
              row.getAttribute("aria-hidden") !== "true"),
        ),
        stage: [rect.x, rect.y, rect.width, rect.height],
      });
      raf = requestAnimationFrame(sample);
    }
    raf = requestAnimationFrame(sample);
    return { frames, stop: () => cancelAnimationFrame(raf) };
  });
  await apply();
  await expect
    .poll(() => result.evaluate((f) => f.frames.length))
    .toBeGreaterThan(4);
  await page.waitForFunction(
    () =>
      !document.querySelector(".stations [inert]") &&
      !document
        .querySelector(".map-overlays")!
        .getAnimations()
        .some((a) => a.playState === "running"),
  );
  await settled();
  const frames = await result.evaluate(({ frames, stop }) => {
    stop();
    return frames;
  });
  await result.dispose();
  expect(frames.some((f) => f.badPaint || f.exitsInteractive)).toBe(false);
  expect(new Set(frames.map((f) => f.stage.join(","))).size).toBe(1);
  return frames;
}

test("필터 중간 프레임과 최신 거점·시트·지도 상태가 일치한다", async ({
  page,
}, info) => {
  const bins = await prepare(page);
  const quick = page.locator(".quick-filters"),
    sheet = page.locator(".station-sheet"),
    handle = sheet.locator(".sheet-handle");
  const toggle = (name: string) =>
    quick.getByRole("button", { name, exact: true }).tap();
  const ids = () =>
    sheet
      .locator(".station-slot:not([inert])")
      .evaluateAll((nodes) =>
        nodes.map((el) => el.getAttribute("data-bin-id")),
      );
  const camera = await page
    .locator(".basemap")
    .getAttribute("viewBox", { timeout: 500 })
    .catch(() => null);
  await toggle("일반쓰레기");
  await expect(sheet).toHaveAttribute("data-state", "half");
  await toggle("전체");
  const history = [];
  for (const [item, label] of [
    ["general", "일반쓰레기"],
    [null, "전체"],
    ["plastic", "플라스틱·PET"],
    [null, "전체"],
    ["liquid", "남은 음료"],
  ] as const) {
    const frames = await recordFilter(page, () => toggle(label));
    history.push({ item, frames });
    const expected = sortedIds(bins, item);
    await expect.poll(ids).toEqual(expected);
    await expect(sheet.locator(".sheet-label .visually-hidden")).toHaveText(
      String(expected.length),
    );
    expect(new Set(frames.map((f) => f.target)).size).toBeLessThanOrEqual(2);
    const heights = frames.map((f) => f.height);
    // A single selection may retarget from the old value once. A settled
    // expansion/shrink must not reverse direction inside that transition.
    const dir = Math.sign(heights.at(-1)! - heights[0]);
    expect(
      heights.every((v, i) => !i || (v - heights[i - 1]) * dir >= -1),
      JSON.stringify({ item, heights }),
    ).toBe(true);
    await expect(sheet.locator("[inert].station-slot")).toHaveCount(0);
  }
  await info.attach("filter-frames.json", {
    body: JSON.stringify(history),
    contentType: "application/json",
  });
  await toggle("전체");
  await toggle("남은 음료");
  await toggle("플라스틱·PET");
  await expect.poll(ids).toEqual(sortedIds(bins, "plastic"));
  await toggle("전체");
  await expect(handle).toHaveAccessibleName("시트 최대로 펼치기");
  await handle.tap();
  await expect(sheet).toHaveAttribute("data-state", "expanded");
  const trigger = page.getByRole("button", { name: "전체 품목 필터" });
  await trigger.tap();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "유리", exact: true }).tap();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect.poll(ids).toEqual(sortedIds(bins, "glass"));
  await page.getByRole("searchbox").fill("일치하지 않는 장소");
  await expect(sheet.locator(".empty-reveal")).toBeVisible();
  await sheet.getByRole("button", { name: "검색·필터 초기화" }).tap();
  await expect.poll(ids).toEqual(bins.map((b) => b.id));
  await expect(sheet).toHaveAttribute("data-state", "expanded");
  if (camera)
    expect(await page.locator(".basemap").getAttribute("viewBox")).toBe(camera);
  await handle.tap();
  await expect(sheet).toHaveAttribute("data-state", "peek");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await toggle("일반쓰레기");
  await expect(sheet.locator(".station-slot[inert]")).toHaveCount(0);
  expect(
    await sheet
      .locator(".station")
      .evaluateAll(
        (nodes) =>
          nodes
            .flatMap((n) => n.getAnimations())
            .filter((a) => a.playState === "running").length,
      ),
  ).toBe(0);
});

test("누름 표면과 실제 터치 영역이 독립적이다", async ({ page }) => {
  await prepare(page);
  for (const [selector, face] of [
    [".filter-trigger", ".press-face"],
    [".proposal-fab", ".press-face"],
    [".quick-filters button", ".chip-pill"],
  ]) {
    const target = page.locator(selector).first(),
      visual = target.locator(face),
      bounds = await target.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await page.mouse.move(
      bounds!.x + bounds!.width / 2,
      bounds!.y + bounds!.height / 2,
    );
    await page.mouse.down();
    await expect(visual).toHaveCSS("scale", "0.97");
    expect(await target.boundingBox()).toEqual(bounds);
    await page.mouse.move(1, 1);
    await page.mouse.up();
    await expect(visual).toHaveCSS("scale", "none");
  }
});

test("드래그와 필터를 이어서 사용해도 최신 결과와 시트가 남는다", async ({
  page,
}) => {
  const bins = await prepare(page);
  const sheet = page.locator(".station-sheet");
  const handle = sheet.locator(".sheet-handle");
  const filters = page.locator(".quick-filters");
  const stage = await page.locator(".map-surface").boundingBox();
  // Finish the user's upward drag, then change the filter before the snap settles.
  const pos = (await handle.boundingBox())!;
  const x = pos.x + 40,
    y = pos.y + pos.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 220, { steps: 5 });
  await expect(sheet).toHaveAttribute("data-state", "dragging");
  await page.mouse.up();
  await filters.getByRole("button", { name: "플라스틱·PET" }).tap();
  await expect(sheet).toHaveAttribute("data-state", "half");
  // A second filter can reverse the content change before the next drag.
  await filters.getByRole("button", { name: "전체", exact: true }).tap();
  await handle.hover();
  const current = (await handle.boundingBox())!;
  await page.mouse.move(current.x + 40, current.y + 20);
  await page.mouse.down();
  await page.mouse.move(current.x + 40, current.y + 180, { steps: 6 });
  await expect(sheet).toHaveAttribute("data-state", "dragging");
  await page.mouse.up();
  await expect(sheet).toHaveAttribute("data-state", "peek");
  await expect(
    filters.getByRole("button", { name: "전체", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.locator(".station-slot:not([inert])")).toHaveCount(
    bins.length,
  );
  expect(await page.locator(".map-surface").boundingBox()).toEqual(stage);
});
