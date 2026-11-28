import { test } from "node:test";
import assert from "node:assert/strict";
import { boothFixture } from "./admin-fixture";
import { reviewPlan, startPlan, sevenDays } from "../lib/admin-workflow";
import { rankings } from "../lib/model";
import { priorityChanges } from "../lib/priority-change";
test("건의·신고 품목, 수동 설치안과 만료된 원본을 독립적으로 검토한다", () => {
  const s = boothFixture(),
    r = rankings(s)[0],
    p = startPlan(r, s.epoch);
  p.name = "본관 입구";
  p.point = r.zone;
  assert.deepEqual(reviewPlan(p, r).proposed, ["paper", "can"]);
  p.manualTypes = ["glass"];
  const diff = reviewPlan(p, r);
  assert.equal(diff.valid, true);
  assert.deepEqual(
    [diff.missingRequested, diff.missingReported, diff.additional],
    [["paper"], ["can"], ["glass"]],
  );
  const aged = { ...s, as_of: "2026-12-02T00:00:00Z" };
  const changed = reviewPlan(
    p,
    rankings(aged).find((x) => x.zone.id === r.zone.id)!,
  );
  assert.equal(changed.expired, true);
  assert.equal(changed.valid, false);
  assert.deepEqual(changed.proposed, ["glass"]);
  assert.deepEqual(p.rep, ["s1"]);
  p.point = { lat: 0, lng: 0 };
  assert.equal(reviewPlan(p, r).valid, false);
});
test("같은 총점의 반려와 접수를 구분하고 반복 스냅샷을 무시한다", () => {
  const s = boothFixture(),
    next = structuredClone(s);
  next.requests[0].status = "rejected";
  next.requests.push({ ...s.requests[0], id: "replacement" });
  assert.equal(
    priorityChanges(s, next).get("main"),
    "설치 건의 접수 1건, 건의 반려 1건 · 0점",
  );
  assert.equal(priorityChanges(next, structuredClone(next)).size, 0);
});
test("서울 날짜의 7일 건수는 경계 진입만 포함하고 이전 신고를 제외한다", () => {
  const s = boothFixture();
  s.reports.push({ ...s.reports[0], created_at: "2026-11-16T00:00:00Z" });
  s.readings.push({
    created_at: s.as_of,
    fill_percent: 99,
    previous_percent: 80,
  });
  const days = sevenDays(s);
  assert.equal(days.length, 7);
  assert.deepEqual(days.at(-1), { date: "2026-11-24", reports: 1, entries: 1 });
  assert.equal(
    days.reduce((n, d) => n + d.reports, 0),
    1,
  );
});
