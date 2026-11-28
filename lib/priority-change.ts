import { day, daysThrough, rankings, type Snapshot } from "./model";

export function priorityChanges(before: Snapshot, after: Snapshot) {
  const changes = new Map<string, string>();
  if (before.epoch !== after.epoch) return changes;
  const oldRanks = new Map(rankings(before).map((r) => [r.zone.id, r]));
  const dates = daysThrough(after.as_of);
  for (const rank of rankings(after)) {
    const old = oldRanks.get(rank.zone.id)!;
    const delta = rank.score - old.score;
    if (!delta) continue;
    const reasons = new Map<string, number>();
    const add = (label: string) =>
      reasons.set(label, (reasons.get(label) ?? 0) + 1);
    let complete = true;
    for (const r of rank.requests)
      if (!old.requests.some((x) => x.id === r.id)) {
        if (!before.requests.some((x) => x.id === r.id)) add("설치 건의 접수");
        else complete = false;
      }
    for (const r of old.requests)
      if (!rank.requests.some((x) => x.id === r.id)) {
        const now = after.requests.find((x) => x.id === r.id);
        if (now?.status === "approved" || now?.status === "installed")
          add("건의 승인");
        else if (now?.status === "rejected") add("건의 반려");
        else complete = false;
      }
    for (const r of rank.reports)
      if (!old.reports.some((x) => x.id === r.id)) {
        if (!before.reports.some((x) => x.id === r.id)) add("포화 신고 접수");
        else complete = false;
      }
    for (const r of old.reports)
      if (!rank.reports.some((x) => x.id === r.id)) {
        if (after.reports.find((x) => x.id === r.id)?.considered_batch_id)
          add("포화 신고 반영");
        else if (!dates.includes(day(r.created_at))) add("신고 집계 만료");
        else complete = false;
      }
    const summary =
      complete && reasons.size
        ? [...reasons].map(([label, n]) => label + " " + n + "건").join(", ")
        : "설치 우선순위 변경";
    changes.set(
      rank.zone.id,
      summary + " · " + (delta > 0 ? "+" : "") + delta + "점",
    );
  }
  return changes;
}
