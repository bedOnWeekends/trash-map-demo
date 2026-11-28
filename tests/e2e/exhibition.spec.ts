import { test, expect } from "@playwright/test";
import { boothFixture } from "../admin-fixture";

test("관람객 모드는 최신 순위와 독립된 사건을 표시하고 운영 초안과 카메라를 복원한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const s = boothFixture();
  await page.route("**/api/admin/snapshot", (r) => r.fulfill({ json: s }));
  await page.goto("/admin");
  await page
    .getByLabel("관리자 비밀번호")
    .fill(process.env.TEST_ADMIN_PIN ?? "1234");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  const toggle = page.getByRole("button", { name: "5호관 점수 계산식" });
  await toggle.click();
  await expect(page.locator("#formula-five")).toContainText("× 3");
  await expect(page.locator(".rank-row[aria-pressed=true]")).toContainText(
    "본관",
  );
  await page.getByRole("button", { name: "설치 위치 지정" }).click();
  await page.getByLabel("신규 거점명").fill("보존할 후보");
  const camera = await page
    .locator("#management .basemap")
    .getAttribute("viewBox");
  await page.getByLabel("포화도 설정").press("End");
  await page.getByRole("button", { name: "관람객 화면", exact: true }).click();
  const screen = page.locator(".exhibition");
  await expect(screen.locator(".exhibit-ranks li")).toHaveCount(3);
  await expect(page.locator(".operation-view")).toBeHidden();
  await expect(screen).toContainText("새로 확인된 변화가 없습니다");
  const refresh = () =>
    page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  s.requests.push({ ...s.requests[1], id: "new" });
  s.version++;
  await refresh();
  await expect(screen.locator(".event-record")).toContainText(
    "설치 건의 접수 1건",
  );
  const first = await screen.locator(".event-record").innerText();
  s.reports.push({ ...s.reports[0], id: "new-report" });
  s.version++;
  await refresh();
  await expect(
    screen.getByRole("button", { name: /다음 변화 보기/ }),
  ).toContainText("1묶음");
  expect(await screen.locator(".event-record").innerText()).toBe(first);
  await screen.getByRole("button", { name: /다음 변화 보기/ }).click();
  await expect(screen.locator(".event-record")).toContainText("포화 신고 접수");
  expect(
    await screen
      .locator(".exhibit-ranks")
      .evaluate((n) => n.getBoundingClientRect().bottom),
  ).toBeLessThanOrEqual(768);
  await page.getByRole("button", { name: "운영 화면", exact: true }).click();
  expect(
    await page.locator("#management .basemap").getAttribute("viewBox"),
  ).toBe(camera);
  await expect(page.getByLabel("신규 거점명")).toHaveValue("보존할 후보");
  await expect(page.getByLabel("포화도 설정")).toHaveValue("100");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
});
test("여섯 배출 삽화, 설명, 경로 링크는 작은 화면과 모션 감소에서도 함께 열린다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/guide");
  await expect(page.locator(".guide-grid button")).toHaveCount(6);
  for (const choice of await page.locator(".guide-grid button").all()) {
    await choice.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".disposal-art")).toBeVisible();
    await expect(dialog.locator(".illustrated-action")).toHaveCSS(
      "animation-name",
      "none",
    );
    await expect(dialog.getByRole("link")).toBeInViewport();
    await page.keyboard.press("Escape");
  }
});
