import { test, expect, type Page } from "@playwright/test";
import type { Snapshot, Bin } from "../../lib/model";
const live = process.env.KAKAO_SMOKE_URL;
const url = (p: string) => (live ? new URL(p, live).href : p);
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
async function setup(page: Page) {
  const s: Snapshot = await (
    await page.request.get(url("/api/snapshot"))
  ).json();
  const first = s.bins.find(
    (b) => b.zone_id === "five" && b.waste_types.includes("liquid"),
  )!;
  const student = s.bins.find((b) => b.zone_id === "student")!;
  const full: Bin = {
    ...first,
    name: "원래 음료 거점",
    waste_types: ["liquid"],
    fills: { liquid: 100 },
  };
  const other: Bin = {
    ...full,
    id: "00000000-0000-4000-8000-000000000222",
    name: "5호관 종합 수거함",
    lng: full.lng + 0.000085,
    waste_types: ["plastic", "liquid"],
    fills: { plastic: 95, liquid: 0 },
  };
  const same: Bin = {
    ...other,
    id: "00000000-0000-4000-8000-000000000333",
    name: "5호관 유리 수거함",
    waste_types: ["glass"],
    fills: { glass: 23 },
  };
  const far: Bin = {
    ...student,
    name: "학생회관 음료",
    waste_types: ["liquid"],
    fills: { liquid: 44 },
  };
  s.bins = [full, other, same, far];
  s.requests = [];
  await page.route("**/api/snapshot", (r) => r.fulfill({ json: s }));
  await page.goto(url("/"));
  await expect(
    page.locator(live ? ".kakao .pin" : ".schematic .pin").first(),
  ).toBeVisible();
  return { s, full, other, far };
}
async function settledScreenshot(page: Page) {
  // Let Motion commit the first animation frame before collecting its active effects.
  await page.waitForTimeout(400);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  return page.screenshot();
}
async function camera(page: Page) {
  if (!live)
    return { state: () => page.locator(".basemap").getAttribute("viewBox") };
  const probe = await page.evaluateHandle(() => {
    const ref: { map?: kakao.maps.Map } = {};
    const proto = kakao.maps.Map.prototype,
      original = proto.getLevel;
    proto.getLevel = function () {
      proto.getLevel = original;
      ref.map = this;
      return original.call(this);
    };
    return ref;
  });
  await page.getByRole("button", { name: "지도 확대", exact: true }).click();
  await expect.poll(() => probe.evaluate((r) => !!r.map)).toBe(true);
  await page.waitForTimeout(450);
  return {
    state: () =>
      probe.evaluate((r) => {
        const m = r.map!,
          c = m.getCenter();
        return [c.getLat(), c.getLng(), m.getLevel()].join(" ");
      }),
  };
}
test("실제 좌표의 그룹에서 각 거점을 열고 같은 시트에서 여유 대안을 선택한다", async ({
  page,
}, info) => {
  const { s, full, other, far } = await setup(page);
  const cam = await camera(page);
  await page.getByRole("searchbox").fill("5호관 음료");
  const list = page.locator(".station-sheet .station-slot:not([inert])");
  await expect(list.first()).toContainText(other.name);
  await expect(list.first()).toContainText("0%");
  const group = page.locator('.pin[data-group-size="2"]:not([inert])');
  await expect(group).toBeVisible();
  const before = await cam.state();
  await group.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("5호관 수거 거점 2곳");
  await expect(
    dialog.getByRole("button", { name: new RegExp(other.name) }),
  ).toContainText("0%");
  await info.attach("group", {
    body: await settledScreenshot(page),
    contentType: "image/png",
  });
  await dialog.getByRole("button", { name: new RegExp(full.name) }).click();
  await expect(page.locator(".sheet-label")).toHaveText(full.name);
  expect(await cam.state()).toBe(before);
  await expect(group).toHaveAttribute("data-selected-bin", full.id);
  const sheet = page.locator(".station-sheet");
  const node = await sheet.elementHandle();
  const alt = page.getByRole("region", { name: "남은 음료 대안" });
  await expect(alt.getByRole("button").first()).toContainText(other.name);
  await info.attach("alternatives", {
    body: await settledScreenshot(page),
    contentType: "image/png",
  });
  await alt.getByRole("button", { name: new RegExp(far.name) }).click();
  await expect(page.locator(".sheet-label")).toHaveText(far.name);
  await expect(page.locator(".item-detail").first()).toContainText("남은 음료");
  expect(
    await node!.evaluate(
      (el) => el === document.querySelector(".station-sheet"),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "시트 닫기" }).click();
  await page.getByRole("searchbox").fill("5호관 음료");
  await expect(list.first()).toContainText(other.name);
  // The explicitly selected alternative may still be panning. Start the
  // sensor-only comparison after that independent camera operation has ended.
  await expect(async () => {
    const position = await cam.state();
    await page.waitForTimeout(180);
    expect(await cam.state()).toBe(position);
  }).toPass({ timeout: 5000 });
  const exploring = await cam.state();
  full.fills.liquid = 0;
  other.fills.liquid = 100;
  s.version++;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(list.first()).toContainText("100%");
  await expect(list.first()).toContainText(other.name);
  expect(await cam.state()).toBe(exploring);
  await page.getByRole("searchbox").fill("음료 5호관");
  await expect(list.first()).toContainText(full.name);
});
test("검색 별칭과 커피 선택은 장소를 유지하며 컵은 재질 안내로 이동한다", async ({
  page,
}) => {
  await setup(page);
  const input = page.getByRole("searchbox");
  await input.fill("5호관 생수병");
  await expect(
    page.locator(".station-sheet .station-slot:not([inert])"),
  ).toHaveCount(1);
  await expect(page.locator(".station-reading")).toContainText(
    "플라스틱·PET 포화도",
  );
  await expect(page.locator(".quick-filters button").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await input.fill("5호관 커피");
  await page.getByRole("button", { name: "남은 커피·음료" }).click();
  await expect(input).toHaveValue("5호관 음료");
  await expect(page.locator(".sheet-label")).toContainText("남은 음료");
  await input.fill("커피");
  await page.getByRole("link", { name: "빈 컵 재질별 배출 안내" }).click();
  await expect(page.locator(".guide-grid")).toBeVisible();
});
test("가로 결과의 첫 행과 마지막 유효 위치를 유지한다", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await setup(page);
  const input = page.getByRole("searchbox");
  await input.fill("음료");
  const row = page.locator(".station-slot:not([inert]) .station").first();
  await expect
    .poll(() =>
      row.evaluate((el) => {
        const q = el.getBoundingClientRect(),
          v = el.closest(".sheet-scroll")!.getBoundingClientRect();
        return q.bottom <= v.bottom + 1 && q.top >= v.top - 1;
      }),
    )
    .toBe(true);
  await info.attach("landscape", {
    body: await settledScreenshot(page),
    contentType: "image/png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "시트 닫기" }).click();
  await page.getByRole("button", { name: "추가 설치 건의" }).click();
  await page.getByLabel("가상 위치 선택").selectOption("five");
  await expect(page.getByText("위치 선택됨", { exact: true })).toBeVisible();
  const restored = () =>
    page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem("booth-student-request")!).draft
          .point,
    );
  const candidate = page.locator(".pin.kind-candidate");
  await expect(candidate).toBeInViewport({ ratio: 1 });
  const saved = await restored();
  // This visible map corner is outside the surveyed campus in the overview.
  await page.touchscreen.tap(8, 85);
  await expect(page.locator(".wizard-feedback")).toContainText("관리 구역");
  expect(await restored()).toEqual(saved);
  await expect(
    page.getByRole("button", { name: "다음", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".pin.kind-candidate")).toHaveCount(1);
  await page.getByLabel("가상 위치 선택").selectOption("main");
  await expect(page.locator(".wizard-feedback")).toHaveCount(0);
});
test("데스크톱 작성 중 목록 이동과 카메라 Reveal", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const { other } = await setup(page);
  await page
    .getByRole("button", { name: "추가 설치 건의", exact: true })
    .click();
  await page.getByLabel("가상 위치 선택").selectOption("five");
  await page.getByRole("button", { name: "종이", exact: true }).click();
  await page.getByLabel("건의 사유").fill("학생회 행사 뒤 종이가 많이 나와요");
  await page.getByRole("button", { name: "거점 목록", exact: true }).click();
  await page.getByLabel("건물 및 수거함 검색").fill("페트병");
  const map = page.locator(".map-surface");
  const bounds = (await map.boundingBox())!;
  const cam = await camera(page);
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width + 280,
    bounds.y + bounds.height / 2,
    { steps: 18 },
  );
  await page.mouse.up();
  await page.waitForTimeout(500);
  const away = await cam.state();
  await page.locator(".station-slot:not([inert]) .station").first().click();
  await expect(page.getByRole("heading", { name: other.name })).toBeVisible();
  await expect.poll(cam.state).not.toBe(away);
  expect((await cam.state())!.split(" ")[2]).toBe(away!.split(" ")[2]);
  await page
    .getByRole("button", { name: "작성 이어가기", exact: true })
    .click();
  await expect(page.getByLabel("가상 위치 선택")).toHaveValue("five");
  await expect(page.getByLabel("건의 사유")).toHaveValue(
    "학생회 행사 뒤 종이가 많이 나와요",
  );
  await page.reload();
  await expect(page.getByLabel("건의 사유")).toHaveValue(
    "학생회 행사 뒤 종이가 많이 나와요",
  );
  await page.getByRole("button", { name: "작성 취소", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "작성 취소", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "추가 설치 건의", exact: true }),
  ).toBeVisible();
});

test("화면 축척이 바뀌면 세 거점 중 겹치지 않는 핀만 분리된다", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { s, full, other } = await setup(page);
  const input = page.getByRole("searchbox");
  const marker = (id: string) =>
    page.locator('.pin[data-bin-ids~="' + id + '"]:not([inert])');
  async function anchor(name: string, id: string) {
    await input.fill(name);
    const target = marker(id);
    await expect(target).not.toHaveAttribute("data-group-size", /.+/);
    return target.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.x + r.width / 2;
    });
  }
  if (live) {
    // Use the real SDK inverse projection so the test geometry is independent
    // of the overview level and transient CSS entrance transforms.
    const observed = await page.evaluateHandle(() => {
      const ref: { map?: kakao.maps.Map } = {};
      const proto = kakao.maps.Map.prototype,
        project = proto.getProjection;
      proto.getProjection = function () {
        proto.getProjection = project;
        ref.map = this;
        return project.call(this);
      };
      return ref;
    });
    await input.fill(full.name);
    await expect.poll(() => observed.evaluate((ref) => !!ref.map)).toBe(true);
    const point = await observed.evaluate(
      (ref, origin) => {
        const projection = ref.map!.getProjection();
        const p = projection.containerPointFromCoords(
          new kakao.maps.LatLng(origin.lat, origin.lng),
        );
        const other = projection.coordsFromContainerPoint(
          new kakao.maps.Point(p.x + 32, p.y),
        );
        return { lat: other.getLat(), lng: other.getLng() };
      },
      { lat: full.lat, lng: full.lng },
    );
    Object.assign(other, point);
  } else {
    const a = await anchor(full.name, full.id);
    const b = await anchor(other.name, other.id);
    expect(Math.abs(b - a)).toBeGreaterThan(0);
    other.lng = full.lng + ((other.lng - full.lng) * 40) / Math.abs(b - a);
  }
  Object.assign(s.bins[2], {
    lat: other.lat,
    lng: other.lng,
    name: "유리 거점 위치 확인",
  });
  s.version++;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await input.fill("");
  await expect(page.locator(".station-sheet .stations")).toContainText(
    s.bins[2].name,
  );
  await input.blur();
  const group = marker(full.id);
  await expect(group).toHaveAttribute("data-group-size", "3");
  // During every animation frame a real ID belongs to exactly one actionable marker.
  const record = await page.evaluateHandle(() => {
    let duplicate = false,
      raf = 0;
    function sample() {
      const ids = [
        ...document.querySelectorAll<HTMLElement>(".pin:not([inert])"),
      ].flatMap((el) => el.dataset.binIds!.split(" "));
      duplicate ||= new Set(ids).size !== ids.length;
      raf = requestAnimationFrame(sample);
    }
    sample();
    return () => {
      cancelAnimationFrame(raf);
      return duplicate;
    };
  });
  await page.getByRole("button", { name: "시트 닫기" }).click();
  await group.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".station")).toHaveCount(3);
  await page.keyboard.press("Escape");
  const plus = page.getByRole("button", { name: "지도 확대" });
  await plus.click();
  await expect(group).toBeAttached();
  await expect(group).not.toHaveAttribute("data-group-size", /.+/);
  await expect(marker(other.id)).toHaveAttribute("data-group-size", "2");
  await page.getByRole("button", { name: "지도 범위 맞추기" }).click();
  await expect(group).toHaveAttribute("data-group-size", "3");
  expect(await record.evaluate((stop) => stop())).toBe(false);
  await page.getByRole("button", { name: "추가 설치 건의" }).click();
  await page.getByLabel("가상 위치 선택").selectOption("main");
  await group.focus();
  await page.keyboard.press("Enter");
  await expect(dialog.locator(".station")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("가상 위치 선택")).toHaveValue("main");
  await expect(page.locator(".pin.kind-candidate")).toHaveCount(1);
});

for (const width of [390, 1366]) {
  for (const grouped of [false, true]) {
    test(`핀 선택 테두리 · ${width}px · ${grouped ? "그룹" : "개별"}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
      const { full, far } = await setup(page);
      const bin = grouped ? full : far;
      const pin = page.locator(`.pin[data-bin-ids~="${bin.id}"]:not([inert])`);
      const face = pin.locator(".marker-face");
      const blueRing = "rgb(0, 91, 172) solid 3px";
      await expect(pin).toHaveCount(1);
      expect((await pin.getAttribute("data-group-size")) !== null).toBe(
        grouped,
      );
      await expect(pin).toHaveCSS("box-shadow", "none");
      await expect(face).toHaveCSS("outline-style", "none");
      const fill = await face.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      );

      await page.keyboard.press("Tab");
      await pin.focus();
      await expect(pin).toBeFocused();
      await expect(face).toHaveCSS("outline", blueRing);
      if (width === 390) await pin.tap();
      else await page.keyboard.press("Enter");
      if (grouped)
        await page
          .getByRole("dialog")
          .getByRole("button", { name: new RegExp(bin.name) })
          .click();

      await expect(pin).toHaveAttribute("data-selected-bin", bin.id);
      await expect(pin).toHaveCSS("box-shadow", "none");
      await expect(pin).toHaveCSS("outline-width", "0px");
      await expect(pin).toHaveCSS("width", "48px");
      await expect(pin).toHaveCSS("height", "48px");
      await expect(face).toHaveCSS("outline", blueRing);
      await expect(face).toHaveCSS("background-color", fill);
      await expect(face).toHaveCSS("animation-name", "marker-select");
      await expect(face).toHaveCSS("animation-iteration-count", "1");
    });
  }
}
