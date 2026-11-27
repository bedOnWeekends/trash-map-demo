import test from "node:test";
import assert from "node:assert/strict";
import {
  zones,
  zoneAt,
  fillState,
  rankings,
  daysThrough,
  day,
  type Snapshot,
  type RequestRow,
  type Report,
} from "../lib/model";
test("서울 날짜 경계와 최근 일곱 날짜", () => {
  assert.equal(day("2026-11-26T15:00:00Z"), "2026-11-27");
  assert.deepEqual(daysThrough("2026-01-02T16:00:00Z"), [
    "2025-12-28",
    "2025-12-29",
    "2025-12-30",
    "2025-12-31",
    "2026-01-01",
    "2026-01-02",
    "2026-01-03",
  ]);
});
test("모든 포화도 경계값", () =>
  assert.deepEqual([null, 0, 49, 50, 79, 80, 99, 100].map(fillState), [
    "정보 없음",
    "여유",
    "여유",
    "보통",
    "보통",
    "혼잡",
    "혼잡",
    "가득 참",
  ]));
test("구역 중심, 캠퍼스 밖과 공유 경계 판정", () => {
  for (const z of zones) assert.equal(zoneAt(z)?.id, z.id);
  assert.equal(zoneAt({ lat: 37, lng: 127 }), undefined);
  let ties = 0;
  for (const z of zones)
    for (const [lng, lat] of z.polygon) {
      const owners = zones.filter((other) =>
        other.polygon.some(([x, y]) => x === lng && y === lat),
      );
      if (owners.length > 1) {
        ties++;
        assert.equal(
          zoneAt({ lng, lat })?.id,
          owners.map((x) => x.id).sort()[0],
        );
      }
    }
  assert.ok(ties > 10);
});
test("복수 품목 1건, 반영/만료 제외, 동점 및 0점 순위", () => {
  const now = "2026-11-27T04:00:00Z";
  const req = {
    zone_id: "five",
    status: "pending",
    requested_waste_types: ["liquid", "paper"],
  } as RequestRow;
  const rep = {
    zone_id: "tech",
    created_at: now,
    considered_batch_id: null,
  } as Report;
  const s = {
    as_of: now,
    requests: [req, { ...req, status: "approved" }],
    reports: [
      rep,
      rep,
      rep,
      { ...rep, created_at: "2026-11-20T14:59:59Z" },
      { ...rep, considered_batch_id: "done" },
    ],
  } as Snapshot;
  const ranks = rankings(s);
  assert.deepEqual(
    ranks.slice(0, 2).map((r) => [r.zone.id, r.score]),
    [
      ["five", 3],
      ["tech", 3],
    ],
  );
  assert.equal(ranks.length, zones.length);
  assert.deepEqual(
    ranks.slice(2).map((r) => r.zone.id),
    ranks
      .slice(2)
      .map((r) => r.zone.id)
      .sort(),
  );
});
