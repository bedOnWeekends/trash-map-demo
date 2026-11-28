import { zones, type RequestRow, type Snapshot, type Bin } from "../lib/model";
export function boothFixture(): Snapshot {
  const date = "2026-11-24T06:00:00Z";
  const bin = (zoneId: string, name: string): Bin => {
    const { lat, lng } = zones.find((z) => z.id === zoneId)!;
    return {
      id: "bin-" + zoneId,
      name,
      zone_id: zoneId,
      lat,
      lng,
      location_description: "입구",
      source: "seed",
      waste_types: ["paper", "can"],
      fills: { paper: null, can: 70 },
    };
  };
  const bins = [bin("main", "본관 분리수거함"), bin("five", "5호관 수거함")];
  const request = (b: Bin, id: string): RequestRow => ({
    id,
    zone_id: b.zone_id,
    lat: b.lat,
    lng: b.lng,
    status: "pending",
    created_at: date,
    reason: b.name + " 옆 종이함",
    requested_waste_types: ["paper"],
  });
  return {
    epoch: "phase-two-test",
    version: 10,
    as_of: date,
    bins,
    requests: [request(bins[0], "r1"), request(bins[1], "r2")],
    reports: [
      {
        id: "s1",
        bin_id: bins[0].id,
        zone_id: "main",
        lat: bins[0].lat,
        lng: bins[0].lng,
        waste_type: "can",
        considered_batch_id: null,
        created_at: date,
      },
    ],
    readings: [{ fill_percent: 92, previous_percent: 60, created_at: date }],
    batches: [],
  };
}
