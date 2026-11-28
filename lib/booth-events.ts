import {
  day,
  daysThrough,
  zoneName,
  rankings,
  type Snapshot,
  type Waste,
} from "./model";
import { priorityChanges } from "./priority-change";

export type BoothEvent = {
  key: string;
  zone: string;
  label: string;
  types: Waste[];
  count: number;
  window?: { delta: number; from: number; to: number };
};

// A refresh may cover several commits. Only the net change for the entire
// observation window is knowable, never the intermediate order or rank.
export function boothEvents(before: Snapshot, after: Snapshot): BoothEvent[] {
  if (before.epoch !== after.epoch) return [];
  const groups = new Map<string, BoothEvent>();
  function add(zone: string, label: string, types: Waste[]) {
    const key = [after.epoch, after.version, after.as_of, zone, label].join(
      "/",
    );
    let event = groups.get(key);
    if (!event) {
      event = { key, zone, label, types: [], count: 0 };
      groups.set(key, event);
    }
    event.count++;
    event.types = [...new Set([...event.types, ...types])];
  }
  const requests = new Map(before.requests.map((r) => [r.id, r]));
  for (const r of after.requests) {
    const old = requests.get(r.id);
    if (!old) add(r.zone_id, "설치 건의 접수", r.requested_waste_types);
    if (
      old?.status !== r.status &&
      (r.status === "reviewing" || r.status === "rejected")
    )
      add(
        r.zone_id,
        r.status === "reviewing" ? "건의 검토" : "건의 반려",
        r.requested_waste_types,
      );
  }
  const reports = new Set(before.reports.map((r) => r.id));
  for (const r of after.reports)
    if (!reports.has(r.id)) add(r.zone_id, "포화 신고 접수", [r.waste_type]);
  const batches = new Map(before.batches.map((b) => [b.id, b.status]));
  for (const b of after.batches) {
    if (!batches.has(b.id)) add(b.zone_id, "설치 승인", b.waste_types);
    if (b.status === "installed" && batches.get(b.id) !== "installed")
      add(b.zone_id, "설치 완료", b.waste_types);
  }
  const bins = new Map(before.bins.map((b) => [b.id, b]));
  for (const bin of after.bins) {
    const old = bins.get(bin.id);
    if (!old) continue;
    for (const item of bin.waste_types)
      if (
        old.waste_types.includes(item) &&
        (old.fills[item] ?? null) !== (bin.fills[item] ?? null)
      )
        add(bin.zone_id, "센서 측정값 변경", [item]);
  }
  const previous = rankings(before),
    current = rankings(after);
  const dates = daysThrough(after.as_of);
  const liveReports = new Map(after.reports.map((r) => [r.id, r]));
  for (const rank of previous) {
    for (const r of rank.reports) {
      if (
        !dates.includes(day(r.created_at)) &&
        !liveReports.get(r.id)?.considered_batch_id
      )
        add(r.zone_id, "신고 집계 만료", [r.waste_type]);
    }
  }
  for (const zone of priorityChanges(before, after).keys()) {
    const from = previous.findIndex((r) => r.zone.id === zone);
    const to = current.findIndex((r) => r.zone.id === zone);
    let first = [...groups.values()].find(
      (e) => e.zone === zone && e.label !== "센서 측정값 변경",
    );
    if (!first) {
      add(zone, "우선순위 집계 변경", []);
      first = [...groups.values()].at(-1)!;
    }
    first.window = {
      delta: current[to].score - previous[from].score,
      from: from + 1,
      to: to + 1,
    };
  }
  return [...groups.values()];
}
export type EventDeck = {
  current?: BoothEvent;
  waiting: BoothEvent[];
  compressed: number;
  summary: Record<string, number>;
};
export const emptyDeck: EventDeck = { waiting: [], compressed: 0, summary: {} };
export function enqueue(deck: EventDeck, incoming: BoothEvent[]): EventDeck {
  if (!incoming.length) return deck;
  const waiting = [...deck.waiting, ...incoming];
  const current = deck.current ?? waiting.shift();
  const overflow = Math.max(0, waiting.length - 24);
  const summary = { ...deck.summary };
  for (const e of waiting.slice(0, overflow)) {
    const label = zoneName(e.zone) + " · " + e.label;
    summary[label] = (summary[label] ?? 0) + e.count;
  }
  return {
    summary,
    current,
    waiting: waiting.slice(overflow),
    compressed: deck.compressed + overflow,
  };
}
export function advance(deck: EventDeck): EventDeck {
  if (!deck.waiting.length) return deck;
  return {
    current: deck.waiting[0],
    waiting: deck.waiting.slice(1),
    compressed: 0,
    summary: {},
  };
}
