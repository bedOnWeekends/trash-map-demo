"use client";
import { Suspense, useEffect, useRef, useReducer } from "react";
import { useSearchParams } from "next/navigation";
import type { Booth } from "@/lib/use-booth";
import { readIntent, type MapIntent } from "@/lib/student-navigation";
import type { Bin } from "@/lib/model";

type Props = {
  booth: Booth;
  active?: boolean;
  apply: (intent: MapIntent, bin?: Bin) => void;
};
function Receiver({ booth, active = true, apply }: Props) {
  const { data, refresh } = booth;
  const query = useSearchParams().toString();
  const retry = useRef<{ key: string; done: boolean } | null>(null);
  const [revision, recheck] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (
      !active ||
      url.pathname !== "/" ||
      url.searchParams.toString() !== query
    )
      return;
    const intent = readIntent(url.searchParams);
    if (!intent) {
      retry.current = null;
      return;
    }
    if (!data) return;
    const bin =
      intent.type === "bin"
        ? data.bins.find((b) => b.id === intent.id)
        : undefined;
    const key = data.epoch + query;
    if (intent.type === "bin" && !bin) {
      if (retry.current?.key !== key) {
        const attempt = { key, done: false };
        retry.current = attempt;
        void refresh().finally(() => {
          if (retry.current === attempt) {
            attempt.done = true;
            recheck();
          }
        });
      }
      if (!retry.current.done) return;
    }
    ["task", "item", "id"].forEach((k) => url.searchParams.delete(k));
    // Consume this history entry before changing UI. Back/forward cannot replay it.
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    retry.current = null;
    apply(intent, bin);
  }, [query, active, data, refresh, revision, apply]);
  return null;
}
export function MapIntentReceiver(props: Props) {
  return (
    <Suspense fallback={null}>
      <Receiver {...props} />
    </Suspense>
  );
}
