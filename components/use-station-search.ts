"use client";
import { useState } from "react";
import {
  searchBins,
  searchIntent,
  stationOrder,
  type Bin,
  type Waste,
} from "@/lib/model";

export function useStationSearch(
  bins: Bin[],
  query: string,
  filter: Waste | null,
  selectedWaste: Waste | null,
) {
  const intent = searchIntent(query),
    context = filter ?? selectedWaste ?? intent.waste;
  const matches = searchBins(bins, query, filter);
  const key = JSON.stringify([intent.tokens, filter, context]);
  const [order, remember] = useState<{ key: string; ids: string[] }>({
    key: "",
    ids: [],
  });
  const ids = context
    ? stationOrder(matches, context, order.key === key ? order.ids : [])
    : [];
  if (
    order.key !== key ||
    ids.length !== order.ids.length ||
    ids.some((id, i) => id !== order.ids[i])
  )
    remember({ key, ids });
  const byId = new Map(matches.map((b) => [b.id, b]));
  return {
    filtered: context ? ids.map((id) => byId.get(id)!) : matches,
    context,
    intent,
  };
}
