import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alternatives,
  searchBins,
  searchIntent,
  stationOrder,
  type Bin,
  type Waste,
} from "../lib/model";
import { groupMarkers } from "../lib/marker-groups";
test("겹치는 히트 영역은 순서에 독립적인 연결 그룹이며 확대 시 분리된다", () => {
  const pins = [
    { id: "b", x: 6, y: 0 },
    { id: "a", x: 0, y: 0 },
    { id: "c", x: 6, y: 0 },
    { id: "d", x: 53, y: 0 },
    { id: "e", x: 102, y: 0 },
  ];
  const groups = (scale: number, input = pins) =>
    groupMarkers(input, (p) => ({ x: p.x * scale, y: p.y }))
      .map((g) => g.id)
      .sort();
  assert.deepEqual(groups(1), ["e", 'group:["a","b","c","d"]']);
  assert.deepEqual(groups(1, [...pins].reverse()), groups(1));
  assert.deepEqual(groups(10), ["a", "d", "e", 'group:["b","c"]']);
  assert.equal(pins[0].x, 6);
});
const bin = (
  id: string,
  zone_id: string,
  items: Waste[],
  liquid: number | null,
  offset = 0,
): Bin => ({
  id,
  zone_id,
  name: id,
  location_description: "입구",
  lat: 37,
  lng: 126 + offset,
  waste_types: items,
  source: "seed",
  fills: { liquid },
});
const full = bin("a", "five", ["liquid"], 100);
const room = bin("b", "five", ["plastic", "liquid"], 0, 0.0002);
const far = bin("c", "student", ["liquid"], 44, 0.003);
const fixture = [
  full,
  room,
  far,
  ...["general", "plastic", "paper", "can", "glass", "general"].map((t, i) =>
    bin(String(i), "library", [t as Waste], null),
  ),
];
test("실제 설치 품목과 건물 별칭을 AND 검색하고 한 품목만 컨텍스트로 선택한다", () => {
  assert.equal(searchBins(fixture, "남은 음료", null).length, 3);
  assert.deepEqual(searchBins(fixture, "5호관 음료", null), [full, room]);
  assert.deepEqual(searchBins(fixture, " 페트병  5호관 ", null), [room]);
  for (const term of ["페트병", "ＰＥＴ병", "생수병"])
    assert.equal(searchIntent(term).waste, "plastic");
  assert.equal(searchIntent("종이 음료").waste, null);
  assert.equal(searchIntent("5호관 커피").coffee, true);
  assert.equal(searchIntent("5호관 커피").drinkQuery, "5호관 음료");
  assert.equal(searchIntent("커피 음료").coffee, false);
  assert.deepEqual(searchBins(fixture, "도서관 음료", null), []);
  assert.deepEqual(searchBins(fixture, "도서관 음료", "glass"), []);
  assert.deepEqual(
    searchBins(
      [...fixture, { ...room, id: "library-liquid", zone_id: "library" }],
      "음료 도서관",
      null,
    ).map((b) => b.id),
    ["library-liquid"],
  );
});
test("대안은 동일 품목의 측정된 여유 거점 두 곳까지, 구역과 거리 순이다", () => {
  const unknown = bin("u", "five", ["liquid"], null),
    wrong = bin("w", "five", ["paper"], 0);
  assert.deepEqual(
    alternatives([far, unknown, wrong, room, full], full, "liquid"),
    [room, far],
  );
  assert.deepEqual(alternatives([full, wrong, unknown], full, "liquid"), []);
  assert.deepEqual(alternatives(fixture, room, "liquid"), []);
  const same = bin("d", "five", ["liquid"], 38, 0.0001);
  assert.deepEqual(alternatives([...fixture, same], full, "liquid"), [
    same,
    room,
  ]);
});
test("센서 갱신은 순서를 보존하고 새 탐색은 최신 포화도로 평가한다", () => {
  const start = stationOrder([full, far, room], "liquid", []);
  assert.deepEqual(start, ["c", "b", "a"]);
  const emptied = { ...full, fills: { liquid: 0 } },
    filled = { ...room, fills: { liquid: 100 } };
  assert.deepEqual(
    stationOrder([emptied, far, filled], "liquid", start),
    start,
  );
  assert.deepEqual(stationOrder([emptied, far, filled], "liquid", []), [
    "a",
    "c",
    "b",
  ]);
  assert.deepEqual(
    stationOrder([emptied, filled, { ...far, id: "new" }], "liquid", start),
    ["b", "a", "new"],
  );
});
