import { test } from "node:test";
import assert from "node:assert/strict";
import {
  searchBins,
  preferredItems,
  type Bin,
  type Snapshot,
  type RequestRow,
  type Report,
  type Waste,
} from "../lib/model";
import { mapHref, readIntent } from "../lib/student-navigation";
import { priorityChanges } from "../lib/priority-change";
const makeBin = (
  id: string,
  zone_id: string,
  name: string,
  waste_types: Waste[],
): Bin => ({
  id,
  zone_id,
  name,
  waste_types,
  location_description: "입구",
  lat: 37.45,
  lng: 126.65,
  source: "seed",
  fills: {},
});
const bins = [
  makeBin("a", "five", "음료 수거함", ["liquid"]),
  makeBin("b", "student", "종합 수거함", ["plastic", "liquid"]),
  makeBin("c", "main", "음료 건물의 유리 수거함", ["glass"]),
];
test("건물과 실제 설치 품목을 단어 순서에 관계없이 검색한다", () => {
  const ids = (query: string, filter: Waste | null = null) =>
    searchBins(bins, query, filter).map((b) => b.id);
  assert.deepEqual(ids("남은 음료"), ["a", "b"]);
  for (const text of ["5호관", "5호관 음료", "  음료   5호관 "])
    assert.deepEqual(ids(text), ["a"]);
  assert.deepEqual(ids("pEt", "liquid"), ["b"]);
  assert.deepEqual(ids("LIQUID", "glass"), []);
  assert.deepEqual(ids("없는곳"), []);
  assert.deepEqual(ids("", "glass"), ["c"]);
  assert.equal(
    searchBins(
      [...bins, makeBin("d", "main", "새 거점", ["can", "liquid"])],
      "남은 음료",
      null,
    ).length,
    3,
  );
  assert.deepEqual(preferredItems(bins[1].waste_types, "liquid"), [
    "liquid",
    "plastic",
  ]);
  assert.deepEqual(bins[1].waste_types, ["plastic", "liquid"]);
});
test("지도 동작 링크와 유효하지 않은 직접 주소를 구분한다", () => {
  for (const task of [
    { type: "filter", waste: "glass" },
    { type: "request" },
    { type: "bin", id: "eeeeeeee-1111-4444-bbbb-eeeeeeeeeeee" },
  ] as const) {
    assert.deepEqual(
      readIntent(new URL(mapHref(task), "https://example.com").searchParams),
      task,
    );
  }
  for (const text of [
    "task=anything",
    "task=bin&id=5호관",
    "task=filter&item=no",
  ])
    assert.deepEqual(readIntent(new URLSearchParams(text)), {
      type: "invalid",
    });
  assert.equal(readIntent(new URLSearchParams()), null);
});
const seed: Snapshot = {
  epoch: "A",
  version: 1,
  as_of: "2026-11-24T04:00:00Z",
  requests: [],
  reports: [],
  bins: [],
  batches: [],
  readings: [],
};
const req = (
  id: string,
  status: RequestRow["status"] = "pending",
): RequestRow => ({
  id,
  status,
  zone_id: "five",
  reason: "테스트",
  requested_waste_types: ["liquid"],
  created_at: seed.as_of,
  lat: 37.45,
  lng: 126.65,
});
const rep = (id: string): Report => ({
  id,
  bin_id: "a",
  zone_id: "five",
  waste_type: "liquid",
  created_at: seed.as_of,
  considered_batch_id: null,
  lat: 37.45,
  lng: 126.65,
});
test("순위 변화는 실제 건의·신고 ID, 처리 상태와 집계 기한으로 설명한다", () => {
  const next = {
    ...seed,
    requests: [req("r")],
    reports: [rep("p"), rep("p2")],
  };
  assert.equal(
    priorityChanges(seed, next).get("five"),
    "설치 건의 접수 1건, 포화 신고 접수 2건 · +5점",
  );
  assert.equal(
    priorityChanges(next, {
      ...next,
      requests: [req("r", "approved")],
      reports: next.reports.map((r) => ({ ...r, considered_batch_id: "b" })),
    }).get("five"),
    "건의 승인 1건, 포화 신고 반영 2건 · -5점",
  );
  assert.equal(
    priorityChanges(next, { ...next, requests: [req("r", "rejected")] }).get(
      "five",
    ),
    "건의 반려 1건 · -3점",
  );
  assert.equal(
    priorityChanges(next, {
      ...next,
      as_of: "2026-12-01T06:00:00Z",
      reports: [],
    }).get("five"),
    "신고 집계 만료 2건 · -2점",
  );
  assert.equal(
    priorityChanges(next, { ...next, reports: [] }).get("five"),
    "설치 우선순위 변경 · -2점",
  );
  assert.equal(
    priorityChanges(next, { ...next, epoch: "B", requests: [] }).size,
    0,
  );
  assert.equal(priorityChanges(next, { ...next }).size, 0);
});
