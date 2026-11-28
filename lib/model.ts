import zonesData from "./zones.json";
export const zones = [...zonesData].sort((a, b) => a.id.localeCompare(b.id));
export type Zone = (typeof zones)[number];
export type Point = { lat: number; lng: number };
export const items = [
  "general",
  "plastic",
  "paper",
  "can",
  "glass",
  "liquid",
] as const;
export type Waste = (typeof items)[number];
export const labels: Record<Waste, string> = {
  general: "일반쓰레기",
  plastic: "플라스틱·PET",
  paper: "종이",
  can: "캔",
  glass: "유리",
  liquid: "남은 음료",
};
export const stateLabels = {
  pending: "접수",
  reviewing: "검토 중",
  approved: "설치 예정",
  installed: "설치 완료",
  rejected: "반려",
};
export type RequestRow = Point & {
  id: string;
  zone_id: string;
  reason: string;
  requested_waste_types: Waste[];
  installed_bin_id?: string | null;
  status: keyof typeof stateLabels;
  created_at: string;
};
export type Bin = Point & {
  id: string;
  name: string;
  zone_id: string;
  location_description: string;
  waste_types: Waste[];
  source: string;
  fills: Partial<Record<Waste, number | null>>;
};
export type Report = Point & {
  id: string;
  bin_id: string;
  zone_id: string;
  waste_type: Waste;
  created_at: string;
  considered_batch_id: string | null;
};
export type Batch = Point & {
  id: string;
  zone_id: string;
  name: string;
  waste_types: Waste[];
  status: "approved" | "installed";
  priority_score_at_approval: number;
};
export type Reading = {
  previous_percent: number | null;
  fill_percent: number;
  created_at: string;
};
export type Snapshot = {
  epoch: string;
  version: number;
  as_of: string;
  bins: Bin[];
  requests: RequestRow[];
  reports: Report[];
  batches: Batch[];
  readings: Reading[];
};
export function zoneAt({ lat, lng }: Point) {
  return zones.find(({ polygon }) => {
    let inside = false;
    for (let i = 0; i < polygon.length; i++) {
      const [x, y] = polygon[i],
        [u, v] = polygon[(i + 1) % polygon.length];
      const dx = u - x,
        dy = v - y,
        length = dx * dx + dy * dy;
      const t = length
        ? Math.max(0, Math.min(1, ((lng - x) * dx + (lat - y) * dy) / length))
        : 0;
      if (Math.hypot(lng - x - t * dx, lat - y - t * dy) <= 1e-9) return true;
      if (y > lat !== v > lat && lng < x + ((lat - y) * dx) / dy)
        inside = !inside;
    }
    return inside;
  });
}
export const zoneName = (id: string) =>
  zones.find((z) => z.id === id)?.name ?? id;
export function fillState(n: number | null | undefined) {
  return n == null
    ? "정보 없음"
    : n < 50
      ? "여유"
      : n < 80
        ? "보통"
        : n < 100
          ? "혼잡"
          : "가득 참";
}
export const day = (date: string | number) =>
  new Date(new Date(date).getTime() + 9 * 3600000).toISOString().slice(0, 10);
export function daysThrough(now: string) {
  return Array.from({ length: 7 }, (_, i) =>
    day(new Date(now).getTime() - (6 - i) * 86400000),
  );
}
export const pending = (r: RequestRow) =>
  r.status === "pending" || r.status === "reviewing";
export function rankings(s: Snapshot) {
  const dates = daysThrough(s.as_of);
  return zones
    .map((zone) => {
      const requests = s.requests.filter(
        (r) => r.zone_id === zone.id && pending(r),
      );
      const reports = s.reports.filter(
        (r) =>
          r.zone_id === zone.id &&
          !r.considered_batch_id &&
          dates.includes(day(r.created_at)),
      );
      return {
        zone,
        requests,
        reports,
        score: 3 * requests.length + reports.length,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.requests.length - a.requests.length ||
        b.reports.length - a.reports.length ||
        a.zone.id.localeCompare(b.zone.id),
    );
}
export const timeText = (d: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));

const normalize = (value: string) =>
  value.normalize("NFKC").trim().toLowerCase();
const itemWords = new Map(
  items.flatMap((item) =>
    [item, ...normalize(labels[item]).split(/[·\s]+/)].map(
      (word) => [word, item] as const,
    ),
  ),
);
export function searchBins(bins: Bin[], query: string, filter: Waste | null) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  return bins.filter((bin) => {
    if (filter && !bin.waste_types.includes(filter)) return false;
    const fields = [
      bin.name,
      zoneName(bin.zone_id),
      bin.location_description,
      ...bin.waste_types.flatMap((item) => [labels[item], item]),
    ].map(normalize);
    return tokens.every((token) => {
      const item = itemWords.get(token);
      return item
        ? bin.waste_types.includes(item)
        : fields.some((field) => field.includes(token));
    });
  });
}
export function preferredItems(installed: Waste[], preferred?: Waste | null) {
  return preferred && installed.includes(preferred)
    ? [preferred, ...installed.filter((t) => t !== preferred)]
    : installed;
}
