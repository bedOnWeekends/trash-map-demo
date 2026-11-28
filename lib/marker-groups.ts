// Coordinates are CSS pixels at the marker's bottom-centre anchor. Pan translates
// every anchor equally, so only projection scale or membership can change collisions.
export const markerHitSize = 48;
export function groupMarkers<T extends { id: string }>(
  markers: T[],
  project: (m: T) => { x: number; y: number },
  size = markerHitSize,
) {
  const clusters: { members: T[]; points: { x: number; y: number }[] }[] = [];
  for (const marker of markers) {
    const point = project(marker);
    const merged = { members: [marker], points: [point] };
    for (let i = clusters.length - 1; i >= 0; i--) {
      const cluster = clusters[i];
      if (
        cluster.points.some(
          (p) =>
            Math.abs(p.x - point.x) < size && Math.abs(p.y - point.y) < size,
        )
      ) {
        merged.members.push(...cluster.members);
        merged.points.push(...cluster.points);
        clusters.splice(i, 1);
      }
    }
    clusters.push(merged);
  }
  return clusters.map(({ members }) => {
    members.sort((a, b) => a.id.localeCompare(b.id));
    const ids = members.map((m) => m.id);
    return {
      id: ids.length === 1 ? ids[0] : "group:" + JSON.stringify(ids),
      members,
      anchor: members[0],
    };
  });
}
