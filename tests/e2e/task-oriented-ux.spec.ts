import { test, expect, type Page } from "@playwright/test";
import type { Snapshot } from "../../lib/model";
const base = process.env.KAKAO_SMOKE_URL;
const url = (path: string) => (base ? new URL(path, base).href : path);
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const tab = (page: Page, path: string) =>
  page.locator('.student-tabs a[href="' + path + '"]');
async function ready(page: Page) {
  await expect(
    page.locator(base ? ".kakao .pin" : ".schematic .pin").first(),
  ).toBeVisible();
}
test("좁은 가로 화면에서 검색하고 품목 조건만 해제한다", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 454, height: 312 });
  await page.goto(url("/"));
  await ready(page);
  const input = page.getByRole("searchbox"),
    trigger = page.getByRole("button", { name: "전체 품목 필터" });
  expect((await input.boundingBox())!.width).toBeGreaterThanOrEqual(76);
  await input.tap();
  await expect(input).toBeFocused();
  await input.fill("  음료  5호관 ");
  await expect(
    page.locator(".station-slot:not([inert])").first(),
  ).toContainText("5호관");
  await trigger.tap();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "유리", exact: true })
    .tap();
  await expect(page.locator(".sheet-label")).toContainText("유리");
  expect((await input.boundingBox())!.width).toBeGreaterThanOrEqual(65);
  const empty = page.locator(".empty-reveal");
  await empty.getByRole("button", { name: "품목 필터만 해제" }).tap();
  await expect(input).toHaveValue("  음료  5호관 ");
  await trigger.tap();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "남은 음료", exact: true })
    .tap();
  await input.fill("결과가 없는 검색");
  await empty.getByRole("button", { name: "검색어 지우기" }).tap();
  await expect(input).toHaveValue("");
  await expect(page.locator(".sheet-label")).toContainText("남은 음료");
  await page.getByRole("button", { name: "시트 닫기" }).tap();
  const fab = page.getByRole("button", { name: "추가 설치 건의" });
  expect((await fab.boundingBox())!.height).toBe(44);
  await info.attach("454 landscape", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});
test("안내에서 포화도 비교, 작성 이어가기와 위치 구역 표시까지 연결한다", async ({
  page,
}, info) => {
  await page.goto(url("/"));
  await ready(page);
  const seed: Snapshot = await (
    await page.request.get(url("/api/snapshot"))
  ).json();
  const mixed = seed.bins.find(
    (b) => b.waste_types.includes("liquid") && b.waste_types.length > 1,
  )!;
  const map = page.locator(".map-surface");
  const mapNode = await map.elementHandle();
  await page.getByRole("searchbox").fill("이전 조건");
  await tab(page, "/guide").tap();
  await page
    .locator(".guide-grid")
    .getByRole("button", { name: "남은 음료", exact: true })
    .tap();
  await page.getByRole("link", { name: "남은 음료 수거함 찾기" }).tap();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.locator(".sheet-label")).toContainText("남은 음료");
  const row = page.locator('[data-bin-id="' + mixed.id + '"]:not([inert])');
  await expect(row.locator(".fill-value")).toHaveText(
    mixed.fills.liquid == null ? "—" : mixed.fills.liquid + "%",
  );
  await info.attach("filtered stations", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await row.getByRole("button").tap();
  await expect(page.locator(".item-detail").first()).toContainText("남은 음료");
  await expect(page.locator(".item-detail")).toHaveCount(
    mixed.waste_types.length,
  );
  await page.getByRole("button", { name: "시트 닫기" }).tap();
  await page.getByRole("button", { name: "추가 설치 건의" }).tap();
  const select = page.getByLabel("가상 위치 선택");
  if (!base) await expect(page.locator(".basemap .zone")).toHaveCount(0);
  const polygons = base
    ? await page.evaluateHandle(() => {
        const observed: kakao.maps.Polygon[] = [];
        kakao.maps.Polygon = new Proxy(kakao.maps.Polygon, {
          construct(target, args) {
            const polygon = Reflect.construct(
              target,
              args,
            ) as kakao.maps.Polygon;
            observed.push(polygon);
            return polygon;
          },
        });
        return observed;
      })
    : null;
  const polygonCount = () =>
    polygons!.evaluate((list) => list.filter((p) => p.getMap()).length);
  await select.selectOption("five");
  if (polygons) await expect.poll(polygonCount).toBe(1);
  if (!base)
    await expect(page.locator('.basemap .zone[data-zone="five"]')).toHaveCount(
      1,
    );
  await select.selectOption("main");
  if (polygons) {
    await expect.poll(polygonCount).toBe(1);
    await expect
      .poll(() =>
        polygons.evaluate(
          (list) =>
            list.length > 1 && !list[0].getMap() && !!list.at(-1)?.getMap(),
        ),
      )
      .toBe(true);
  }
  if (!base)
    await expect(page.locator('.basemap .zone[data-zone="main"]')).toHaveCount(
      1,
    );
  await page.getByRole("button", { name: "다음", exact: true }).tap();
  if (polygons) await expect.poll(polygonCount).toBe(0);
  await expect(
    page.getByRole("button", { name: "남은 음료", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const h = (await page.locator(".wizard-sheet").boundingBox())!.height;
  expect(h).toBeLessThan(430);
  await info.attach("item selection", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await page.getByRole("button", { name: "다음", exact: true }).tap();
  await page
    .getByRole("button", { name: "음료를 비울 곳이 없어요.", exact: true })
    .tap();
  const reason = page.getByRole("textbox", { name: "건의 사유" });
  await reason.fill("부스 초안");
  await page
    .getByRole("button", { name: /주변에 수거함이 부족해요.*덧붙이기/ })
    .tap();
  await tab(page, "/guide").tap();
  await page
    .locator(".guide-grid")
    .getByRole("button", { name: "유리", exact: true })
    .tap();
  await page.getByRole("link", { name: "유리 수거함 찾기" }).tap();
  await expect(page.locator(".sheet-label")).toContainText("유리");
  await tab(page, "/requests").tap();
  await page.getByRole("link", { name: "작성 이어가기" }).tap();
  await expect(reason).toHaveValue("부스 초안 주변에 수거함이 부족해요.");
  expect(await mapNode!.evaluate((n) => n.isConnected)).toBe(true);
  await page.getByRole("button", { name: "건의 작성 취소" }).tap();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "작성 취소", exact: true })
    .tap();
  await tab(page, "/requests").tap();
  await page.getByRole("link", { name: "지도에서 건의하기" }).tap();
  await expect(select).toBeVisible();
  await expect(select).toHaveValue("");
});
test("설치된 정확한 ID 열기와 오래된 링크 복구", async ({ page }) => {
  const seed: Snapshot = await (
    await page.request.get(url("/api/snapshot"))
  ).json();
  const target = seed.bins[0];
  await page.goto(url("/?task=bin&id=" + target.id));
  await ready(page);
  await expect(page.locator(".sheet-label")).toHaveText(target.name);
  await expect(
    page.locator('.pin[data-selected-bin="' + target.id + '"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => new URL(page.url()).search).toBe("");
  await page.goto(url("/?task=bin&id=00000000-0000-4000-a000-000000000000"));
  await expect(page.getByRole("status")).toContainText(
    "거점을 확인할 수 없어요",
  );
  await expect(page.locator(".pin.chosen")).toHaveCount(0);
  await page.goto(url("/?task=filter&item=broken"));
  await expect(page.getByRole("status")).toContainText("확인할 수 없어요");
});

test("모바일과 두 데스크톱 크기의 같은 검색에서 동일한 거점을 찾는다", async ({
  page,
}) => {
  const ids: string[][] = [];
  for (const [width, height] of [
    [390, 844],
    [1280, 720],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(url("/"));
    await ready(page);
    await page.getByLabel("건물 및 수거함 검색").fill(" 음료  5호관 ");
    const rows = page.locator(".station-slot:not([inert])");
    await expect(rows.first()).toContainText("5호관");
    ids.push(
      await rows.evaluateAll((ns) =>
        ns.map((n) => n.getAttribute("data-bin-id")!),
      ),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(ids[1]).toEqual(ids[0]);
  expect(ids[2]).toEqual(ids[0]);
});

test("명시적인 설치 거점 링크가 화면 밖 거점을 기존 줌으로 보여준다", async ({
  page,
}) => {
  const snapshot: Snapshot = await (
    await page.request.get(url("/api/snapshot"))
  ).json();
  const target = snapshot.bins[0];
  await page.goto(url("/"));
  await ready(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const native = base
    ? await page.evaluateHandle(() => {
        const ref: { map?: kakao.maps.Map } = {};
        const proto = kakao.maps.Map.prototype,
          original = proto.getLevel;
        proto.getLevel = function () {
          proto.getLevel = original;
          ref.map = this;
          return original.call(this);
        };
        return ref;
      })
    : null;
  await page.getByRole("button", { name: "지도 확대", exact: true }).click();
  if (native) {
    await native.evaluate((ref) =>
      ref.map!.setCenter(new kakao.maps.LatLng(37.46, 126.67)),
    );
  } else {
    await page.mouse.move(150, 215);
    await page.mouse.down();
    await page.mouse.move(150, 610, { steps: 6 });
    await page.mouse.up();
  }
  const state = async () =>
    native
      ? native.evaluate((ref) => [
          ref.map!.getCenter().getLat(),
          ref.map!.getCenter().getLng(),
          ref.map!.getLevel(),
        ])
      : page
          .locator(".basemap")
          .evaluate((el) => el.getAttribute("viewBox")!.split(" ").map(Number));
  const away = await state();
  await page.evaluate(
    (id) => history.pushState(null, "", "/?task=bin&id=" + id),
    target.id,
  );
  await expect(page.locator(".sheet-label")).toHaveText(target.name);
  await expect.poll(async () => (await state())[0]).not.toBe(away[0]);
  expect((await state())[2]).toBe(away[2]);
  const pin = page.locator(".pin.chosen");
  await expect
    .poll(() =>
      pin.evaluate((el) => {
        const p = el.getBoundingClientRect(),
          space = document
            .querySelector(".map-tool-space")!
            .getBoundingClientRect();
        return (
          p.x + p.width / 2 >= space.left &&
          p.x + p.width / 2 <= space.right &&
          p.bottom >= space.top &&
          p.bottom <= space.bottom
        );
      }),
    )
    .toBe(true);
});
