import { test, expect, type Page } from "@playwright/test";
import { boothFixture } from "../admin-fixture";
import type { Snapshot } from "../../lib/model";

test.use({ viewport: { width: 1366, height: 768 } });
const refresh = (page: Page) =>
  page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
async function open(page: Page, s: Snapshot) {
  await page.route("**/api/admin/snapshot", (r) => r.fulfill({ json: s }));
  await page.goto("/admin");
  await page
    .getByLabel("관리자 비밀번호")
    .fill(process.env.TEST_ADMIN_PIN ?? "1234");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator(".rank-row")).toHaveCount(8);
}
test("실제 변경 행의 강조, 선택 유지, 건물별 초안과 최신 승인 대상 검증", async ({
  page,
}) => {
  const s = boothFixture();
  await page.addInitScript(() => {
    const animate = Element.prototype.animate;
    const marks: string[] = [];
    Object.assign(window, { rankFlashes: marks });
    Element.prototype.animate = function (frames, options) {
      if (
        this instanceof HTMLElement &&
        this.matches(".rank-row") &&
        Array.isArray(frames) &&
        frames.some((f) => f.backgroundColor)
      )
        marks.push(this.dataset.zoneId!);
      return animate.call(this, frames, options);
    };
  });
  await open(page, s);
  const firstScreen = await page.evaluate(() => ({
    lastRank: document.querySelectorAll(".rank-row")[7].getBoundingClientRect()
      .bottom,
    mapTop: document.querySelector(".map-surface")!.getBoundingClientRect().top,
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
  expect(firstScreen.lastRank).toBeLessThanOrEqual(768);
  expect(firstScreen.mapTop).toBeLessThan(568);
  expect(firstScreen.overflow).toBe(false);
  const selected = page.locator(".rank-row[aria-pressed=true]");
  await expect(selected).toContainText("본관");
  const map = await page.locator(".map-surface").elementHandle();
  const view = () => page.locator(".basemap").getAttribute("viewBox");
  const camera = await view();
  await page.getByRole("button", { name: "설치 위치 지정" }).click();
  await page
    .getByRole("button", { name: "가상 위치로 건물 중심 선택" })
    .click();
  await page.getByLabel("신규 거점명").fill("본관 후보");
  await page.getByRole("button", { name: "캔", exact: true }).click();
  await page.getByRole("button", { name: "유리", exact: true }).click();
  s.requests.push({ ...s.requests[1], id: "r3" });
  s.version++;
  await refresh(page);
  await expect(page.locator(".rank-row").first()).toContainText("5호관");
  await expect(selected).toContainText("본관");
  await expect(page.locator(".recent-change")).toContainText("+3점");
  expect(await page.evaluate(() => Reflect.get(window, "rankFlashes"))).toEqual(
    ["five"],
  );
  expect(await view()).toBe(camera);
  await page.locator('[data-zone-id="five"]').click();
  await page.getByRole("button", { name: "설치 위치 지정" }).click();
  await page.getByLabel("신규 거점명").fill("5호관 후보");
  await page.locator('[data-zone-id="main"]').click();
  expect(
    await map!.evaluate((el) => el === document.querySelector(".map-surface")),
  ).toBe(true);
  await expect(page.getByLabel("신규 거점명")).toHaveValue("본관 후보");
  await expect(page.locator(".pin.kind-candidate")).toBeVisible();
  await page.getByRole("button", { name: "승인 대상 확인" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("미포함 신고 품목").locator(".."),
  ).toContainText("캔");
  await expect(dialog.getByText("추가 설치 품목").locator("..")).toContainText(
    "유리",
  );
  let posts = 0;
  await page.route("**/api/admin/approve", (r) => {
    posts++;
    return r.fulfill({ status: 409, json: { error: "결과 변경" } });
  });
  s.requests[0].status = "approved";
  s.version++;
  await dialog.getByRole("button", { name: "설치 승인", exact: true }).click();
  await expect(page.locator(".approval-form")).toContainText("선택을 해제");
  expect(posts).toBe(0);
  await expect(
    page.getByRole("button", { name: "승인 대상 확인" }),
  ).toBeDisabled();
  await page
    .locator(".checkline")
    .filter({ hasText: "본관 분리수거함 옆 종이함" })
    .getByRole("checkbox")
    .uncheck();
  await page.getByRole("button", { name: "추천 품목으로 복원" }).click();
  await expect(
    page.getByRole("button", { name: "캔", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "승인 대상 확인" }).click();
  await dialog.getByRole("button", { name: "설치 승인", exact: true }).click();
  await expect(page.getByLabel("신규 거점명")).toHaveValue("본관 후보");
  expect(posts).toBe(1);
});
test("지도 그룹의 짧은 거점과 긴 건의는 동일한 열을 사용하고 키보드로 선택된다", async ({
  page,
}) => {
  const s = boothFixture();
  s.requests[0].reason =
    "출입구에 모인 종이 상자를 수거해 주세요. " +
    "종이수거함설치건의".repeat(6);
  await open(page, s);
  await page.locator('.pin[data-group-size="2"]').click();
  const rows = page.locator(".admin-members button");
  await expect(rows).toHaveCount(2);
  await page.getByRole("dialog").evaluate(async (dialog) => {
    await Promise.all(
      dialog.getAnimations().map((animation) => animation.finished),
    );
  });
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    const [short, long] = await rows.evaluateAll((buttons) =>
      buttons.map((button) => {
        const face = button.querySelector(".press-face")!;
        return {
          columns: Array.from(face.children, (child) => {
            const { x, width } = child.getBoundingClientRect();
            return [x, width];
          }),
          height: face.clientHeight,
          overflow: face.scrollWidth > face.clientWidth,
        };
      }),
    );
    expect(long.columns).toEqual(short.columns);
    expect(short.columns[0][1]).toBe(20);
    expect(short.columns[2][1]).toBe(16);
    expect(long.height).toBeGreaterThan(short.height);
    expect(long.overflow).toBe(false);
  }
  await rows.first().focus();
  await page.keyboard.press("Tab");
  await expect(rows.last()).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".inspection")).toContainText(s.requests[0].reason);
});
test("겹친 건의와 거점의 신고를 구분하고 센서 임시값·0%·저장 결과를 대상별로 확인한다", async ({
  page,
}) => {
  const s = boothFixture();
  await open(page, s);
  const group = page.locator('.pin[data-group-size="2"]');
  await group.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /설치 건의/ }).click();
  await expect(page.locator(".inspection")).toContainText(s.requests[0].reason);
  await group.click();
  await dialog
    .getByRole("button", { name: /본관 분리수거함 수거 거점/ })
    .click();
  const main = page
    .locator(".inspect-item")
    .filter({ hasText: "미반영 신고 1건" });
  await main.getByRole("button").click();
  await expect(page.getByLabel("설치 품목", { exact: true })).toHaveValue(
    "can",
  );
  const values = page.locator(".sensor-values");
  const slider = page.getByLabel("포화도 설정");
  await expect(values).toContainText("70%");
  await slider.press("ArrowRight");
  s.bins[0].fills.can = 68;
  s.version++;
  await refresh(page);
  await expect(values).toContainText("68%");
  await expect(slider).toHaveValue("71");
  await page.getByLabel("설치 품목", { exact: true }).selectOption("paper");
  await expect(values).toContainText("정보 없음");
  await expect(page.locator(".saved-rail")).toHaveCount(0);
  const apply = page.getByRole("button", { name: "측정값 적용" });
  await expect(apply).toBeDisabled();
  await page.getByRole("button", { name: "0% 지정" }).click();
  let code = 500,
    posts = 0;
  await page.route("**/api/admin/sensor", (r) => {
    posts++;
    expect(r.request().postDataJSON()).toMatchObject({
      id: "bin-main",
      item: "paper",
      percent: 0,
    });
    return r.fulfill({
      status: code,
      json: code === 200 ? { ok: true } : { error: "저장 실패" },
    });
  });
  await apply.click();
  await expect(page.locator(".sensor-result")).toContainText("실패");
  code = 200;
  await apply.click();
  await expect(page.locator(".sensor-result")).toContainText("확인 필요");
  await expect(values).toContainText("정보 없음");
  s.bins[0].fills.paper = 0;
  s.version++;
  await page.getByRole("button", { name: "측정값 다시 확인" }).click();
  await expect(page.locator(".sensor-result")).toContainText("0% 적용됨");
  await expect(page.locator(".saved-rail")).toBeVisible();
  await expect(apply).toBeDisabled();
  await page.getByLabel("설치 품목", { exact: true }).selectOption("can");
  await expect(slider).toHaveValue("71");
  expect(posts).toBe(2);
});
