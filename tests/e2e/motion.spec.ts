import { test, expect, type Page } from "@playwright/test";
import type { Snapshot } from "../../lib/model";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const tab = (page: Page, path: string) =>
  page.locator('.student-tabs a[href="' + path + '"]');
async function tabAligned(page: Page, path: string) {
  const active = tab(page, path);
  await expect(active).toHaveAttribute("aria-current", "page");
  await expect
    .poll(() =>
      active.evaluate((el) => {
        const box = el.getBoundingClientRect(),
          mark = el.querySelector(".tab-highlight")?.getBoundingClientRect();
        return (
          !!mark &&
          Math.abs(box.x + box.width / 2 - mark.x - mark.width / 2) < 1 &&
          mark.height >= box.height - 10 &&
          [el.querySelector("svg"), el.lastElementChild].every((child) => {
            const c = child!.getBoundingClientRect();
            return c.y >= mark.y && c.bottom <= mark.bottom;
          })
        );
      }),
    )
    .toBe(true);
}
test("탭 왕복과 빠른 전환에서 표시기·지도·검색 상태가 유지된다", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".pin").first()).toBeVisible();
  await page.getByRole("searchbox").fill("5호관");
  await page.getByRole("button", { name: "시트 닫기" }).tap();
  const before = await page.locator(".basemap").getAttribute("viewBox");
  await page
    .locator(".student-tabs")
    .evaluate((n) => n.setAttribute("data-same-nav", "yes"));
  await page
    .locator(".basemap")
    .evaluate((n) => n.setAttribute("data-same-map", "yes"));
  await tab(page, "/requests").tap();
  await tab(page, "/guide").tap();
  await tabAligned(page, "/guide");
  await page.getByRole("button", { name: "종이", exact: true }).tap();
  const guide = page.getByRole("dialog");
  await expect(guide).toContainText("테이프");
  await page.keyboard.press("Escape");
  await expect(guide).toHaveCount(0);
  await tab(page, "/requests").tap();
  await tabAligned(page, "/requests");
  await tab(page, "/guide").tap();
  await tabAligned(page, "/guide");
  await page.goBack();
  await tabAligned(page, "/requests");
  await page.goForward();
  await tabAligned(page, "/guide");
  await tab(page, "/").tap();
  await tabAligned(page, "/");
  await expect(page.getByRole("searchbox")).toHaveValue("5호관");
  await expect(page.locator(".student-tabs")).toHaveAttribute(
    "data-same-nav",
    "yes",
  );
  await expect(page.locator(".basemap")).toHaveAttribute(
    "data-same-map",
    "yes",
  );
  await expect(page.locator(".basemap")).toHaveAttribute("viewBox", before!);
  const field = page.getByRole("searchbox"),
    r = await field.boundingBox();
  await page.getByRole("button", { name: "검색어 지우기" }).tap();
  await expect(field).toBeFocused();
  expect(await field.boundingBox()).toEqual(r);
  await field.fill("일치할 수 없는 검색");
  await expect(page.locator(".empty-reveal")).toBeVisible();
  await field.fill("다른 미검색");
  await expect(page.locator(".empty-reveal")).toHaveCount(1);
});
test("최초 로딩, 실시간 상태 전환, 재시도와 열린 건의 보존", async ({
  page,
}) => {
  const seed: Snapshot = await (await page.request.get("/api/snapshot")).json();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let fail = false,
    stage = 0;
  const statuses = ["pending", "approved", "installed"] as const;
  await page.route("**/api/snapshot", async (route) => {
    await gate;
    if (fail)
      return route.fulfill({
        status: 503,
        json: { error: "테스트 연결 오류" },
      });
    return route.fulfill({
      json: {
        ...seed,
        version: seed.version + stage,
        requests: [
          {
            id: "mine",
            zone_id: "five",
            reason: "현재 건의 사유",
            requested_waste_types: ["paper"],
            status: statuses[stage],
            created_at: seed.as_of,
          },
        ],
      },
    });
  });
  await page.goto("/requests");
  await expect(page.locator(".skeleton.requests")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      page
        .locator(".skeleton-row i")
        .first()
        .evaluate((e) => getComputedStyle(e, "::after").animationName),
    )
    .toBe("none");
  release();
  const entry = page.locator(".request-entry");
  await expect(entry).toHaveCount(1);
  await entry.locator("summary").tap();
  await expect(entry.locator("p")).toBeVisible();
  await expect(page.locator(".skeleton")).toHaveCount(0);
  await page.evaluate(() => {
    new MutationObserver((records) => {
      for (const rec of records)
        for (const n of rec.addedNodes)
          if (
            n instanceof Element &&
            (n.matches(".skeleton") || n.querySelector(".skeleton"))
          )
            document.body.dataset.flash = "yes";
    }).observe(document.body, { subtree: true, childList: true });
  });
  const refresh = () =>
    page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  for (stage = 1; stage <= 2; stage++) {
    await refresh();
    await expect(entry.locator(".status-tag")).toHaveAttribute(
      "data-status",
      statuses[stage],
    );
    await expect(entry).toHaveAttribute("open", "");
  }
  stage = 2;
  fail = true;
  await refresh();
  await expect(
    page.locator(".reading-scroll").getByRole("alert"),
  ).toContainText("테스트 연결 오류");
  await expect(entry.locator("p")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "다시 연결" }).tap();
  await expect(page.locator(".reading-scroll").getByRole("alert")).toHaveCount(
    0,
  );
  await expect(page.locator("body")).not.toHaveAttribute("data-flash", "yes");
});
test("신고 실패에는 재시도가 남고 성공 응답 뒤에만 확인 표시가 나타난다", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".pin").filter({ hasText: "" }).first().tap();
  await page.locator(".report").first().tap();
  const dialog = page.getByRole("dialog");
  let finish!: () => void;
  const hold = new Promise<void>((res) => {
    finish = res;
  });
  await page.route(
    "**/api/reports",
    async (route) => {
      await hold;
      await route.fulfill({ status: 503, json: { error: "신고 재시도" } });
    },
    { times: 1 },
  );
  await dialog.getByRole("button", { name: "확인하고 신고" }).tap();
  await expect(dialog.getByRole("button", { name: "접수 중…" })).toBeDisabled();
  finish();
  await expect(dialog.getByRole("alert")).toContainText("신고 재시도");
  await expect(page.locator(".toast[data-kind=success]")).toHaveCount(0);
  await page.route(
    "**/api/reports",
    (route) => route.fulfill({ json: { ok: true } }),
    { times: 1 },
  );
  await dialog.getByRole("button", { name: "확인하고 신고" }).tap();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".toast[data-kind=success]")).toContainText(
    "신고를 접수",
  );
  await expect(page.locator(".station-sheet")).toHaveAttribute(
    "aria-label",
    "거점 상세",
  );
});

test("빠른 첫 조회와 신규 설치를 재조회·필터 변경과 구분한다", async ({
  page,
}) => {
  const snapshot: Snapshot = await (
    await page.request.get("/api/snapshot")
  ).json();
  const extra = {
    ...snapshot.bins[0],
    id: "motion-install",
    source: "request",
    name: "새로 설치한 검증 거점",
  };
  let added = false;
  await page.route("**/api/snapshot", (route) =>
    route.fulfill({
      json: {
        ...snapshot,
        version: snapshot.version + (added ? 1 : 0),
        bins: added ? [...snapshot.bins, extra] : snapshot.bins,
      },
    }),
  );
  await page.addInitScript(() => {
    new MutationObserver((records) => {
      for (const r of records)
        for (const node of r.addedNodes) {
          if (
            node instanceof Element &&
            (node.matches(".skeleton") || node.querySelector(".skeleton"))
          )
            document.documentElement.dataset.showedSkeleton = "yes";
        }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto("/");
  await expect(page.locator(".pin")).toHaveCount(snapshot.bins.length);
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-showed-skeleton",
    "yes",
  );
  await expect(page.locator("[data-new-installation]")).toHaveCount(0);
  const camera = await page.locator(".basemap").getAttribute("viewBox");
  added = true;
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  const pin = page.getByRole("button", { name: extra.name, exact: true });
  await expect(pin).toHaveAttribute("data-new-installation", "true");
  await expect(pin).not.toHaveAttribute("data-new-installation", "true");
  const update = page.waitForResponse("**/api/snapshot");
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await update;
  await expect(page.locator("[data-new-installation]")).toHaveCount(0);
  await expect(page.locator(".basemap")).toHaveAttribute("viewBox", camera!);
});

test("데스크톱의 모든 거점 행과 설치 건의 버튼을 스크롤하여 누를 수 있다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const proposal = page.getByRole("button", {
    name: "추가 설치 건의",
    exact: true,
  });
  await expect(proposal).toBeEnabled();
  const before = await proposal.boundingBox();
  const rows = page.locator(".station");
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) {
    await row.scrollIntoViewIfNeeded();
    expect(
      await row.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
        );
      }),
    ).toBe(true);
  }
  expect(await proposal.boundingBox()).toEqual(before);
  await proposal.click();
  await expect(page.getByLabel("가상 위치 선택")).toBeVisible();
});
