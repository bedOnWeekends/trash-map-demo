import { items, type Waste } from "./model";

export type MapIntent =
  | { type: "filter"; waste: Waste }
  | { type: "request" }
  | { type: "bin"; id: string }
  | { type: "invalid" };

export function mapHref(intent: Exclude<MapIntent, { type: "invalid" }>) {
  const params = new URLSearchParams({ task: intent.type });
  if (intent.type === "filter") params.set("item", intent.waste);
  if (intent.type === "bin") params.set("id", intent.id);
  return "/?" + params;
}

export function readIntent(params: URLSearchParams): MapIntent | null {
  const task = params.get("task");
  if (task === null) return null;
  if (task === "request") return { type: "request" };
  const waste = items.find((t) => t === params.get("item"));
  if (task === "filter" && waste) return { type: "filter", waste };
  const id = params.get("id");
  if (
    task === "bin" &&
    id &&
    /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)
  )
    return { type: "bin", id };
  return { type: "invalid" };
}
