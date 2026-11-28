import { expect, test, type Page, type TestInfo } from "@playwright/test";

// Set KAKAO_SMOKE_URL to exercise a deployment which serves the real SDK.
// This scenario only reads data and uses the student navigation.
const liveURL = process.env.KAKAO_SMOKE_URL;
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

function tab(page: Page, path: string) {
  return page.locator(`.student-tabs a[href="${path}"]`);
}

async function checkReadingPage(page: Page, title: string, info: TestInfo) {
  const reading = page.locator(".mobile-reading");
  await expect(reading.getByRole("heading", { name: title })).toBeVisible();
  const map = page.locator(".student-map-view");
  await expect(map).toHaveJSProperty("inert", true);
  await expect(map).toHaveCSS("opacity", "0");
  await expect(map).toHaveCSS("pointer-events", "none");
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  // Check the final paint order, after the entry transform and opacity expire.
  await reading.evaluate(async (node) => {
    await document.fonts.ready;
    await Promise.allSettled(node.getAnimations().map((a) => a.finished));
  });
  const panel = page.locator(".student-page-view");
  expect(
    await panel.evaluate((node) => {
      const { left, top, width, height } = node.getBoundingClientRect();
      return [0.1, 0.5, 0.9].every((x) =>
        [0.1, 0.5, 0.9].every((y) =>
          node.contains(
            document.elementFromPoint(left + x * width, top + y * height),
          ),
        ),
      );
    }),
  ).toBe(true);
  // Pixel comparison also catches visible, pointer-transparent third-party tiles.
  const viewport = page.locator(".student-viewport");
  const pixels = await viewport.screenshot({ animations: "disabled" });
  const withoutMap = await viewport.screenshot({
    animations: "disabled",
    style: ".student-map-view { opacity: 0 !important; }",
  });
  expect(pixels.equals(withoutMap)).toBe(true);
  await info.attach(title, { body: pixels, contentType: "image/png" });
}

test("반복 탭 전환과 방문 기록 이동 후 활성 페이지만 그려진다", async ({
  page,
}, info) => {
  await page.goto(liveURL || "/");
  const provider = page.locator(liveURL ? ".kakao" : ".schematic");
  const pins = provider.locator('.pin:not([aria-hidden="true"])');
  await expect(pins.first()).toBeVisible();
  if (liveURL) {
    await expect(page.locator(".map-caption")).toHaveText("카카오맵");
    expect(await page.evaluate(() => typeof window.kakao.maps.Map)).toBe(
      "function",
    );
  } else {
    // Exercise SDK-style descendants even in offline CI.
    await page.locator(".kakao").evaluate((host) => {
      const tile = document.createElement("div");
      tile.style.cssText =
        "position:absolute;inset:0;visibility:visible;background:magenta;pointer-events:auto";
      host.append(tile);
    });
  }
  await page.getByRole("button", { name: "지도 확대" }).tap();
  const filter = page
    .locator(".quick-filters")
    .getByRole("button", { name: "일반쓰레기" });
  await filter.tap();
  await page.getByRole("searchbox").fill("수거");
  await page.getByRole("button", { name: "시트 닫기" }).tap();
  await expect.poll(() => pins.count()).toBeGreaterThanOrEqual(2);
  const host = await provider.elementHandle();
  // The spacing and position of two geographic points describe zoom and pan.
  const positions = () =>
    pins.evaluateAll((nodes) =>
      nodes
        .map((n) => {
          const box = n.getBoundingClientRect();
          return [
            n.getAttribute("aria-label"),
            Math.round(box.x),
            Math.round(box.y),
          ];
        })
        .sort(),
    );
  await expect(async () => {
    const previous = await positions();
    await page.waitForTimeout(150);
    expect(await positions()).toEqual(previous);
  }).toPass();
  const camera = await positions();

  for (let pass = 0; pass < 2; pass++) {
    await tab(page, "/requests").tap();
    await checkReadingPage(page, "내 설치 건의", info);
    await tab(page, "/guide").tap();
    await checkReadingPage(page, "분리배출 안내", info);
    await page.getByRole("button", { name: "종이", exact: true }).tap();
    await expect(page.getByRole("dialog")).toContainText("테이프");
    await page.keyboard.press("Escape");
    await tab(page, "/").tap();
    await expect(filter).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("searchbox")).toHaveValue("수거");
    await expect(page.locator(".student-page-view")).toBeHidden();
    expect(await host!.evaluate((n) => n.isConnected)).toBe(true);
    expect(await positions()).toEqual(camera);
  }

  await tab(page, "/requests").tap();
  await page.waitForURL("**/requests");
  await tab(page, "/guide").tap();
  await page.waitForURL("**/guide");
  await page.goBack();
  await checkReadingPage(page, "내 설치 건의", info);
  await page.goForward();
  await checkReadingPage(page, "분리배출 안내", info);
});
