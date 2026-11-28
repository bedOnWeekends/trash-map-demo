import assert from "node:assert/strict";
import test from "node:test";
import { advance, boothEvents, emptyDeck, enqueue } from "../lib/booth-events";
import { boothFixture } from "./admin-fixture";

test("같은 조회 구간의 건의·신고를 구역/종류별로 묶고 점수 합계를 한 번만 표시한다", () => {
  const before = boothFixture(),
    after = structuredClone(before);
  after.version++;
  after.requests.push(
    ...["a", "b"].map((id) => ({ ...after.requests[0], id })),
  );
  after.reports.push({ ...after.reports[0], id: "s2" });
  after.bins[0].fills.can = 98;
  const events = boothEvents(before, after);
  assert.deepEqual(
    events.map((e) => [e.label, e.count]),
    [
      ["설치 건의 접수", 2],
      ["포화 신고 접수", 1],
      ["센서 측정값 변경", 1],
    ],
  );
  assert.deepEqual(
    events.flatMap((e) => (e.window ? [e.window.delta] : [])),
    [7],
  );
  assert.deepEqual(boothEvents(after, structuredClone(after)), []);
  assert.deepEqual(boothEvents(before, { ...after, epoch: "next" }), []);
  const first = enqueue(emptyDeck, events);
  const more = enqueue(
    first,
    Array.from({ length: 30 }, (_, i) => ({ ...events[0], key: String(i) })),
  );
  assert.equal(first.current, more.current);
  assert.equal(more.waiting.length, 24);
  assert.equal(more.compressed, 8);
  assert.equal(advance(more).current, more.waiting[0]);
});
test("검토와 센서 변화에는 가짜 점수나 순위를 부여하지 않는다", () => {
  const s = boothFixture(),
    next = structuredClone(s);
  next.requests[0].status = "reviewing";
  next.bins[0].fills.paper = 0;
  const e = boothEvents(s, next);
  assert.deepEqual(
    e.map((x) => x.label),
    ["건의 검토", "센서 측정값 변경"],
  );
  assert.ok(e.every((x) => !x.window));
});
