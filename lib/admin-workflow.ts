import {
  daysThrough,
  day,
  items,
  rankings,
  zoneAt,
  type Point,
  type Snapshot,
  type Waste,
} from "./model";

export type Rank = ReturnType<typeof rankings>[number];
export type Plan = {
  epoch: string;
  offers: Pick<Rank, "requests" | "reports">;
  req: string[];
  rep: string[];
  name: string;
  point: Point | null;
  manualTypes: Waste[] | null;
};
export function startPlan(rank: Rank, epoch: string): Plan {
  return {
    epoch,
    offers: { requests: rank.requests, reports: rank.reports },
    req: rank.requests.map((r) => r.id),
    rep: rank.reports.map((r) => r.id),
    name: "",
    point: null,
    manualTypes: null,
  };
}
export function reviewPlan(plan: Plan, rank: Rank) {
  const requests = rank.requests.filter((r) => plan.req.includes(r.id));
  const reports = rank.reports.filter((r) => plan.rep.includes(r.id));
  const requested = items.filter((t) =>
    requests.some((r) => r.requested_waste_types.includes(t)),
  );
  const reported = items.filter((t) => reports.some((r) => r.waste_type === t));
  const recommended = items.filter(
    (t) => requested.includes(t) || reported.includes(t),
  );
  const proposed = plan.manualTypes ?? recommended;
  const expired =
    requests.length !== plan.req.length || reports.length !== plan.rep.length;
  const valid =
    !expired &&
    !!(requests.length + reports.length) &&
    !!proposed.length &&
    proposed.every((t) => items.includes(t)) &&
    !!plan.name.trim() &&
    plan.name.trim().length <= 60 &&
    !!plan.point &&
    zoneAt(plan.point)?.id === rank.zone.id;
  return {
    requested,
    reported,
    recommended,
    proposed,
    expired,
    valid,
    missingRequested: requested.filter((t) => !proposed.includes(t)),
    missingReported: reported.filter((t) => !proposed.includes(t)),
    additional: proposed.filter((t) => !recommended.includes(t)),
  };
}
export function sevenDays(s: Snapshot) {
  return daysThrough(s.as_of).map((date) => ({
    date,
    reports: s.reports.filter((r) => day(r.created_at) === date).length,
    entries: s.readings.filter(
      (r) =>
        day(r.created_at) === date &&
        (r.previous_percent ?? 0) < 80 &&
        r.fill_percent >= 80,
    ).length,
  }));
}
